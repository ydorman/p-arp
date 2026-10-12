// Debug log: ring buffer, line formatting (must match the Scripter prototype's [SARP] lines so
// tests/replay.js can replay plugin logs), and what the engine records.

#include <memory>
#include "HostSim.h"
#include "TestHarness.h"
#include "parp/Parameters.h"

using namespace parp;
using namespace parp_test;

namespace
{
bool startsWith (const std::string& s, const std::string& prefix)
{
    return s.rfind (prefix, 0) == 0;
}

std::vector<std::string> withPrefix (const std::vector<std::string>& lines, const std::string& prefix)
{
    std::vector<std::string> result;
    for (const auto& line : lines)
        if (startsWith (line, prefix))
            result.push_back (line);
    return result;
}
} // namespace

TEST_CASE ("event log: pops records in order, drops and counts when full")
{
    auto log = std::make_unique<EventLog>();
    for (int i = 0; i < (int) EventLog::capacity + 9; ++i)
        log->push ({ .type = LogType::Out, .pitch = std::int16_t (i % 128) });
    CHECK_EQ (log->takeDropped(), 10); // capacity - 1 fit
    CHECK_EQ (log->takeDropped(), 0);
    LogRecord record;
    int count = 0;
    while (log->pop (record))
    {
        CHECK_EQ ((int) record.pitch, count % 128);
        ++count;
    }
    CHECK_EQ (count, (int) EventLog::capacity - 1);
    CHECK (log->push ({}));
}

TEST_CASE ("event log: note names and beats are formatted like the prototype")
{
    CHECK_EQ (noteName (60), std::string ("C3(60)"));
    CHECK_EQ (noteName (61), std::string ("C#3(61)"));
    CHECK_EQ (noteName (0), std::string ("C-2(0)"));
    CHECK_EQ (formatBeat (5.25, 4.0), std::string ("@5.250 [2|1.250]"));
    CHECK_EQ (formatBeat (1.0, 3.0), std::string ("@1.000 [1|1.000]"));
    CHECK_EQ (formatBeat (4.0, 3.0), std::string ("@4.000 [2|1.000]"));
}

TEST_CASE ("event log: record lines")
{
    LogFormatter formatter;
    std::vector<std::string> lines;
    formatter.add ({ .type = LogType::Start, .flag = true, .beat = 1.0, .value1 = 120.0, .value2 = 1.0, .value3 = 9.0 }, lines);
    formatter.add ({ .type = LogType::Start, .beat = 1.0, .value1 = 92.5 }, lines);
    formatter.add ({ .type = LogType::Out, .pitch = 60, .velocity = 100, .rate = std::int16_t (rateIndex ("1/8")), .octave = 1,
                     .pattern = 0, .gate = 80, .swing = 50, .step = 1, .stepCount = 3, .beat = 1.0, .value1 = 0.4 }, lines);
    formatter.add ({ .type = LogType::Skip, .pitch = 64, .velocity = 90, .rate = std::int16_t (rateIndex ("1/16")), .octave = 2,
                     .pattern = 2, .gate = 50, .swing = 60, .step = 2, .stepCount = 4, .beat = 8.5, .value1 = 0.125 }, lines);
    formatter.add ({ .type = LogType::Align, .reason = 'c', .beat = 2.0, .value1 = 1.9375, .value2 = 0.5 }, lines);
    formatter.add ({ .type = LogType::Pass, .flag = true }, lines);
    formatter.add ({ .type = LogType::Param, .param = std::int16_t (findParameter ("pattern") - parameterSpecs().data()), .value = 1, .beat = 3.0 }, lines);
    formatter.finish (lines);
    REQUIRE (lines.size() == 7);
    CHECK_EQ (lines[0], std::string ("START @1.000 [1|1.000] tempo 120 cycle 1-9"));
    CHECK_EQ (lines[1], std::string ("START @1.000 [1|1.000] tempo 92.5 no-cycle"));
    CHECK_EQ (lines[2], std::string ("OUT C3(60) v100 @1.000 [1|1.000] len 0.400 | rate 1/8 oct 1 pat Up gate 80% swing 50% | step 1/3"));
    CHECK_EQ (lines[3], std::string ("SKIP (past loop end) E3(64) v90 @8.500 [2|4.500] len 0.125 | rate 1/16 oct 2 pat Up/Down gate 50% swing 60% | step 2/4"));
    CHECK_EQ (lines[4], std::string ("ALIGN chord 1.938 -> @2.000 [1|2.000] (grid 0.5000 beats)"));
    CHECK_EQ (lines[5], std::string ("PASS subdivision series completed a pass -> realign to beat"));
    CHECK_EQ (lines[6], std::string ("PARAM Arp Pattern = Down @3.000 [1|3.000]"));
}

