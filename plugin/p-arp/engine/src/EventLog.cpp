#include "parp/EventLog.h"

#include <cmath>
#include <cstdio>
#include "parp/Parameters.h"
#include "parp/Rates.h"

namespace parp
{

namespace
{
std::string fixed (double value, int decimals)
{
    char buffer[64];
    std::snprintf (buffer, sizeof (buffer), "%.*f", decimals, value);
    return buffer;
}

// Like JavaScript's String(number) for the values logged here (120, 92.5, 9)
std::string jsNumber (double value)
{
    char buffer[64];
    std::snprintf (buffer, sizeof (buffer), "%.15g", value);
    return buffer;
}

const ParamSpec* specAt (int param)
{
    const auto specs = parameterSpecs();
    return param >= 0 && (std::size_t) param < specs.size() ? &specs[(std::size_t) param] : nullptr;
}

std::string rateName (int rate)
{
    return rate >= 0 && rate < numRates ? std::string (rates()[(std::size_t) rate].name) : "?";
}

std::string patternName (int pattern)
{
    const auto* spec = findParameter ("pattern");
    return pattern >= 0 && (std::size_t) pattern < spec->choices.size() ? std::string (spec->choices[(std::size_t) pattern]) : "?";
}
} // namespace

std::string noteName (int pitch)
{
    static constexpr const char* names[] = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
    return std::string (names[((pitch % 12) + 12) % 12]) + std::to_string ((int) std::floor (pitch / 12.0) - 2) + "("
         + std::to_string (pitch) + ")";
}

std::string formatBeat (double beat, double beatsPerBar)
{
    const double bar = std::floor ((beat - 1.0) / beatsPerBar + 1e-9);
    const double inBar = (beat - 1.0) - bar * beatsPerBar + 1.0;
    return "@" + fixed (beat, 3) + " [" + std::to_string ((long long) bar + 1) + "|" + fixed (inBar, 3) + "]";
}

std::string formatParamValue (int param, int value)
{
    const auto* spec = specAt (param);
    if (spec == nullptr)
        return std::to_string (value);
    if (spec->kind == ParamKind::Choice)
    {
        const int index = value - spec->min;
        return index >= 0 && (std::size_t) index < spec->choices.size() ? std::string (spec->choices[(std::size_t) index]) : std::to_string (value);
    }
    if (spec->kind == ParamKind::Bool)
        return value != 0 ? "On" : "Off";
    return std::to_string (value);
}

void LogFormatter::add (const LogRecord& r, std::vector<std::string>& lines)
{
    if (r.type == LogType::Set)
    {
        const auto* spec = specAt (r.param);
        if (spec == nullptr)
            return;
        const auto specs = parameterSpecs();
        int group = 0; // ordinal of the spec's group in the table
        for (int i = 1; i <= r.param; ++i)
            group += specs[(std::size_t) i].group != specs[(std::size_t) i - 1].group ? 1 : 0;
        if (group != setGroup)
        {
            finish (lines);
            setGroup = group;
            setLine = "SET ";
        }
        else
        {
            setLine += " ; ";
        }
        setLine += std::string (spec->name) + " = " + formatParamValue (r.param, r.value);
        return;
    }
    finish (lines);

    const auto at = formatBeat (r.beat, r.beatsPerBar);
    switch (r.type)
    {
        case LogType::Set:
            break;
        case LogType::Start:
            lines.push_back ("START " + at + " tempo " + jsNumber (r.value1)
                             + (r.flag ? " cycle " + jsNumber (r.value2) + "-" + jsNumber (r.value3) : " no-cycle"));
            break;
        case LogType::AlignStart:
            lines.push_back ("ALIGN start -> " + at + " (" + rateName (r.rate) + " grid)");
            break;
        case LogType::Stop:
            lines.push_back ("STOP " + at);
            break;
        case LogType::LoopWrap:
            lines.push_back ("LOOP wrap/jump back -> " + at + " (" + rateName (r.rate) + " grid)");
            break;
        case LogType::CatchUp:
            lines.push_back ("ALIGN catch-up (transport jump) -> " + at);
            break;
        case LogType::Param:
        {
            const auto* spec = specAt (r.param);
            lines.push_back ("PARAM " + std::string (spec != nullptr ? spec->name : "?") + " = " + formatParamValue (r.param, r.value) + " " + at);
            break;
        }
        case LogType::NoteIn:
            lines.push_back ("IN on " + noteName (r.pitch) + " v" + std::to_string (r.velocity) + " " + at);
            break;
        case LogType::NoteInOff:
            lines.push_back ("IN off " + noteName (r.pitch) + " " + at);
            break;
        case LogType::NewChord:
            lines.push_back ("CHORD new chord: series and pattern restart");
            break;
        case LogType::Align:
        {
            const char* reason = r.reason == 'c' ? "chord" : r.reason == 'r' ? "rate" : r.reason == 'b' ? "beat" : "snap";
            lines.push_back (std::string ("ALIGN ") + reason + " " + fixed (r.value1, 3) + " -> " + at + " (grid " + fixed (r.value2, 4) + " beats)");
            break;
        }
        case LogType::Pass:
            lines.push_back (std::string ("PASS subdivision series completed a pass") + (r.flag ? " -> realign to beat" : ""));
            break;
        case LogType::Advance:
            lines.push_back ("ADVANCE " + std::string (r.value1 == 1.0 ? "beat" : "bar") + " boundary " + at);
            break;
        case LogType::Out:
        case LogType::Skip:
            lines.push_back (std::string (r.type == LogType::Out ? "OUT " : "SKIP (past loop end) ") + noteName (r.pitch) + " v"
                             + std::to_string (r.velocity) + " " + at + " len " + fixed (r.value1, 3)
                             + " | rate " + rateName (r.rate) + " oct " + std::to_string (r.octave) + " pat " + patternName (r.pattern)
                             + " gate " + std::to_string (r.gate) + "% swing " + std::to_string (r.swing) + "%"
                             + " | step " + std::to_string (r.step) + "/" + std::to_string (r.stepCount));
            break;
        case LogType::Behind:
            lines.push_back ("ALIGN behind " + fixed (r.value1, 3) + " -> resync from " + at);
            break;
        case LogType::Flush:
            lines.push_back ("FLUSH immediate NoteOff " + noteName (r.pitch));
            break;
    }
}

void LogFormatter::finish (std::vector<std::string>& lines)
{
    if (! setLine.empty())
        lines.push_back (setLine);
    setLine.clear();
    setGroup = -1;
}

std::vector<std::string> drainLog (EventLog& log, LogFormatter& formatter)
{
    std::vector<std::string> lines;
    const int dropped = log.takeDropped();
    LogRecord record;
    while (log.pop (record))
        formatter.add (record, lines);
    formatter.finish (lines);
    if (dropped > 0)
        lines.push_back ("LOG " + std::to_string (dropped) + " events dropped (buffer full)");
    return lines;
}

} // namespace parp
