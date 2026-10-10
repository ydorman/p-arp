// Scheduler tests, ported from the Scripter prototype's Node playback tests
// (tests/progressive_arp.test.js): same scenarios and expected beats/pitches/velocities.
// Where the plugin legitimately differs from Scripter the test is adapted and says why.

#include <random>
#include <set>
#include "HostSim.h"
#include "TestHarness.h"

using namespace parp;
using namespace parp_test;

namespace
{
using Vec = std::vector<int>;
using Beats = std::vector<double>;

int rate (const char* name)
{
    return rateIndex (name);
}

// A plain 1-octave Up arpeggiator at 1/8 notes, with no modulation active
Settings plain()
{
    Settings s;
    s.pattern = Pattern::Up;
    s.baseOctave = 1;
    s.baseRate = rate ("1/8");
    s.gate = 80;
    return s;
}

template <typename Edit>
Settings plainWith (Edit edit)
{
    auto s = plain();
    edit (s);
    return s;
}

void playChord (HostSim& host, const Vec& notes, int velocity = 100)
{
    for (int p : notes)
        host.noteOn (p, velocity);
}

const Vec CEG { 60, 64, 67 };
} // namespace

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

TEST_CASE ("quantizeBeatToGrid: keeps on-grid beats, tolerates noise, snaps forward")
{
    CHECK_EQ (quantizeBeatToGrid (1.0, 0.5), 1.0);
    CHECK_EQ (quantizeBeatToGrid (2.5, 0.5), 2.5);
    CHECK_EQ (quantizeBeatToGrid (2.5000001, 0.5), 2.5);
    CHECK_EQ (quantizeBeatToGrid (2.4999999, 0.5), 2.5);
    CHECK_EQ (quantizeBeatToGrid (2.1, 0.5), 2.5);
    CHECK_EQ (quantizeBeatToGrid (3.25, 0.5), 3.5);
    CHECK_EQ (quantizeBeatToGrid (1.01, 2.0), 3.0);
}

TEST_CASE ("swingTiming splits each pair of steps swing : (100 - swing)")
{
    const auto t = [] (bool off, double swing) {
        const auto r = swingTiming (off, 0.5, swing);
        return Beats { r.offset, r.length };
    };
    CHECK_EQ (t (false, 50), (Beats { 0, 0.5 }));
    CHECK_EQ (t (true, 50), (Beats { 0, 0.5 }));
    CHECK_EQ (t (false, 75), (Beats { 0, 0.75 }));
    CHECK_EQ (t (true, 75), (Beats { 0.25, 0.25 }));
}

// ---------------------------------------------------------------------------------------------
// playback
// ---------------------------------------------------------------------------------------------

TEST_CASE ("playback: plays the pattern on the 1/8 grid with the configured gate")
{
    HostSim host (plain());
    playChord (host, CEG, 90);
    host.play (2);
    const auto ons = before (host.noteOns(), 3);
    CHECK_EQ (beatsOf (ons), (Beats { 1, 1.5, 2, 2.5 }));
    CHECK_EQ (pitchesOf (ons), (Vec { 60, 64, 67, 60 }));
    CHECK_EQ (velocitiesOf (ons), (Vec { 90, 90, 90, 90 }));
    for (const auto& p : host.pairs())
        CHECK (std::abs (p.off - p.on - 0.4) < 1e-9);
}

TEST_CASE ("playback: produces nothing with no notes held")
{
    HostSim host (plain());
    host.play (2);
    CHECK_EQ (host.events.size(), size_t (0));
}

TEST_CASE ("playback: releasing the chord stops sounding notes immediately")
{
    HostSim host (plain());
    host.noteOn (60);
    host.play (0.1); // NoteOn at 1.0, NoteOff due at 1.4
    host.noteOff (60);
    host.play (2);
    const auto offs = host.noteOffs();
    REQUIRE_EQ (offs.size(), size_t (1));
    CHECK (offs[0].beat < 1.4); // immediate, not the scheduled one
    CHECK_EQ (host.noteOns().size(), size_t (1)); // no new notes after release
}

TEST_CASE ("playback: stopping the transport only sends note-offs for notes still sounding")
{
    HostSim ended (plainWith ([] (Settings& s) { s.gate = 50; }));
    ended.noteOn (60);
    ended.play (0.3); // note 1.0 - 1.25 already ended
    ended.stop();
    CHECK_EQ (ended.noteOffs().size(), size_t (1));

    // Adapted: Scripter also let Logic deliver the already-scheduled note-off later (2 in the
    // prototype); the plugin owns its note-off queue, so a sounding note gets exactly one, at stop
    HostSim sounding (plainWith ([] (Settings& s) { s.gate = 50; }));
    sounding.noteOn (60);
    sounding.play (0.1);
    sounding.stop();
    const auto offs = sounding.noteOffs();
    REQUIRE_EQ (offs.size(), size_t (1));
    CHECK (std::abs (offs[0].beat - 1.1) < 1e-9);
}

TEST_CASE ("playback: clips notes at the cycle end and keeps playing after the wrap")
{
    HostSim host (plainWith ([] (Settings& s) { s.gate = 100; }));
    host.setCycle (1, 3);
    playChord (host, CEG);
    host.play (8); // four passes through the 2-beat cycle
    for (const auto& off : host.noteOffs())
        CHECK (off.beat < 3);
    CHECK_EQ (host.noteOns().size(), size_t (16));
    CHECK (host.noteOffs().size() >= host.noteOns().size());
}