TEST_CASE ("event log: Set records become one SET line per parameter group")
{
    Settings s;
    s.latch = true;
    LogFormatter formatter;
    std::vector<std::string> lines;
    const auto specs = parameterSpecs();
    for (std::size_t i = 0; i < specs.size(); ++i)
        formatter.add ({ .type = LogType::Set, .param = std::int16_t (i), .value = specs[i].get (s) }, lines);
    formatter.finish (lines);
    REQUIRE (lines.size() == 9);
    CHECK (startsWith (lines[0], "SET Latch Chord = On ; Advance Trigger = Per Arp Cycle ; "));
    CHECK (startsWith (lines[1], "SET Arp Pattern = Up/Down ; Pattern Mod Active = Off ; "));
    CHECK (startsWith (lines[8], "SET Custom Length = "));
}

TEST_CASE ("event log: the engine logs start, settings, input, notes, parameter changes and stop")
{
    auto log = std::make_unique<EventLog>();
    Settings s;
    s.baseRate = rateIndex ("1/8");
    s.gate = 80;
    HostSim host (s);
    host.engine.setLog (log.get());
    host.play (0.5);
    host.noteOn (60);
    host.noteOn (64);
    host.play (1.5);
    host.change ([] (Settings& x) { x.pattern = Pattern::Down; });
    host.play (0.75); // stop while the note at 3.5 sounds
    host.stop();

    LogFormatter formatter;
    const auto lines = drainLog (*log, formatter);
    REQUIRE (! lines.empty());
    CHECK_EQ (lines[0], std::string ("START @1.000 [1|1.000] tempo 120 no-cycle"));
    CHECK_EQ (withPrefix (lines, "SET ").size(), (std::size_t) 9);
    CHECK_EQ (withPrefix (lines, "ALIGN start -> @1.000").size(), (std::size_t) 1);
    CHECK_EQ (withPrefix (lines, "IN on C3(60) v100 @1.500").size(), (std::size_t) 1);
    CHECK_EQ (withPrefix (lines, "CHORD ").size(), (std::size_t) 1);
    CHECK_EQ (withPrefix (lines, "PARAM Arp Pattern = Down @3.000").size(), (std::size_t) 1);
    const auto outs = withPrefix (lines, "OUT ");
    CHECK_EQ (outs.size(), host.noteOns().size());
    REQUIRE (! outs.empty());
    CHECK (startsWith (outs[0], "OUT C3(60) v100 @1.500 [1|1.500] len 0.400 | rate 1/8 "));
    // Like the prototype: STOP, then a FLUSH per sounding note
    REQUIRE (lines.size() >= 2);
    CHECK_EQ (lines[lines.size() - 2], std::string ("STOP @3.750 [1|3.750]"));
    CHECK (startsWith (lines.back(), "FLUSH immediate NoteOff "));
}

TEST_CASE ("event log: nothing is recorded without a log")
{
    auto log = std::make_unique<EventLog>();
    HostSim host;
    host.play (0.5);
    host.engine.setLog (log.get());
    host.engine.setLog (nullptr);
    host.noteOn (60);
    host.play (1.0);
    LogRecord record;
    CHECK (! log->pop (record));
}
