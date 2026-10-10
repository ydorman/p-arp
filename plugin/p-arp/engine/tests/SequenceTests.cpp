// Ported from the Scripter prototype's Node tests ("rebuildSequence patterns", "latch",
// "octave mode", "pattern mod off"): same inputs, same expected values. Cases the prototype tested
// through playback check the sequence each cycle produces instead (playback comes with the
// scheduler port).

#include "TestHarness.h"
#include "parp/Progression.h"
#include "parp/Sequence.h"

using namespace parp;

namespace
{
using Vec = std::vector<int>;

Vec pitches (const Sequence& sequence)
{
    Vec out;
    for (const auto& note : sequence)
        out.push_back (note.pitch);
    return out;
}

Vec pitches (std::span<const Note> notes)
{
    Vec out;
    for (const auto& note : notes)
        out.push_back (note.pitch);
    return out;
}

// The prototype's sequence(pattern, octaves, played): play notes with default settings except
// pattern and Base Octave Range, return the sequence
Vec sequenceFor (Pattern pattern, int octaves, const Vec& played = { 60, 64, 67 })
{
    Settings s;
    s.pattern = pattern;
    s.baseOctave = octaves;
    Random rng;
    Progression progression (rng);
    progression.reset (s);
    ChordTracker chords;
    for (int p : played)
        chords.noteOn (p, 100, s.latch);
    Sequence out;
    buildSequence (chords.active (s.latch), s, progression, out);
    return pitches (out);
}
} // namespace

// ---------------------------------------------------------------------------------------------
// patterns
// ---------------------------------------------------------------------------------------------

TEST_CASE ("patterns: Up")
{
    CHECK_EQ (sequenceFor (Pattern::Up, 1), (Vec { 60, 64, 67 }));
}

TEST_CASE ("patterns: Down")
{
    CHECK_EQ (sequenceFor (Pattern::Down, 1), (Vec { 67, 64, 60 }));
}

TEST_CASE ("patterns: Up/Down does not repeat the ends")
{
    CHECK_EQ (sequenceFor (Pattern::UpDown, 1), (Vec { 60, 64, 67, 64 }));
}

TEST_CASE ("patterns: Down/Up does not repeat the ends")
{
    CHECK_EQ (sequenceFor (Pattern::DownUp, 1), (Vec { 67, 64, 60, 64 }));
}

TEST_CASE ("patterns: As Played keeps input order")
{
    CHECK_EQ (sequenceFor (Pattern::AsPlayed, 1, { 67, 60, 64 }), (Vec { 67, 60, 64 }));
}

TEST_CASE ("patterns: Up sorts notes played out of order")
{
    CHECK_EQ (sequenceFor (Pattern::Up, 1, { 67, 60, 64 }), (Vec { 60, 64, 67 }));
}

TEST_CASE ("patterns: expands across octaves")
{
    CHECK_EQ (sequenceFor (Pattern::UpDown, 2), (Vec { 60, 64, 67, 72, 76, 79, 76, 72, 67, 64 }));
}

TEST_CASE ("patterns: drops notes transposed above 127")
{
    CHECK_EQ (sequenceFor (Pattern::Up, 2, { 120 }), (Vec { 120 }));
}

TEST_CASE ("patterns: Up/Down and Down/Up with one or two notes")
{
    CHECK_EQ (sequenceFor (Pattern::UpDown, 1, { 60 }), (Vec { 60 }));
    CHECK_EQ (sequenceFor (Pattern::UpDown, 1, { 60, 64 }), (Vec { 60, 64 }));
    CHECK_EQ (sequenceFor (Pattern::DownUp, 1, { 60, 64 }), (Vec { 64, 60 }));
}

TEST_CASE ("patterns: no notes gives an empty sequence")
{
    CHECK_EQ (sequenceFor (Pattern::Up, 2, {}), (Vec {}));
}

TEST_CASE ("pattern mod off ignores the series and uses the Arp Pattern menu")
{
    Settings s;
    s.pattern = Pattern::Down;
    s.baseOctave = 1;
    Random rng;
    Progression progression (rng);
    progression.reset (s);
    progression.position (SeriesId::Pattern).pos = (int) Pattern::Up;
    ChordTracker chords;
    for (int p : { 60, 64, 67 })
        chords.noteOn (p, 100, false);
    Sequence out;
    buildSequence (chords.active (false), s, progression, out);
    CHECK_EQ (pitches (out), (Vec { 67, 64, 60 }));
}

// ---------------------------------------------------------------------------------------------
// latch and chord detection
// ---------------------------------------------------------------------------------------------

TEST_CASE ("latch: does not duplicate a note re-pressed while the chord is held")
{
    ChordTracker chords;
    chords.noteOn (60, 100, true);
    chords.noteOn (64, 100, true);
    chords.noteOff (64, true);
    chords.noteOn (64, 100, true);
    chords.noteOff (64, true);
    chords.noteOff (60, true);
    CHECK_EQ (pitches (chords.latched().view()), (Vec { 60, 64 }));
    Sequence out;
    buildSequence (chords.active (true), Pattern::Up, 1, 0, out);
    CHECK_EQ (pitches (out), (Vec { 60, 64 }));
}