TEST_CASE ("playback: timing does not depend on the audio block size")
{
    const auto settings = plainWith ([] (Settings& s) {
        s.rateActive = true;
        s.baseRate = rate ("1/16");
        s.rateSpreadDown = 2;
        s.rateSpreadUp = 2;
        s.shape = Shape::UpDown;
        s.advanceTrigger = AdvanceTrigger::NoteStep;
    });
    std::vector<Beats> runs;
    std::vector<Vec> pitchRuns;
    for (int blockSize : { 512, 64, 1000, 4096 })
    {
        HostSim host (settings);
        playChord (host, CEG);
        host.play (16, blockSize);
        const auto ons = before (host.noteOns(), 16);
        runs.push_back (beatsOf (ons));
        pitchRuns.push_back (pitchesOf (ons));
    }
    for (size_t i = 1; i < runs.size(); ++i)
    {
        CHECK_EQ (runs[i], runs[0]);
        CHECK_EQ (pitchRuns[i], pitchRuns[0]);
    }
}

TEST_CASE ("playback: leaves no stuck notes across modulated settings")
{
    const std::vector<std::function<void (Settings&)>> variants {
        [] (Settings& s) { s.octaveActive = true; s.advanceTrigger = AdvanceTrigger::NoteStep; s.shape = Shape::UpDown; },
        [] (Settings& s) { s.rateActive = true; s.rateSpreadUp = 3; s.shape = Shape::Down; },
        [] (Settings& s) { s.octaveActive = true; s.rateActive = true; s.velocityActive = true; s.pattern = Pattern::Random; s.gate = 100; },
        [] (Settings& s) { s.patternActive = true; s.patternSpreadUp = 2; s.advanceTrigger = AdvanceTrigger::NoteStep; s.shape = Shape::UpDown; },
        [] (Settings& s) { s.patternActive = true; s.gateActive = true; s.octaveActive = true; s.rateActive = true; s.gate = 90; },
    };
    for (const auto& v : variants)
    {
        HostSim host (plainWith (v));
        playChord (host, CEG);
        host.play (12);
        host.stop();
        std::vector<OutNote> unmatched;
        host.pairs (&unmatched);
        CHECK_EQ (unmatched.size(), size_t (0));
    }
}

TEST_CASE ("playback: at the same sample a note-off comes before the next note-on")
{
    HostSim host (plainWith ([] (Settings& s) { s.gate = 100; }));
    host.noteOn (60); // one pitch, gate 100%: each note ends exactly where the next starts
    host.play (2);
    for (size_t i = 1; i < host.events.size(); ++i)
        if (host.events[i].beat == host.events[i - 1].beat)
            CHECK (host.events[i - 1].type == MidiEvent::Type::NoteOff && host.events[i].type == MidiEvent::Type::NoteOn);
    std::vector<OutNote> unmatched;
    host.pairs (&unmatched);
    CHECK_EQ (unmatched.size(), size_t (1)); // only the last note, still sounding
}

// ---------------------------------------------------------------------------------------------
// series modulation during playback
// ---------------------------------------------------------------------------------------------

TEST_CASE ("modulation: octave range grows per arp cycle (Up shape)")
{
    HostSim host (plainWith ([] (Settings& s) { s.octaveActive = true; s.octaveSpreadDown = 0; s.octaveSpreadUp = 1; s.shape = Shape::Up; }));
    playChord (host, CEG);
    host.play (6);
    CHECK_EQ (pitchesOf (before (host.noteOns(), 7)), (Vec { 60, 64, 67, 60, 64, 67, 72, 76, 79, 60, 64, 67 }));
}

TEST_CASE ("modulation: Snap to Grid, rate speeds up per cycle, each note on its rate's grid")
{
    HostSim host (plainWith ([] (Settings& s) { s.rateActive = true; s.rateSpreadDown = 0; s.rateSpreadUp = 1; s.shape = Shape::Up; }));
    playChord (host, CEG);
    host.play (4);
    // 1/8 x3 | 1/16 x3 | back to 1/8 (snapped forward from 3.25 to 3.5)
    CHECK_EQ (beatsOf (before (host.noteOns(), 5)), (Beats { 1, 1.5, 2, 2.5, 2.75, 3, 3.5, 4, 4.5 }));
}

TEST_CASE ("modulation: Flow, rate speeds up without gaps, realigning to the beat each pass")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.timing = TimingMode::Flow;
        s.rateActive = true;
        s.rateSpreadDown = 0;
        s.rateSpreadUp = 1;
        s.shape = Shape::Up;
    }));
    playChord (host, CEG);
    host.play (5);
    CHECK_EQ (beatsOf (before (host.noteOns(), 5.5)), (Beats { 1, 1.5, 2, 2.5, 2.75, 3, 4, 4.5, 5 }));
}

TEST_CASE ("modulation: velocity walks its 9 steps per note (Up shape)")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.velocityActive = true;
        s.velocity = 70;
        s.velocitySpreadDown = 25;
        s.velocitySpreadUp = 25;
        s.advanceTrigger = AdvanceTrigger::NoteStep;
        s.shape = Shape::Up;
    }));
    host.noteOn (60);
    host.play (5);
    CHECK_EQ (velocitiesOf (before (host.noteOns(), 6)), (Vec { 45, 51, 57, 64, 70, 76, 83, 89, 95, 45 }));
}

TEST_CASE ("modulation: pattern alternates per arp cycle (Up shape)")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.pattern = Pattern::Up;
        s.patternActive = true;
        s.patternSpreadDown = 0;
        s.patternSpreadUp = 1;
        s.shape = Shape::Up;
    }));
    playChord (host, CEG);
    host.play (4.5);
    CHECK_EQ (pitchesOf (before (host.noteOns(), 5.5)), (Vec { 60, 64, 67, 67, 64, 60, 60, 64, 67 }));
}

