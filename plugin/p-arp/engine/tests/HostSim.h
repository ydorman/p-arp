#pragma once

// Simulated plugin host for engine tests (the C++ counterpart of tests/scripter_mock.js):
// runs the engine block by block, delivers notes at beat positions, loops (optionally with blocks
// straddling the loop end), and records every output event with its beat and loop pass.
//
// 48 kHz at 120 BPM = 24000 samples per beat, so grid positions (1.5, 1.75, triplet thirds...) fall
// on whole samples and expected beats compare exactly. The playhead is kept in whole samples.

#include <algorithm>
#include <cmath>
#include <functional>
#include <map>
#include <vector>
#include "parp/Engine.h"

namespace parp_test
{

struct OutNote
{
    parp::MidiEvent::Type type;
    double beat;
    int pitch;
    int velocity;
    int pass; // loop wraps before this event
};

struct NotePair
{
    int pitch;
    double on;
    double off;
    int velocity;
};

class HostSim
{
public:
    static constexpr double sampleRate = 48000.0;
    static constexpr double bpm = 120.0;
    static constexpr double samplesPerBeat = sampleRate * 60.0 / bpm; // 24000

    explicit HostSim (const parp::Settings& settings = {}, std::uint64_t seed = 1) : engine (seed)
    {
        engine.setSettings (settings);
        engine.prepare (sampleRate, 4096);
        out.reserve ((size_t) parp::Engine::maxEventsPerBlock);
    }

    parp::Engine engine;
    std::vector<OutNote> events;

    // Logic beat at the next block start
    double position() const { return 1.0 + double (positionSamples) / samplesPerBeat; }

    void noteOn (int pitch, int velocity = 100) { noteOnAt (pitch, velocity, position()); }
    void noteOff (int pitch) { noteOffAt (pitch, position()); }

    // Queued until the block containing `beat` (a beat already passed -> start of the next block)
    void noteOnAt (int pitch, int velocity, double beat) { queue (parp::MidiEvent::Type::NoteOn, pitch, velocity, beat); }
    void noteOffAt (int pitch, double beat) { queue (parp::MidiEvent::Type::NoteOff, pitch, 0, beat); }

    void change (const std::function<void (parp::Settings&)>& edit)
    {
        auto s = engine.settings();
        edit (s);
        engine.setSettings (s);
    }

    void setCycle (double left, double right, bool straddle = false)
    {
        cycling = true;
        leftBeat = left;
        rightBeat = right;
        straddleLoopEnd = straddle;
    }

    void locate (double beat) { positionSamples = (long long) std::llround ((beat - 1.0) * samplesPerBeat); }

    // Play `beats` (blocks of blockSize samples; the last block ends exactly at the target)
    void play (double beats, int blockSize = 512)
    {
        playing = true;
        long long remaining = std::llround (beats * samplesPerBeat);
        while (remaining > 0)
        {
            int n = (int) std::min<long long> (blockSize, remaining);
            if (cycling && ! straddleLoopEnd)
            {
                const long long toLoopEnd = beatToSamples (rightBeat) - positionSamples;
                if (toLoopEnd > 0)
                    n = (int) std::min<long long> (n, toLoopEnd);
            }
            runBlock (n);
            remaining -= n;
            if (cycling && positionSamples >= beatToSamples (rightBeat))
            {
                const long long over = straddleLoopEnd ? positionSamples - beatToSamples (rightBeat) : 0;
                positionSamples = beatToSamples (leftBeat) + over;
                ++pass;
            }
        }
    }

    void stop (int blockSize = 512)
    {
        playing = false;
        runBlock (blockSize);
    }

    std::vector<OutNote> noteOns() const { return filter (parp::MidiEvent::Type::NoteOn); }
    std::vector<OutNote> noteOffs() const { return filter (parp::MidiEvent::Type::NoteOff); }

