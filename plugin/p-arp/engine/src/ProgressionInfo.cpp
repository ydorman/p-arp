#include "parp/ProgressionInfo.h"

#include <algorithm>
#include <vector>

namespace parp
{

namespace
{
// Longer than any pass (the longest: a bouncing shape over 8 steps a side, 2 x 16 advances)
constexpr int maxAdvances = 256;

int countDistinct (std::vector<int> values)
{
    std::sort (values.begin(), values.end());
    return int (std::unique (values.begin(), values.end()) - values.begin());
}

// Advances until the series completes a pass; 0 if it never does (Random curve, single value)
int passAdvances (SeriesId id, const Settings& s)
{
    Random rng;
    Progression progression (rng);
    progression.reset (s);
    for (int i = 1; i <= maxAdvances; ++i)
        if (progression.advance (s, true).contains (id))
            return i;
    return 0;
}

// Values one pass plays. Every shape visits every value in a pass (Random too, in the long run),
// so count them over one Up pass, which needs no random generator.
int distinctValues (SeriesId id, const Settings& s)
{
    std::vector<int> values;
    if (s.curve != Curve::Linear)
    {
        std::array<double, maxCustomSteps> steps {};
        const int count = curveSteps (s, steps);
        for (int i = 0; i < count; ++i)
            values.push_back (seriesValueAt (id, curveStepPos (id, i, s), s));
        return countDistinct (values);
    }

    Settings up = s;
    up.shape = Shape::Up;
    Random rng;
    Progression progression (rng);
    progression.reset (up);
    values.push_back (progression.value (id, up));
    for (int i = 0; i < maxAdvances; ++i)
    {
        const auto completed = progression.advance (up, true);
        values.push_back (progression.value (id, up));
        if (completed.contains (id))
            break;
    }
    return countDistinct (values);
}
} // namespace

std::array<SeriesInfo, numSeries> describeProgressions (const Settings& s)
{
    std::array<SeriesInfo, numSeries> result {};
    for (auto id : allSeries)
    {
        auto& info = result[(size_t) id];
        info.active = isSeriesActive (id, s);
        if (! info.active)
            continue;

        info.values = distinctValues (id, s);
        // Restart restarts with the longest pass among the series advancing on every trigger; with
        // Per Note Step that leaves out the pattern, so a pattern on its own just loops (as Free)
        Settings own = s;
        info.passAdvances = info.values > 1 ? passAdvances (id, s) : 0;
        if (info.values > 1 && info.passAdvances == 0 && s.link == LinkMode::Restart && s.curve == Curve::Linear)
        {
            own.link = LinkMode::Free;
            info.passAdvances = passAdvances (id, own);
        }
        // The pattern changes only at the end of an arp cycle. On its own (Free, no curve) it also
        // counts its own advances in cycles; linked or on a curve it follows the shared steps.
        info.perCycle = isCycleOnly (id) && s.advanceTrigger == AdvanceTrigger::NoteStep && own.link == LinkMode::Free
                        && s.curve == Curve::Linear;

        if (s.curve != Curve::Linear)
        {
            std::array<double, maxCustomSteps> steps {};
            info.curveSteps = curveSteps (s, steps);
            for (int i = 0; i < info.curveSteps; ++i)
            {
                info.curvePos[(size_t) i] = curveStepPos (id, i, s);
                info.curveValue[(size_t) i] = seriesValueAt (id, info.curvePos[(size_t) i], s);
            }
        }
    }
    return result;
}

} // namespace parp