TEST_CASE ("modulation: pattern advances only at cycle end even with Per Note Step")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.pattern = Pattern::Up;
        s.patternActive = true;
        s.patternSpreadDown = 0;
        s.patternSpreadUp = 1;
        s.velocityActive = true;
        s.advanceTrigger = AdvanceTrigger::NoteStep;
        s.shape = Shape::Up;
    }));
    playChord (host, CEG);
    host.play (4.5);
    const auto ons = before (host.noteOns(), 5.5);
    CHECK_EQ (pitchesOf (ons), (Vec { 60, 64, 67, 67, 64, 60, 60, 64, 67 }));
    CHECK_EQ (velocitiesOf (ons), (Vec { 45, 51, 57, 64, 70, 76, 83, 89, 95 }));
}

TEST_CASE ("modulation: gate length walks its 9 steps per note (Up shape)")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.gate = 80;
        s.gateActive = true;
        s.gateSpreadDown = 40;
        s.gateSpreadUp = 20;
        s.advanceTrigger = AdvanceTrigger::NoteStep;
        s.shape = Shape::Up;
    }));
    host.noteOn (60);
    host.play (5);
    Beats lengths;
    for (const auto& p : host.pairs())
        if (p.on < 5.75)
            lengths.push_back (std::round ((p.off - p.on) * 1e6) / 1e6);
    CHECK_EQ (lengths, (Beats { 0.2, 0.25, 0.3, 0.35, 0.4, 0.425, 0.45, 0.475, 0.5, 0.2 }));
}

TEST_CASE ("modulation: shorter velocity walk with 2 steps per side")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.velocityActive = true;
        s.velocity = 70;
        s.velocitySpreadDown = 24;
        s.velocitySpreadUp = 24;
        s.velocitySteps = 2;
        s.advanceTrigger = AdvanceTrigger::NoteStep;
        s.shape = Shape::Up;
    }));
    host.noteOn (60);
    host.play (3);
    CHECK_EQ (velocitiesOf (before (host.noteOns(), 4)), (Vec { 46, 58, 70, 82, 94, 46 }));
}

TEST_CASE ("modulation: linked octave and velocity during playback")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.baseOctave = 1;
        s.octaveActive = true;
        s.octaveSpreadDown = 0;
        s.octaveSpreadUp = 2;
        s.velocityActive = true;
        s.velocitySpreadDown = 25;
        s.velocitySpreadUp = 25;
        s.link = LinkMode::SharedPhase;
        s.shape = Shape::Up;
        s.velocity = 70;
    }));
    host.noteOn (60);
    host.play (5);
    Vec distinct;
    for (int v : velocitiesOf (host.noteOns()))
        if (distinct.empty() || distinct.back() != v)
            distinct.push_back (v);
    distinct.resize (std::min<size_t> (5, distinct.size()));
    CHECK_EQ (distinct, (Vec { 45, 51, 57, 64, 70 }));
}

TEST_CASE ("modulation: plays the custom curve per note")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.velocity = 70;
        s.velocityActive = true;
        s.velocitySpreadDown = 24;
        s.velocitySpreadUp = 24;
        s.curve = Curve::Custom;
        s.customLength = 4;
        s.customSteps = { 1, 5, 6, 8, 2, 3, 4, 7 };
        s.shape = Shape::Up;
        s.advanceTrigger = AdvanceTrigger::NoteStep;
    }));
    host.noteOn (60);
    host.play (3.9);
    CHECK_EQ (velocitiesOf (host.noteOns()), (Vec { 46, 76, 82, 94, 46, 76, 82, 94 }));
}

TEST_CASE ("modulation: octave Range vs Transpose during playback (the reported case)")
{
    const auto play = [] (OctaveMode mode) {
        HostSim host (plainWith ([mode] (Settings& s) {
            s.pattern = Pattern::AsPlayed;
            s.baseRate = rateIndex ("1/16");
            s.octaveActive = true;
            s.octaveSpreadDown = 0;
            s.octaveSpreadUp = 1;
            s.octaveMode = mode;
        }));
        playChord (host, { 55, 60, 62, 64 });
        host.play (2.9);
        return pitchesOf (host.noteOns());
    };
    CHECK_EQ (play (OctaveMode::Range), (Vec { 55, 60, 62, 64, 55, 60, 62, 64, 67, 72, 74, 76 }));
    CHECK_EQ (play (OctaveMode::Transpose), (Vec { 55, 60, 62, 64, 67, 72, 74, 76, 55, 60, 62, 64 }));
}

// ---------------------------------------------------------------------------------------------
// swing
// ---------------------------------------------------------------------------------------------

TEST_CASE ("swing: a chord started on an off-beat grid line plays it as the off-beat")
{
    HostSim host (plainWith ([] (Settings& s) { s.swing = 75; }));
    host.play (0.6);
    host.noteOn (60); // at ~1.6
    host.play (2);
    CHECK_EQ (beatsOf (before (host.noteOns(), 3.5)), (Beats { 2, 2.75, 3 }));
}

TEST_CASE ("swing: delays off-beat notes and keeps gate relative to the swung slot")
{
    HostSim host (plainWith ([] (Settings& s) { s.swing = 75; s.gate = 100; }));
    host.noteOn (60);
    host.play (2.1); // past 3.0, so the note-off due there has been sent
    std::vector<Beats> notes;
    for (const auto& p : host.pairs())
        if (p.on < 3)
            notes.push_back ({ p.on, p.off });
    CHECK_EQ (notes.size(), size_t (4));
    const std::vector<Beats> expected { { 1, 1.75 }, { 1.75, 2 }, { 2, 2.75 }, { 2.75, 3 } };
    for (size_t i = 0; i < std::min (notes.size(), expected.size()); ++i)
        CHECK_EQ (notes[i], expected[i]);
}