    // Pair each NoteOn with the next NoteOff of the same pitch (per loop pass); unmatched NoteOns
    // are stuck notes
    std::vector<NotePair> pairs (std::vector<OutNote>* unmatched = nullptr) const
    {
        std::vector<NotePair> result;
        std::map<std::pair<int, int>, std::vector<OutNote>> open; // (pass, pitch) -> NoteOns
        std::vector<OutNote> sorted = events;
        std::stable_sort (sorted.begin(), sorted.end(), [] (const OutNote& a, const OutNote& b) {
            return a.pass != b.pass ? a.pass < b.pass : a.beat < b.beat;
        });
        for (const auto& e : sorted)
        {
            auto& list = open[{ e.pass, e.pitch }];
            if (e.type == parp::MidiEvent::Type::NoteOn)
                list.push_back (e);
            else if (! list.empty())
            {
                result.push_back ({ e.pitch, list.front().beat, e.beat, list.front().velocity });
                list.erase (list.begin());
            }
            else
            {
                // A note-off right after a wrap can close a note from the previous pass
                auto& previous = open[{ e.pass - 1, e.pitch }];
                if (! previous.empty())
                {
                    result.push_back ({ e.pitch, previous.front().beat, e.beat, previous.front().velocity });
                    previous.erase (previous.begin());
                }
            }
        }
        if (unmatched != nullptr)
            for (const auto& [key, list] : open)
                unmatched->insert (unmatched->end(), list.begin(), list.end());
        return result;
    }

private:
    struct Queued
    {
        parp::MidiEvent::Type type;
        int pitch;
        int velocity;
        double beat;
    };

    static long long beatToSamples (double beat) { return (long long) std::llround ((beat - 1.0) * samplesPerBeat); }

    void queue (parp::MidiEvent::Type type, int pitch, int velocity, double beat) { pending.push_back ({ type, pitch, velocity, beat }); }

    std::vector<OutNote> filter (parp::MidiEvent::Type type) const
    {
        std::vector<OutNote> result;
        for (const auto& e : events)
            if (e.type == type)
                result.push_back (e);
        return result;
    }

    void runBlock (int numSamples)
    {
        parp::Transport transport;
        transport.playing = playing;
        transport.bpm = bpm;
        transport.ppqAtBlockStart = double (positionSamples) / samplesPerBeat;
        transport.looping = cycling;
        transport.loopStartPpq = leftBeat - 1.0;
        transport.loopEndPpq = rightBeat - 1.0;

        // Incoming notes due in this block, at their sample offsets (late ones at the start)
        const long long blockEnd = positionSamples + numSamples;
        std::vector<parp::MidiEvent> in;
        for (auto it = pending.begin(); it != pending.end();)
        {
            const long long at = beatToSamples (it->beat);
            if (at < blockEnd)
            {
                parp::MidiEvent e;
                e.type = it->type;
                e.note = it->pitch;
                e.velocity = it->velocity;
                e.sampleOffset = (int) std::clamp<long long> (at - positionSamples, 0, numSamples - 1);
                in.push_back (e);
                it = pending.erase (it);
            }
            else
                ++it;
        }
        std::stable_sort (in.begin(), in.end(), [] (const auto& a, const auto& b) { return a.sampleOffset < b.sampleOffset; });

        out.clear();
        engine.process (transport, numSamples, in, out);
        for (const auto& e : out)
            events.push_back ({ e.type, 1.0 + double (positionSamples + e.sampleOffset) / samplesPerBeat, e.note, e.velocity, pass });

        if (playing)
            positionSamples += numSamples;
    }

    std::vector<parp::MidiEvent> out;
    std::vector<Queued> pending;
    long long positionSamples = 0;
    bool playing = false;
    bool cycling = false;
    bool straddleLoopEnd = false;
    double leftBeat = 1.0;
    double rightBeat = 5.0;
    int pass = 0;
};

inline std::vector<double> beatsOf (const std::vector<OutNote>& notes)
{
    std::vector<double> result;
    for (const auto& n : notes)
        result.push_back (n.beat);
    return result;
}

inline std::vector<int> pitchesOf (const std::vector<OutNote>& notes)
{
    std::vector<int> result;
    for (const auto& n : notes)
        result.push_back (n.pitch);
    return result;
}

inline std::vector<int> velocitiesOf (const std::vector<OutNote>& notes)
{
    std::vector<int> result;
    for (const auto& n : notes)
        result.push_back (n.velocity);
    return result;
}

inline std::vector<OutNote> before (const std::vector<OutNote>& notes, double beat)
{
    std::vector<OutNote> result;
    for (const auto& n : notes)
        if (n.beat < beat - 1e-9)
            result.push_back (n);
    return result;
}

inline double r4 (double x)
{
    return std::round (x * 1e4) / 1e4;
}

inline std::vector<double> r4 (std::vector<double> values)
{
    for (auto& v : values)
        v = r4 (v);
    return values;
}

} // namespace parp_test
