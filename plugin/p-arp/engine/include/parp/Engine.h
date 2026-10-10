#pragma once

#include <cstdint>
#include <span>
#include <vector>
#include "parp/FixedVector.h"
#include "parp/Progression.h"
#include "parp/Random.h"
#include "parp/Sequence.h"
#include "parp/Settings.h"

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

// The arpeggiator: the Scripter prototype's scheduler (ProcessMIDI and the note handlers) on top
// of the series system (Progression) and sequence building.
//
// Time is kept in "Logic beats" like the prototype (beat 1 = ppq 0, quarter note = 1 beat), so
// values match the prototype's tests and debug logs. Unlike Scripter there is no sendAtBeat:
// note-offs that fall in later blocks wait in an internal queue, and note-ons are only emitted in
// the block where they start.
//
// Incoming notes take effect at their exact sample position: the block is processed in segments
// split at each incoming event. (Scripter applied a block's input before scheduling the block.)
//
// Real-time rules: process() must not allocate, lock or block. Call prepare() before processing
// starts and whenever the sample rate or block size changes.
class Engine
{
public:
    explicit Engine (std::uint64_t randomSeed = 0x5EED5EEDull);

    void prepare (double sampleRate, int maxBlockSize);
    void reset();

    // Apply new settings (call before process() each block; cheap when unchanged). Applies the
    // prototype's ParameterChanged rules (series restarts, grid realign after rate changes).
    void setSettings (const Settings& newSettings);
    const Settings& settings() const { return currentSettings; }

    // Process one block: `in` holds the block's incoming events sorted by sampleOffset; generated
    // events are appended to `out` sorted by sampleOffset (note-offs before note-ons at the same
    // sample). The caller clears `out`; capacity is reserved by the caller (maxEventsPerBlock).
    void process (const Transport& transport, int numSamples,
                  std::span<const MidiEvent> in, std::vector<MidiEvent>& out);

    EngineStatus status() const { return currentStatus; }
    Random& random() { return rng; }

    // Capacity callers should reserve for `out` (max events one block can produce)
    static constexpr int maxEventsPerBlock = 512;

    // A chord played up to this late after a grid line still starts on that line (1/64 note)
    static constexpr double chordLateTolerance = 0.0625;

    // Beats closer than this to a block / segment end belong to the next one (floating-point
    // slack in beat positions must not pull a note into the block that ends at it)
    static constexpr double beatEpsilon = 1e-9;

private:
    enum class Realign { None, Chord, Rate, Beat };

    struct PendingOff
    {
        double beat = 0.0;
        int pitch = 0;
        int channel = 1;
    };

    // Block context (beats)
    struct Block
    {
        double start = 0.0;          // Logic beat at the first sample
        double end = 0.0;            // Logic beat after the last sample
        double samplesPerBeat = 0.0;
        int numSamples = 0;
        bool cycling = false;
        double leftCycleBeat = 0.0;
        double rightCycleBeat = 0.0;
    };

    void handleNoteOn (int pitch, int velocity, double beat, int offset, std::vector<MidiEvent>& out);
    void handleNoteOff (int pitch, int offset, std::vector<MidiEvent>& out);
    void scheduleSegment (const Block& block, double segmentStart, double segmentEnd, std::vector<MidiEvent>& out);
    void flushDueOffs (const Block& block, double before, std::vector<MidiEvent>& out);
    void stopAllSoundingNotes (int offset, std::vector<MidiEvent>& out);
    void rebuildSequence();
    void restartAtTransportStart (double fromBeat);
    void alignSchedule (double beat, double gridLength, double stepDuration);
    double advanceUnitBeats() const;

    static void emit (std::vector<MidiEvent>& out, MidiEvent::Type type, int offset, int pitch, int velocity, int channel = 1);
    static int toOffset (const Block& block, double beat);

    double sampleRate = 44100.0;
    Settings currentSettings;
    Random rng;
    Progression progression { rng };
    ChordTracker chords;
    Sequence sequence;
    FixedVector<PendingOff, 1024> pendingOffs;

    int stepIndex = 0;
    double nextBeat = 0.0;
    Realign pendingRealign = Realign::None;
    double chordStartBeat = -1.0;
    bool wasPlaying = false;
    double lastBlockStartBeat = -1.0;
    int swingStepCount = 0;
    bool hasAdvanceBoundary = false;
    long long lastAdvanceBoundary = 0;
    double beatsPerBar = 4.0;
    double lastLateOnset = -1.0; // a note played late (immediately); the next must be after it

    EngineStatus currentStatus;
};

// Quantize a beat to the grid of a step length (grid lines at beat 1 + k * step). On the grid
// (within tolerance) stays; otherwise snaps forward.
double quantizeBeatToGrid (double beat, double stepDuration);

// Swing for a step: swing% (50..75) is the off-beat's position within a pair of steps.
struct SwingTiming
{
    double offset; // onset delay (beats)
    double length; // the step's swung slot length (beats)
};
SwingTiming swingTiming (bool isOffBeat, double stepDuration, double swingPercent);

} // namespace parp