TEST_CASE ("swing: swings pairs at the current subdivision")
{
    HostSim host (plainWith ([] (Settings& s) { s.baseRate = rateIndex ("1/16"); s.swing = 75; }));
    host.noteOn (60);
    host.play (1);
    CHECK_EQ (beatsOf (before (host.noteOns(), 2)), (Beats { 1, 1.375, 1.5, 1.875 }));
}

TEST_CASE ("swing: a series target with configurable steps, clamped to 50..75%")
{
    Settings s;
    s.swing = 50;
    s.swingActive = true;
    s.swingSpreadDown = 0;
    s.swingSpreadUp = 24;
    s.swingSteps = 4;
    const auto b = seriesBounds (SeriesId::Swing, s);
    CHECK_EQ ((Vec { b.minPos, b.maxPos }), (Vec { 0, 4 }));
    Vec values;
    for (int pos = 0; pos <= 4; ++pos)
        values.push_back (seriesValueAt (SeriesId::Swing, pos, s));
    CHECK_EQ (values, (Vec { 50, 56, 62, 68, 74 }));
    s.swing = 70;
    s.swingSpreadDown = 25;
    s.swingSpreadUp = 25;
    CHECK_EQ (seriesValueAt (SeriesId::Swing, 4, s), 75);
    CHECK_EQ (seriesValueAt (SeriesId::Swing, -4, s), 50);
}

TEST_CASE ("swing: never schedules a swung note past the cycle end")
{
    HostSim host (plainWith ([] (Settings& s) { s.swing = 75; s.gate = 100; }));
    host.setCycle (1, 2.75); // the off-beat at grid 2.5 swings to 2.75 = loop end: skipped
    host.noteOn (60);
    host.play (6);
    host.stop(); // ends the notes still sounding (their note-offs are queued, not yet sent)
    for (const auto& e : host.events)
        CHECK (e.beat < 2.75);
    CHECK (host.noteOffs().size() >= host.noteOns().size());
}

TEST_CASE ("swing: timing with swing does not depend on the audio block size")
{
    const auto settings = plainWith ([] (Settings& s) {
        s.swing = 62;
        s.swingActive = true;
        s.swingSpreadUp = 12;
        s.rateActive = true;
        s.rateSpreadUp = 1;
        s.advanceTrigger = AdvanceTrigger::NoteStep;
    });
    std::vector<Beats> runs;
    for (int blockSize : { 512, 100, 3000 })
    {
        HostSim host (settings);
        playChord (host, CEG);
        host.play (12, blockSize);
        runs.push_back (beatsOf (before (host.noteOns(), 12)));
    }
    CHECK_EQ (runs[1], runs[0]);
    CHECK_EQ (runs[2], runs[0]);
}

TEST_CASE ("swing: a swung note is not left queued when the chord is released before it starts")
{
    HostSim host (plainWith ([] (Settings& s) { s.swing = 75; }));
    host.noteOn (60);
    host.play (0.55); // the off-beat on the 1.5 grid line is swung to 1.75
    host.noteOffAt (60, 1.55);
    host.play (1);
    for (const auto& n : host.noteOns())
        CHECK (n.beat < 1.55);
}

// ---------------------------------------------------------------------------------------------
// humanize
// ---------------------------------------------------------------------------------------------

TEST_CASE ("humanize: does nothing (and draws no random numbers) when set to 0")
{
    HostSim host (plain());
    host.noteOn (60, 90);
    host.play (2);
    for (int v : velocitiesOf (host.noteOns()))
        CHECK_EQ (v, 90);
    Random fresh (1);
    CHECK_EQ (host.engine.random().next(), fresh.next()); // the engine's generator was never used
}

TEST_CASE ("humanize: varies velocity within +/- the amount")
{
    HostSim host (plainWith ([] (Settings& s) { s.humanizeVelocity = 10; }), 7);
    host.noteOn (60, 100);
    host.play (16);
    const auto velocities = velocitiesOf (host.noteOns());
    for (int v : velocities)
        CHECK (v >= 90 && v <= 110);
    CHECK (std::set<int> (velocities.begin(), velocities.end()).size() > 5);
}

TEST_CASE ("humanize: velocity humanize applies on top of the series, clamped to 1..127")
{
    HostSim high (plainWith ([] (Settings& s) {
        s.velocityActive = true;
        s.velocity = 120;
        s.velocitySpreadDown = 0;
        s.velocitySpreadUp = 0;
        s.humanizeVelocity = 40;
    }));
    high.noteOn (60);
    high.play (8);
    const auto velocities = velocitiesOf (high.noteOns());
    CHECK (*std::max_element (velocities.begin(), velocities.end()) == 127); // clamped at the top
    for (int v : velocities)
        CHECK (v >= 80 && v <= 127);

    HostSim low (plainWith ([] (Settings& s) { s.humanizeVelocity = 40; }));
    low.noteOn (60, 20);
    low.play (8);
    const auto lows = velocitiesOf (low.noteOns());
    CHECK (*std::min_element (lows.begin(), lows.end()) == 1); // clamped at the bottom
}

