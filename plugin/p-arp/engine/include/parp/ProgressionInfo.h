#pragma once

#include <array>
#include "parp/Progression.h"

namespace parp
{

// What each progression will do with the current settings, for the UI (roadmap #19): how many
// values it moves through, how long one pass takes, and which value each Series Curve step plays.
// Computed by running a Progression, so it follows the real rules (shape, Link, curve). Not
// real-time code: call it from the message thread.
struct SeriesInfo
{
    bool active = false;
    int values = 1;        // distinct values one pass plays
    int passAdvances = 0;  // advances in one pass; 0 = no fixed pass (Random curve)
    bool perCycle = false; // advances are arp cycles, whatever the Advance trigger (pattern with Per Note Step)

    // Series Curve on: the position (as Progression::position) and value each curve step plays
    int curveSteps = 0;
    std::array<int, maxCustomSteps> curvePos {};
    std::array<int, maxCustomSteps> curveValue {};
};

std::array<SeriesInfo, numSeries> describeProgressions (const Settings& s);

} // namespace parp
