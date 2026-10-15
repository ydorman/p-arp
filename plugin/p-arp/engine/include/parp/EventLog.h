#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include "parp/SpscRing.h"

namespace parp
{

// Debug log: the engine records what it does (the same events as the Scripter prototype's
// [SARP] log) as fixed-size records. The audio thread pushes them into a lock-free ring buffer;
// the message thread pops and formats them (formatting allocates, so it never runs on the audio
// thread). Formatted lines match the prototype's, so tests/replay.js can replay a plugin log in
// the prototype mock.

enum class LogType : std::uint8_t
{
    Start,      // transport started: tempo, cycle range (Set records follow)
    Set,        // a parameter's value at transport start (param, value)
    AlignStart, // schedule aligned at transport start (rate)
    Stop,       // transport stopped
    LoopWrap,   // loop wrap / backward jump: series and pattern restart (rate)
    CatchUp,    // schedule resynced after a transport jump
    Param,      // a parameter changed while playing (param, value)
    NoteIn,     // incoming note-on (pitch, velocity)
    NoteInOff,  // incoming note-off (pitch)
    NewChord,   // a new chord restarts series and pattern
    Align,      // schedule snapped to a grid (reason, from, grid)
    Pass,       // rate series completed a pass (flow: realign to the beat follows)
    Advance,    // time-based advance trigger crossed a beat/bar boundary (unit)
    Out,        // generated note
    Skip,       // note skipped: it would start at or past the loop end
    Behind,     // safety net: schedule behind the segment, resynced (from)
    Flush,      // immediate note-off for a sounding note (pitch)
};

struct LogRecord
{
    LogType type = LogType::Out;
    char reason = 's';         // Align: 'c' chord, 'r' rate, 'b' beat, 's' snap
    bool flag = false;         // Start: cycling; Pass: flow timing
    std::int16_t pitch = 0;
    std::int16_t velocity = 0;
    std::int16_t rate = 0;     // index into rates()
    std::int16_t octave = 0;
    std::int16_t pattern = 0;
    std::int16_t gate = 0;     // %
    std::int16_t swing = 0;    // %
    std::int16_t step = 0;     // 1-based
    std::int16_t stepCount = 0;
    std::int16_t param = 0;    // index into parameterSpecs()
    std::int32_t value = 0;    // parameter value
    double beat = 0.0;         // Logic beat (beat 1 = ppq 0)
    double value1 = 0.0;       // Out/Skip: length; Align/Behind: from; Start: tempo; Advance: unit
    double value2 = 0.0;       // Align: grid; Start: loop start
    double value3 = 0.0;       // Start: loop end
    double beatsPerBar = 4.0;  // for bar|beat display
};

// Debug log records, pushed by the audio thread and popped by the message thread
class EventLog : public SpscRing<LogRecord, 8192>
{
};

// Formatting (message thread). Lines are the prototype's without the "[SARP] " prefix, e.g.
//   OUT C3(60) v100 @1.000 [1|1.000] len 0.400 | rate 1/8 oct 1 pat Up gate 80% swing 50% | step 1/3
std::string noteName (int pitch); // Logic convention: MIDI 60 = C3
std::string formatBeat (double beat, double beatsPerBar); // "@5.250 [2|1.250]"
std::string formatParamValue (int param, int value); // "Up", "On", "80"

// Turns records into lines. Consecutive Set records are joined per parameter group into
// "SET Name = Value ; ..." lines, so the formatter keeps state between calls.
class LogFormatter
{
public:
    void add (const LogRecord& record, std::vector<std::string>& lines);
    void finish (std::vector<std::string>& lines); // flush a pending SET line

private:
    std::string setLine;
    int setGroup = -1;
};

// Pops every record from the log and formats it (plus a note when records were dropped)
std::vector<std::string> drainLog (EventLog& log, LogFormatter& formatter);

} // namespace parp