TEST_CASE ("humanize: varies note length within +/- the amount, clamped to the step")
{
    HostSim host (plainWith ([] (Settings& s) { s.gate = 80; s.humanizeGate = 40; }), 11);
    host.noteOn (60);
    host.play (16);
    Beats lengths;
    for (const auto& p : host.pairs())
    {
        CHECK (p.off - p.on <= 0.5 + 1e-9); // gate never exceeds 100%
        CHECK (p.off - p.on >= 0.5 * 0.40 - 1e-9);
        lengths.push_back (p.off - p.on);
    }
    CHECK (std::set<double> (lengths.begin(), lengths.end()).size() > 5);
}

TEST_CASE ("humanize: no stuck notes with swing and humanize together")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.swing = 70;
        s.humanizeVelocity = 20;
        s.humanizeGate = 30;
        s.gate = 90;
        s.octaveActive = true;
        s.rateActive = true;
        s.advanceTrigger = AdvanceTrigger::NoteStep;
    }), 3);
    playChord (host, CEG);
    host.play (12);
    host.stop();
    std::vector<OutNote> unmatched;
    host.pairs (&unmatched);
    CHECK_EQ (unmatched.size(), size_t (0));
}

// ---------------------------------------------------------------------------------------------
// chord restart and grid alignment
// ---------------------------------------------------------------------------------------------

namespace
{
// The settings from the bug report: Down shape, 1/2 base, rate spread (+) 3
Settings reportCase()
{
    return plainWith ([] (Settings& s) {
        s.shape = Shape::Down;
        s.pattern = Pattern::Down;
        s.baseRate = rateIndex ("1/2");
        s.rateActive = true;
        s.rateSpreadDown = 0;
        s.rateSpreadUp = 3;
    });
}
} // namespace

TEST_CASE ("chords: Snap to Grid, Per Note Step: each note waits for its rate's grid")
{
    auto s = reportCase();
    s.advanceTrigger = AdvanceTrigger::NoteStep;
    HostSim host (s);
    playChord (host, CEG);
    host.play (10);
    CHECK_EQ (beatsOf (before (host.noteOns(), 10)), (Beats { 1, 1.5, 2, 3, 5, 5.5, 6, 7, 9, 9.5 }));
}

TEST_CASE ("chords: Flow, Per Note Step: exact rhythm, realigned to the beat each pass")
{
    auto s = reportCase();
    s.timing = TimingMode::Flow;
    s.advanceTrigger = AdvanceTrigger::NoteStep;
    HostSim host (s);
    playChord (host, CEG);
    host.play (10);
    CHECK_EQ (beatsOf (before (host.noteOns(), 10)), (Beats { 1, 1.25, 1.75, 2.75, 5, 5.25, 5.75, 6.75, 9, 9.25, 9.75 }));
}

TEST_CASE ("chords: a new chord restarts the series and pattern, aligned to its rate grid")
{
    for (auto timing : { TimingMode::SnapToGrid, TimingMode::Flow })
    {
        auto s = reportCase();
        s.timing = timing;
        HostSim host (s);
        playChord (host, CEG);
        host.play (8);
        for (int p : CEG)
            host.noteOff (p);
        host.play (0.6);
        const double pressedAt = host.position();
        host.events.clear();
        playChord (host, { 62, 65, 69 });
        host.play (2);
        auto ons = host.noteOns();
        REQUIRE (ons.size() >= 4);
        ons.resize (4);
        CHECK_EQ (pitchesOf (ons), (Vec { 69, 65, 62, 69 })); // fast (1/16) from the top of Down
        CHECK (ons[0].beat >= pressedAt - 1e-9 && ons[0].beat - pressedAt < 0.25);
        CHECK_EQ (std::fmod (ons[0].beat - 1.0, 0.25), 0.0); // on the 1/16 grid
        CHECK_EQ (ons[1].beat - ons[0].beat, 0.25);
        CHECK_EQ (ons[2].beat - ons[1].beat, 0.25);
    }
}

TEST_CASE ("chords: changing the base rate by hand snaps the next note to the new grid")
{
    HostSim host (plain()); // 1/8
    host.noteOn (60);
    host.play (0.6); // notes at 1.0 and 1.5
    host.change ([] (Settings& s) { s.baseRate = rateIndex ("1/4"); });
    host.play (3);
    CHECK_EQ (beatsOf (before (host.noteOns(), 4.5)), (Beats { 1, 1.5, 2, 3, 4 }));
}

TEST_CASE ("chords: a steady rate without rate modulation stays on the grid")
{
    HostSim host (plainWith ([] (Settings& s) { s.baseRate = rateIndex ("1/16"); s.octaveActive = true; s.advanceTrigger = AdvanceTrigger::NoteStep; }));
    playChord (host, CEG);
    host.play (8);
    for (const auto& n : host.noteOns())
        CHECK_EQ (std::fmod (n.beat - 1.0, 0.25), 0.0);
}

TEST_CASE ("chords: a chord change mid-block takes effect at its exact sample (plugin improvement)")
{
    HostSim host (plain()); // 1/8 notes at 1.0, 1.5, ...
    host.noteOn (60);
    host.play (0.5);
    host.noteOffAt (60, 1.75); // released between the 1.5 and 2.0 notes, inside one big block
    host.play (1, 24000);      // a single block covering 1.5 .. 2.5
    CHECK_EQ (beatsOf (host.noteOns()), (Beats { 1, 1.5 })); // 1.5 played (before the release), 2.0 not
}

// ---------------------------------------------------------------------------------------------
// dotted and triplet rates
// ---------------------------------------------------------------------------------------------