TEST_CASE ("latch: a new chord after releasing all keys replaces the latched chord")
{
    ChordTracker chords;
    for (int p : { 60, 64, 67 })
        chords.noteOn (p, 100, true);
    for (int p : { 60, 64, 67 })
        chords.noteOff (p, true);
    const auto first = chords.noteOn (62, 100, true);
    chords.noteOn (65, 100, true);
    CHECK_EQ (pitches (chords.latched().view()), (Vec { 62, 65 }));
    CHECK (first.newChord);
    CHECK (first.stopSounding); // the replaced latched chord's notes stop
}

TEST_CASE ("latch: releasing keys keeps the latched chord playing")
{
    ChordTracker chords;
    chords.noteOn (60, 100, true);
    const auto off = chords.noteOff (60, true);
    CHECK (! off.stopSounding);
    CHECK (! off.sequenceChanged);
    CHECK_EQ (pitches (chords.active (true)), (Vec { 60 }));
}

TEST_CASE ("chords: a new chord is detected only after all keys are released")
{
    ChordTracker chords;
    CHECK (chords.noteOn (60, 100, false).newChord);
    CHECK (! chords.noteOn (64, 100, false).newChord); // added to the held chord
    CHECK (! chords.noteOff (60, false).stopSounding);
    CHECK (chords.noteOff (64, false).stopSounding); // whole chord released
    CHECK (chords.noteOn (62, 100, false).newChord);
}

TEST_CASE ("chords: re-pressing a held key updates its velocity, not the note list")
{
    ChordTracker chords;
    chords.noteOn (60, 80, false);
    chords.noteOn (60, 110, false);
    CHECK_EQ (chords.held().size(), size_t (1));
    CHECK_EQ (int (chords.held()[0].velocity), 110);
}

// ---------------------------------------------------------------------------------------------
// octave mode (sequence per cycle)
// ---------------------------------------------------------------------------------------------

namespace
{
// The reported case: 4-note chord, As Played, octave 1 with spread (+) 1. Returns the sequence of
// each of `cycles` cycles, advancing the series once per cycle.
std::vector<Vec> cyclesFor (Settings s, int cycles)
{
    Random rng;
    Progression progression (rng);
    progression.reset (s);
    ChordTracker chords;
    for (int p : { 55, 60, 62, 64 })
        chords.noteOn (p, 100, false);
    std::vector<Vec> out;
    for (int i = 0; i < cycles; ++i)
    {
        Sequence sequence;
        buildSequence (chords.active (false), s, progression, sequence);
        out.push_back (pitches (sequence));
        progression.advance (s, true);
    }
    return out;
}

Settings reportCase()
{
    Settings s;
    s.pattern = Pattern::AsPlayed;
    s.baseOctave = 1;
    s.octaveActive = true;
    s.octaveSpreadDown = 0;
    s.octaveSpreadUp = 1;
    return s;
}

std::ostream& operator<< (std::ostream& stream, const std::vector<Vec>& cycles)
{
    for (const auto& cycle : cycles)
        parp_test::operator<< (stream, cycle);
    return stream;
}
} // namespace

TEST_CASE ("octave Range: the 2-octave cycle repeats the 1-octave notes, then adds the octave above")
{
    CHECK_EQ (cyclesFor (reportCase(), 3), (std::vector<Vec> { { 55, 60, 62, 64 }, { 55, 60, 62, 64, 67, 72, 74, 76 }, { 55, 60, 62, 64 } }));
}

TEST_CASE ("octave Transpose: every cycle has the same notes, shifted an octave up on alternate cycles")
{
    auto s = reportCase();
    s.octaveMode = OctaveMode::Transpose;
    CHECK_EQ (cyclesFor (s, 3), (std::vector<Vec> { { 55, 60, 62, 64 }, { 67, 72, 74, 76 }, { 55, 60, 62, 64 } }));
}

TEST_CASE ("octave Transpose can shift below the base, and keeps Base Octave Range as the cycle span")
{
    auto s = reportCase();
    s.octaveMode = OctaveMode::Transpose;
    s.baseOctave = 2;
    s.octaveSpreadDown = 1;
    s.octaveSpreadUp = 0;
    s.shape = Shape::Up;
    CHECK_EQ (cyclesFor (s, 2), (std::vector<Vec> { { 43, 48, 50, 52, 55, 60, 62, 64 }, { 55, 60, 62, 64, 67, 72, 74, 76 } }));
}

TEST_CASE ("octave Transpose drops notes outside the MIDI range")
{
    Settings s;
    s.octaveMode = OctaveMode::Transpose;
    s.octaveActive = true;
    s.octaveSpreadUp = 3;
    s.pattern = Pattern::Up;
    s.baseOctave = 1;
    Random rng;
    Progression progression (rng);
    progression.reset (s);
    progression.position (SeriesId::Octave).pos = 4; // +3 octaves
    ChordTracker chords;
    chords.noteOn (120, 100, false);
    Sequence out;
    buildSequence (chords.active (false), s, progression, out);
    CHECK_EQ (pitches (out), (Vec {}));
}
