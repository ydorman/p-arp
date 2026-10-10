#pragma once

#include <cstdint>
#include <span>
#include <vector>

namespace parp
{

// A MIDI event inside one audio block. Plugin-format neutral: the JUCE layer converts to and
// from juce::MidiBuffer.
struct MidiEvent
{
    enum class Type : std::uint8_t { NoteOn, NoteOff, Other };

    Type type = Type::Other;
    int sampleOffset = 0;   // position within the block, 0 .. numSamples - 1
    int channel = 1;        // 1..16
    int note = 0;           // 0..127
    int velocity = 0;       // 0..127 (NoteOff: release velocity)
    std::uint8_t raw[3] {}; // original bytes for Type::Other (passed through untouched)
    int rawSize = 0;
};

// Host transport for one audio block (from the plugin host's play head).
struct Transport
{
    bool playing = false;
    double bpm = 120.0;
    double ppqAtBlockStart = 0.0; // quarter notes since song start (Logic beat 1 = ppq 0)
    int timeSigNumerator = 4;
    int timeSigDenominator = 4;
    bool looping = false;
    double loopStartPpq = 0.0;
    double loopEndPpq = 0.0;
};

// Snapshot of engine state for the UI (read from the UI thread via the plugin layer).
struct EngineStatus
{
    int noteOnsIn = 0;
    int noteOnsOut = 0;
};

// The arpeggiator engine. Step 1 of the port: a pass-through with the final interface; the
// Scripter engine (series, patterns, scheduler) is ported into this class step by step, with
// its Node tests ported alongside as the behavioral spec.
//
// Real-time rules: process() must not allocate, lock or block. Call prepare() (which may
// allocate) before processing starts and whenever the sample rate or block size changes.
class Engine
{
public:
    void prepare (double sampleRate, int maxBlockSize);
    void reset();

    // Process one block: `in` holds the block's incoming events sorted by sampleOffset; generated
    // events are appended to `out` (which the caller clears; capacity is reserved by prepare()).
    void process (const Transport& transport, int numSamples,
                  std::span<const MidiEvent> in, std::vector<MidiEvent>& out);

    EngineStatus status() const { return currentStatus; }

    // Capacity callers should reserve for `out` (max events one block can produce)
    static constexpr int maxEventsPerBlock = 512;

private:
    double sampleRate = 44100.0;
    int maxBlockSize = 512;
    EngineStatus currentStatus;
};

} // namespace parp