TEST_CASE ("rates: dotted and triplet rates play at their length")
{
    HostSim dotted (plainWith ([] (Settings& s) { s.baseRate = rateIndex ("1/8 dotted"); }));
    dotted.noteOn (60);
    dotted.play (3);
    CHECK_EQ (beatsOf (before (dotted.noteOns(), 4)), (Beats { 1, 1.75, 2.5, 3.25 }));

    HostSim triplet (plainWith ([] (Settings& s) { s.baseRate = rateIndex ("1/8 triplet"); }));
    triplet.noteOn (60);
    triplet.play (2);
    CHECK_EQ (r4 (beatsOf (before (triplet.noteOns(), 3))), (Beats { 1, 1.3333, 1.6667, 2, 2.3333, 2.6667 }));
}

TEST_CASE ("rates: a triplet series stays triplet; a dotted series stays dotted")
{
    HostSim triplet (plainWith ([] (Settings& s) {
        s.baseRate = rateIndex ("1/8 triplet");
        s.rateActive = true;
        s.rateSpreadDown = 0;
        s.rateSpreadUp = 1;
        s.shape = Shape::Up;
    }));
    playChord (triplet, CEG);
    triplet.play (3);
    CHECK_EQ (r4 (beatsOf (before (triplet.noteOns(), 3.4))), (Beats { 1, 1.3333, 1.6667, 2, 2.1667, 2.3333, 2.6667, 3, 3.3333 }));

    HostSim dotted (plainWith ([] (Settings& s) {
        s.baseRate = rateIndex ("1/8 dotted");
        s.rateActive = true;
        s.rateSpreadDown = 0;
        s.rateSpreadUp = 1;
        s.shape = Shape::Up;
    }));
    playChord (dotted, CEG);
    dotted.play (5);
    CHECK_EQ (beatsOf (before (dotted.noteOns(), 5.9)), (Beats { 1, 1.75, 2.5, 3.25, 3.625, 4, 4.5, 5.25 }));
}

TEST_CASE ("rates: slow rates (1/1 dotted) are not mistaken for a transport jump")
{
    HostSim host (plainWith ([] (Settings& s) { s.baseRate = rateIndex ("1/1 dotted"); }));
    host.noteOn (60);
    host.play (13);
    CHECK_EQ (beatsOf (host.noteOns()), (Beats { 1, 7, 13 }));
}

// ---------------------------------------------------------------------------------------------
// Free timing, late chords
// ---------------------------------------------------------------------------------------------

namespace
{
Beats singleNoteOnsets (TimingMode timing)
{
    HostSim host (plainWith ([timing] (Settings& s) {
        s.pattern = Pattern::UpDown;
        s.rateActive = true;
        s.rateSpreadDown = 0;
        s.rateSpreadUp = 1;
        s.shape = Shape::Up;
        s.timing = timing;
    }));
    host.noteOn (48);
    host.play (3);
    return beatsOf (before (host.noteOns(), 3.5));
}
} // namespace

TEST_CASE ("timing: Snap and Flow keep every note on the 1/8 grid for a single note")
{
    CHECK_EQ (singleNoteOnsets (TimingMode::SnapToGrid), (Beats { 1, 1.5, 2, 2.5, 3 }));
    CHECK_EQ (singleNoteOnsets (TimingMode::Flow), (Beats { 1, 1.5, 2, 2.5, 3 }));
}

TEST_CASE ("timing: Free never snaps, 1/8 and 1/16 alternate back to back")
{
    CHECK_EQ (singleNoteOnsets (TimingMode::Free), (Beats { 1, 1.5, 1.75, 2.25, 2.5, 3, 3.25 }));
}

TEST_CASE ("timing: Free still snaps a new chord to the grid")
{
    HostSim host (plainWith ([] (Settings& s) {
        s.pattern = Pattern::UpDown;
        s.rateActive = true;
        s.rateSpreadUp = 1;
        s.rateSpreadDown = 0;
        s.timing = TimingMode::Free;
    }));
    host.play (0.3);
    host.noteOnAt (48, 100, 1.3);
    host.play (1);
    CHECK_EQ (host.noteOns()[0].beat, 1.5);
}

TEST_CASE ("late chords: a chord arriving just after a grid line starts on it (played immediately)")
{
    // Adapted: plugin events can't carry an earlier beat than their block, so "late" is a note
    // delivered at the start of the block after the grid line (here ~1.021 for a line at 1.0)
    HostSim host (plain());
    host.play (512.0 / HostSim::samplesPerBeat); // first block (1.0 - 1.0213) already processed
    host.noteOnAt (60, 100, 1.0);
    host.play (2);
    const auto ons = beatsOf (before (host.noteOns(), 3));
    REQUIRE (! ons.empty());
    CHECK (ons[0] >= 1.0 && ons[0] <= 1.03); // played immediately, not at 1.5
    CHECK_EQ (Beats (ons.begin() + 1, ons.end()), (Beats { 1.5, 2, 2.5 })); // grid kept
}

TEST_CASE ("late chords: a chord played well after a grid line waits for the next one")
{
    HostSim host (plain());
    host.play (0.2);
    host.noteOnAt (60, 100, 1.2);
    host.play (1);
    CHECK_EQ (host.noteOns()[0].beat, 1.5);
}

// ---------------------------------------------------------------------------------------------
// loop wrap and note bursts
// ---------------------------------------------------------------------------------------------

TEST_CASE ("loop wrap: restarts series and pattern, and plays the loop's downbeat")
{
    for (bool straddle : { false, true })
    {
        HostSim host (plainWith ([] (Settings& s) { s.pattern = Pattern::Down; s.rateActive = true; s.rateSpreadDown = 0; s.rateSpreadUp = 1; }));
        host.setCycle (1, 2.75, straddle); // ends mid-pattern on 1/16
        playChord (host, CEG);
        host.play (1.75);
        const auto firstPass = host.noteOns().size();
        host.play (2);
        const auto ons = host.noteOns();
        REQUIRE (ons.size() > firstPass + 1);
        CHECK (ons[firstPass].beat >= 1 && ons[firstPass].beat < 1.03);
        CHECK_EQ (ons[firstPass].pitch, 67); // pattern restarts from the top (Down)
        CHECK_EQ (ons[firstPass + 1].beat, 1.5); // series restarts at 1/8
    }
}

TEST_CASE ("loop wrap: the second pass plays the same notes as the first")
{
    HostSim host (plainWith ([] (Settings& s) { s.pattern = Pattern::Down; s.rateActive = true; s.rateSpreadDown = 0; s.rateSpreadUp = 1; }));
    host.setCycle (1, 5, true);
    playChord (host, CEG);
    host.play (4);
    const auto first = host.noteOns();
    host.events.clear();
    host.play (4);
    const auto second = host.noteOns();
    REQUIRE_EQ (second.size(), first.size());
    CHECK_EQ (pitchesOf (second), pitchesOf (first));
    CHECK_EQ (r4 (Beats (beatsOf (second).begin() + 1, beatsOf (second).end())), r4 (Beats (beatsOf (first).begin() + 1, beatsOf (first).end())));
}

TEST_CASE ("bursts: a note arriving in the block that crosses the loop end does not stack notes")
{
    // Adapted from the +10 dB pop regression: in the plugin the note arrives with a sample offset
    // in the straddling block (not a stale beat), and the safety net must still hold
    HostSim host (plainWith ([] (Settings& s) { s.pattern = Pattern::Down; s.rateActive = true; s.rateSpreadDown = 0; s.rateSpreadUp = 1; }));
    host.setCycle (9, 41, true);
    host.locate (9);
    host.noteOnAt (48, 94, 9.0);
    host.play (31.99);
    host.noteOffAt (48, 40.881);
    host.noteOn (48, 94); // the region's loop-start note, delivered before the wrap
    const auto before = host.events.size();
    host.play (1.03);
    std::vector<OutNote> ons;
    for (size_t i = before; i < host.events.size(); ++i)
        if (host.events[i].type == MidiEvent::Type::NoteOn)
            ons.push_back (host.events[i]);
    REQUIRE_EQ (ons.size(), size_t (3));
    CHECK (ons[0].beat >= 9 && ons[0].beat < 9.02);
    CHECK_EQ (ons[1].beat, 9.5);
    CHECK_EQ (ons[2].beat, 10.0);
}

TEST_CASE ("bursts: never starts two notes at the same instant (randomized sessions)")
{
    std::mt19937 rand (42);
    const auto pick = [&rand] (auto... options) {
        const std::vector<int> list { int (options)... };
        return list[std::uniform_int_distribution<size_t> (0, list.size() - 1) (rand)];
    };
    const auto chance = [&rand] (double p) { return std::uniform_real_distribution<double> (0, 1) (rand) < p; };
    for (int session = 0; session < 60; ++session)
    {
        Settings s;
        s.pattern = Pattern (pick (0, 1, 2));
        s.baseOctave = pick (1, 2);
        s.baseRate = pick (rateIndex ("1/4"), rateIndex ("1/8"), rateIndex ("1/16 triplet"), rateIndex ("1/32"), rateIndex ("1/128"));
        s.rateActive = pick (0, 1) == 1;
        s.rateSpreadUp = pick (0, 1, 2);
        s.timing = TimingMode (pick (0, 1, 2));
        s.advanceTrigger = AdvanceTrigger (pick (0, 1, 2, 3));
        s.swing = pick (50, 62);
        s.octaveMode = OctaveMode (pick (0, 1));
        s.link = LinkMode (pick (0, 1, 2));
        s.octaveActive = pick (0, 1) == 1;
        s.velocityActive = pick (0, 1) == 1;
        s.globalRange = pick (0, 50, 100);
        s.curve = Curve (pick (0, 1, 3, 5, 6));
        HostSim host (s, (std::uint64_t) session + 1);
        host.setCycle (1, 1 + pick (4, 8, 9), chance (0.5));
        const int blockSize = pick (362, 512, 1200);
        for (int step = 0; step < 40; ++step)
        {
            const int a = 48 + pick (0, 3, 5, 7, 11), b = 60 + pick (0, 2, 4, 9);
            if (chance (0.7))
            {
                host.noteOn (a, 90);
                host.noteOn (b, 90);
            }
            host.play (std::uniform_real_distribution<double> (0, 3) (rand), blockSize);
            if (chance (0.5))
            {
                host.noteOff (a);
                host.noteOff (b);
            }
        }
        host.stop();
        std::set<std::pair<int, long long>> seen;
        for (const auto& e : host.noteOns())
        {
            const auto key = std::make_pair (e.pass, std::llround (e.beat * HostSim::samplesPerBeat));
            if (seen.count (key) != 0)
            {
                std::cerr << "    session " << session << ": two notes at beat " << e.beat << " (pass " << e.pass << ")\n";
                CHECK (false);
                break;
            }
            seen.insert (key);
        }
        std::vector<OutNote> unmatched;
        host.pairs (&unmatched);
        CHECK_EQ (unmatched.size(), size_t (0)); // stop() ends every note
    }
}

// ---------------------------------------------------------------------------------------------
// time-based advance triggers
// ---------------------------------------------------------------------------------------------

namespace
{
const Vec CHORD4 { 55, 60, 62, 64 };

Settings triggerBase()
{
    return plainWith ([] (Settings& s) {
        s.pattern = Pattern::AsPlayed;
        s.baseRate = rateIndex ("1/16");
        s.octaveActive = true;
        s.octaveSpreadDown = 0;
        s.octaveSpreadUp = 1;
    });
}

// Highest note in each beat: 64 = 1-octave pattern only, 76 = 2-octave pattern present
Vec highestPerBeat (const Settings& s, double beats)
{
    HostSim host (s);
    playChord (host, CHORD4);
    host.play (beats);
    Vec out;
    for (const auto& n : host.noteOns())
    {
        const auto beat = (size_t) std::floor (n.beat - 1.0);
        if (out.size() <= beat)
            out.resize (beat + 1, 0);
        out[beat] = std::max (out[beat], n.pitch);
    }
    return out;
}
} // namespace

TEST_CASE ("triggers: Per Bar, a full bar of each octave range, every bar from the top")
{
    auto s = triggerBase();
    s.advanceTrigger = AdvanceTrigger::Bar;
    HostSim host (s);
    playChord (host, CHORD4);
    host.play (11.9);
    const auto ons = host.noteOns();
    const auto bar = [&ons] (int i) {
        std::vector<OutNote> notes;
        for (const auto& n : ons)
            if (n.beat >= 1 + 4 * i && n.beat < 5 + 4 * i)
                notes.push_back (n);
        return pitchesOf (notes);
    };
    CHECK_EQ (bar (0), (Vec { 55, 60, 62, 64, 55, 60, 62, 64, 55, 60, 62, 64, 55, 60, 62, 64 }));
    CHECK_EQ (bar (1), (Vec { 55, 60, 62, 64, 67, 72, 74, 76, 55, 60, 62, 64, 67, 72, 74, 76 }));
    CHECK_EQ (bar (2), bar (0));
}

TEST_CASE ("triggers: Per Bar restarts the pattern at the bar line even mid-cycle")
{
    auto s = triggerBase();
    s.advanceTrigger = AdvanceTrigger::Bar;
    s.octaveActive = false;
    s.pattern = Pattern::Up;
    HostSim host (s);
    playChord (host, CEG); // 3-note cycle: 16 sixteenths = 5 cycles + 1 note
    host.play (5.1);
    bool found = false;
    for (const auto& n : host.noteOns())
        if (n.beat == 5.0)
        {
            CHECK_EQ (n.pitch, 60);
            found = true;
        }
    CHECK (found);
}

TEST_CASE ("triggers: Per Beat and Per 2 Bars change on their own grid")
{
    auto beat = triggerBase();
    beat.advanceTrigger = AdvanceTrigger::Beat;
    auto transposed = beat;
    transposed.octaveMode = OctaveMode::Transpose;
    CHECK_EQ (highestPerBeat (transposed, 3.9), (Vec { 64, 76, 64, 76 }));
    CHECK_EQ (highestPerBeat (beat, 3.9), (Vec { 64, 64, 64, 64 })); // 2-octave cycle cut at each beat
    auto twoBars = triggerBase();
    twoBars.advanceTrigger = AdvanceTrigger::TwoBars;
    CHECK_EQ (highestPerBeat (twoBars, 15.9), (Vec { 64, 64, 64, 64, 64, 64, 64, 64, 64, 76, 64, 76, 64, 76, 64, 76 }));
}

TEST_CASE ("triggers: a chord starting mid-bar keeps its first value until the next bar line")
{
    auto s = triggerBase();
    s.advanceTrigger = AdvanceTrigger::Bar;
    HostSim host (s);
    host.play (2);
    for (int p : CHORD4)
        host.noteOnAt (p, 100, 3.0);
    host.play (4);
    bool twoOctavesInBar2 = false;
    for (const auto& n : host.noteOns())
    {
        if (n.beat < 5)
            CHECK (n.pitch <= 64);
        else if (n.pitch == 76)
            twoOctavesInBar2 = true;
    }
    CHECK (twoOctavesInBar2);
}

TEST_CASE ("triggers: rate changes per bar keep every bar on the grid")
{
    auto s = triggerBase();
    s.advanceTrigger = AdvanceTrigger::Bar;
    s.octaveActive = false;
    s.baseRate = rateIndex ("1/8");
    s.rateActive = true;
    s.rateSpreadDown = 0;
    s.rateSpreadUp = 1;
    HostSim host (s);
    playChord (host, CHORD4);
    host.play (8.9);
    const auto ons = host.noteOns();
    CHECK_EQ (before (ons, 5).size(), size_t (8)); // bar 1: 1/8 notes
    size_t bar2 = 0;
    double firstInBar2 = 0;
    for (const auto& n : ons)
        if (n.beat >= 5 && n.beat < 9)
        {
            if (bar2++ == 0)
                firstInBar2 = n.beat;
        }
    CHECK_EQ (bar2, size_t (16)); // bar 2: 1/16 notes
    CHECK_EQ (firstInBar2, 5.0);
}

TEST_CASE ("bursts: a chord exactly on a grid line at a fast rate plays its first note once")
{
    // Regression (found while porting): the late-chord tolerance lines up 1/16 beat early, which at
    // 1/128 (1/32 beat) is two grid lines back; the first note played late (immediately), then the
    // resync landed on the chord's own grid line again -> two notes at the same instant
    HostSim host (plainWith ([] (Settings& s) { s.baseRate = rateIndex ("1/128"); }));
    host.play (1);
    host.noteOnAt (55, 100, 2.0);
    host.noteOnAt (62, 100, 2.0);
    host.play (0.125);
    CHECK_EQ (beatsOf (host.noteOns()), (Beats { 2, 2.03125, 2.0625, 2.09375 }));
    CHECK_EQ (pitchesOf (host.noteOns()), (Vec { 55, 62, 55, 62 }));
}
