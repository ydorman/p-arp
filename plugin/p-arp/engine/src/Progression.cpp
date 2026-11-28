#include "parp/Progression.h"

#include <algorithm>
#include <cmath>

namespace parp
{

double jsRound (double value)
{
    return std::floor (value + 0.5);
}

// ---------------------------------------------------------------------------------------------
// Stepping
// ---------------------------------------------------------------------------------------------

SeriesPosition stepSeriesValue (SeriesPosition current, int minVal, int maxVal, Shape shape)
{
    if (minVal >= maxVal)
        return { minVal, 1 };

    int val = current.pos;
    int dir = current.dir;

    // Clamp within bounds
    if (val < minVal)
    {
        val = minVal;
        dir = 1;
    }
    else if (val > maxVal)
    {
        val = maxVal;
        dir = -1;
    }

    switch (shape)
    {
        case Shape::Up: // min -> ... -> max -> min
        case Shape::Random: // (stepped by Progression::stepPosition)
            if (++val > maxVal)
                val = minVal;
            dir = 1;
            break;
        case Shape::Down: // max -> ... -> min -> max
            if (--val < minVal)
                val = maxVal;
            dir = -1;
            break;
        case Shape::UpDown: // bounce without repeating the ends; the start sets the direction
        case Shape::DownUp:
        case Shape::Triangle:
            if (dir >= 0)
            {
                if (++val >= maxVal)
                {
                    val = maxVal;
                    dir = -1;
                }
            }
            else
            {
                if (--val <= minVal)
                {
                    val = minVal;
                    dir = 1;
                }
            }
            break;
    }
    return { val, dir };
}

SeriesPosition seriesStart (Shape shape, int minVal, int base, int maxVal)
{
    switch (shape)
    {
        case Shape::Up:
        case Shape::Triangle: // min -> max -> min
            return { minVal, 1 };
        case Shape::Down:
            return { maxVal, -1 };
        case Shape::DownUp: // base -> min -> max -> base
            return { base, base > minVal ? -1 : 1 };
        case Shape::UpDown: // base -> max -> min -> base
        case Shape::Random:
            break;
    }
    return { base, base < maxVal ? 1 : -1 };
}

int shapePassLength (Shape shape, int span)
{
    switch (shape)
    {
        case Shape::UpDown:
        case Shape::DownUp:
        case Shape::Triangle:
            return 2 * span;
        case Shape::Up:
        case Shape::Down:
        case Shape::Random: // as many advances as the range has values
            break;
    }
    return span + 1;
}

// ---------------------------------------------------------------------------------------------
// Series definitions
// ---------------------------------------------------------------------------------------------

namespace
{
bool isScaled (SeriesId id)
{
    return id == SeriesId::Gate || id == SeriesId::Velocity || id == SeriesId::Swing;
}

int spreadDown (SeriesId id, const Settings& s)
{
    switch (id)
    {
        case SeriesId::Pattern:  return s.patternSpreadDown;
        case SeriesId::Octave:   return s.octaveSpreadDown;
        case SeriesId::Rate:     return s.rateSpreadDown;
        case SeriesId::Gate:     return s.gateSpreadDown;
        case SeriesId::Velocity: return s.velocitySpreadDown;
        case SeriesId::Swing:    return s.swingSpreadDown;
    }
    return 0;
}

int spreadUp (SeriesId id, const Settings& s)
{
    switch (id)
    {
        case SeriesId::Pattern:  return s.patternSpreadUp;
        case SeriesId::Octave:   return s.octaveSpreadUp;
        case SeriesId::Rate:     return s.rateSpreadUp;
        case SeriesId::Gate:     return s.gateSpreadUp;
        case SeriesId::Velocity: return s.velocitySpreadUp;
        case SeriesId::Swing:    return s.swingSpreadUp;
    }
    return 0;
}

int stepsPerSide (SeriesId id, const Settings& s)
{
    switch (id)
    {
        case SeriesId::Gate:     return s.gateSteps;
        case SeriesId::Velocity: return s.velocitySteps;
        case SeriesId::Swing:    return s.swingSteps;
        default:                 return 1;
    }
}

// Value limits for a series
struct Limits
{
    int min;
    int max;
};

Limits limits (SeriesId id, const Settings& s)
{
    switch (id)
    {
        case SeriesId::Pattern:  return { 0, numPatterns - 1 };
        case SeriesId::Octave:
            if (s.octaveMode == OctaveMode::Transpose) // base + an octave offset of up to 3 either way
                return { s.baseOctave - 3, s.baseOctave + 3 };
            return { 1, 4 };
        case SeriesId::Rate:     return { 0, rateMaxPower }; // power within the base rate's family
        case SeriesId::Gate:     return { 1, 100 };
        case SeriesId::Velocity: return { 1, 127 };
        case SeriesId::Swing:    return { 50, 75 };
    }
    return { 0, 0 };
}

// Base parameter as a series position (range series)
int basePos (SeriesId id, const Settings& s)
{
    if (id == SeriesId::Rate)
        return rates()[(size_t) s.baseRate].power;
    return seriesBase (id, s);
}
} // namespace

bool isSeriesActive (SeriesId id, const Settings& s)
{
    switch (id)
    {
        case SeriesId::Pattern:  return s.patternActive;
        case SeriesId::Octave:   return s.octaveActive;
        case SeriesId::Rate:     return s.rateActive;
        case SeriesId::Gate:     return s.gateActive;
        case SeriesId::Velocity: return s.velocityActive;
        case SeriesId::Swing:    return s.swingActive;
    }
    return false;
}

bool isCycleOnly (SeriesId id)
{
    return id == SeriesId::Pattern;
}

int seriesBase (SeriesId id, const Settings& s)
{
    switch (id)
    {
        case SeriesId::Pattern:  return (int) s.pattern;
        case SeriesId::Octave:   return s.baseOctave;
        case SeriesId::Rate:     return s.baseRate;
        case SeriesId::Gate:     return s.gate;
        case SeriesId::Velocity: return s.velocity;
        case SeriesId::Swing:    return s.swing;
    }
    return 0;
}

double effectiveSpread (SeriesId id, const Settings& s, bool below)
{
    const double scaled = double (below ? spreadDown (id, s) : spreadUp (id, s)) * double (s.globalRange) / 100.0;
    return isScaled (id) ? scaled : jsRound (scaled);
}

Bounds seriesBounds (SeriesId id, const Settings& s)
{
    const double down = effectiveSpread (id, s, true);
    const double up = effectiveSpread (id, s, false);
    if (isScaled (id))
    {
        const int steps = stepsPerSide (id, s);
        return { down > 0 ? -steps : 0, 0, up > 0 ? steps : 0 };
    }
    const int base = basePos (id, s);
    const auto lim = limits (id, s);
    return { std::max (lim.min, base - int (down)), base, std::min (lim.max, base + int (up)) };
}

int seriesValueAt (SeriesId id, int pos, const Settings& s)
{
    if (id == SeriesId::Rate)
        return findRate (rates()[(size_t) s.baseRate].family, pos);
    if (! isScaled (id))
        return pos;

    const int base = seriesBase (id, s);
    const double steps = double (stepsPerSide (id, s));
    int value = base;
    if (pos < 0)
        value = base - int (jsRound (effectiveSpread (id, s, true) * double (-pos) / steps));
    else if (pos > 0)
        value = base + int (jsRound (effectiveSpread (id, s, false) * double (pos) / steps));
    const auto lim = limits (id, s);
    return std::clamp (value, lim.min, lim.max);
}

int curveSteps (const Settings& s, std::array<double, maxCustomSteps>& out)
{
    switch (s.curve)
    {
        case Curve::Accelerating:
            for (int i = 0; i < 8; ++i)
                out[(size_t) i] = 1.0 + 7.0 * std::pow (i / 7.0, 2.0);
            return 8;
        case Curve::Decelerating:
            for (int i = 0; i < 8; ++i)
                out[(size_t) i] = 1.0 + 7.0 * (1.0 - std::pow (1.0 - i / 7.0, 2.0));
            return 8;
        case Curve::Fibonacci:
            out = { 1, 2, 3, 5, 8 };
            return 5;
        case Curve::Primes:
            out = { 2, 3, 5, 7 };
            return 4;
        case Curve::Custom:
        {
            const int length = std::clamp (s.customLength, 1, maxCustomSteps);
            for (int i = 0; i < length; ++i)
                out[(size_t) i] = double (s.customSteps[(size_t) i]);
            return length;
        }
        case Curve::Linear:
        case Curve::Random: // every step of the scale
            for (int i = 0; i < 8; ++i)
                out[(size_t) i] = double (i + 1);
            return 8;
    }
    return 0;
}

// ---------------------------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------------------------

int Progression::value (SeriesId id, const Settings& s) const
{
    if (! isSeriesActive (id, s))
        return seriesBase (id, s);
    return seriesValueAt (id, position (id).pos, s);
}

void Progression::resetSeries (SeriesId id, const Settings& s)
{
    const auto b = seriesBounds (id, s);
    const auto start = seriesStart (s.shape, b.minPos, b.basePos, b.maxPos);
    positions[(size_t) id] = start;
    randomCounts[(size_t) id] = 0;
}

SeriesPosition Progression::stepPosition (SeriesPosition p, int minVal, int maxVal, Shape shape, int& count, bool& completed)
{
    completed = false;
    if (shape != Shape::Random)
    {
        return stepSeriesValue (p, minVal, maxVal, shape);
    }
    if (minVal >= maxVal)
        return { minVal, 1 };
    // A random position other than the current one (uniform over the others)
    const int current = std::clamp (p.pos, minVal, maxVal);
    int pos = minVal + rng.nextInt (maxVal - minVal);
    if (pos >= current)
        ++pos;
    if (++count >= shapePassLength (shape, maxVal - minVal))
    {
        count = 0;
        completed = true;
    }
    return { pos, 1 };
}

void Progression::reset (const Settings& s)
{
    ++resets;
    for (auto id : allSeries)
        resetSeries (id, s);
    const auto range = linkRange (s);
    const auto start = seriesStart (s.shape, -range.down, 0, range.up);
    link.pos = start.pos;
    link.dir = start.dir;
    link.count = 0;
    link.randomCount = 0;
    if (s.curve != Curve::Linear)
        resetCurve (s);
}

SeriesSet Progression::advance (const Settings& s, bool isCycleEnd)
{
    if (s.curve != Curve::Linear)
        return advanceCurve (s, isCycleEnd);
    switch (s.link)
    {
        case LinkMode::Locked:     return advanceLocked (s, isCycleEnd);
        case LinkMode::Restart: return advanceRestart (s, isCycleEnd);
        case LinkMode::Free:             break;
    }
    return advanceIndependent (s, isCycleEnd);
}

SeriesSet Progression::allActive (const Settings& s)
{
    SeriesSet set;
    for (auto id : allSeries)
        if (isSeriesActive (id, s))
            set.add (id);
    return set;
}

SeriesSet Progression::advanceIndependent (const Settings& s, bool isCycleEnd)
{
    SeriesSet completed;
    for (auto id : allSeries)
    {
        if (! isSeriesActive (id, s) || (isCycleOnly (id) && ! isCycleEnd))
            continue;
        const auto b = seriesBounds (id, s);
        auto& p = positions[(size_t) id];
        bool randomPassDone = false;
        p = stepPosition (p, b.minPos, b.maxPos, s.shape, randomCounts[(size_t) id], randomPassDone);
        const auto start = seriesStart (s.shape, b.minPos, b.basePos, b.maxPos);
        const bool backAtStart = s.shape != Shape::Random && p.pos == start.pos && p.dir == start.dir;
        if (b.minPos < b.maxPos && (backAtStart || randomPassDone))
            completed.add (id);
    }
    return completed;
}

// Locked: the largest distance below / above the base over active series
Progression::LinkRange Progression::linkRange (const Settings& s)
{
    LinkRange range;
    for (auto id : allSeries)
    {
        if (! isSeriesActive (id, s))
            continue;
        const auto b = seriesBounds (id, s);
        range.down = std::max (range.down, b.basePos - b.minPos);
        range.up = std::max (range.up, b.maxPos - b.basePos);
    }
    return range;
}

// Locked: a series' position for a master position (scaled onto its own range)
int Progression::linkedPos (SeriesId id, int masterPos, LinkRange range, const Settings& s)
{
    const auto b = seriesBounds (id, s);
    if (masterPos >= 0)
    {
        if (range.up == 0)
            return b.basePos;
        return b.basePos + int (jsRound (double (masterPos) / double (range.up) * double (b.maxPos - b.basePos)));
    }
    return b.basePos - int (jsRound (double (-masterPos) / double (range.down) * double (b.basePos - b.minPos)));
}

SeriesSet Progression::advanceLocked (const Settings& s, bool isCycleEnd)
{
    const auto range = linkRange (s);
    bool randomPassDone = false;
    const auto stepped = stepPosition ({ link.pos, link.dir }, -range.down, range.up, s.shape, link.randomCount, randomPassDone);
    link.pos = stepped.pos;
    link.dir = stepped.dir;
    for (auto id : allSeries)
    {
        if (! isSeriesActive (id, s) || (isCycleOnly (id) && ! isCycleEnd))
            continue; // cycle-only series pick up the shared phase at a cycle end
        positions[(size_t) id] = { linkedPos (id, link.pos, range, s), link.dir };
    }
    const auto start = seriesStart (s.shape, -range.down, 0, range.up);
    const bool backAtStart = s.shape != Shape::Random && link.pos == start.pos && link.dir == start.dir;
    if (range.down + range.up > 0 && (backAtStart || randomPassDone))
        return allActive (s);
    return {};
}

int Progression::passLength (SeriesId id, Shape shape, const Settings& s)
{
    const auto b = seriesBounds (id, s);
    const int span = b.maxPos - b.minPos;
    if (span == 0)
        return 1;
    return shapePassLength (shape, span);
}

SeriesSet Progression::advanceRestart (const Settings& s, bool isCycleEnd)
{
    advanceIndependent (s, isCycleEnd);
    // Longest pass among series advancing on every trigger (cycle-only series advance at a
    // different rate with Per Note Step, so they only restart along with the others)
    const bool perStep = s.advanceTrigger == AdvanceTrigger::NoteStep;
    int longest = 0;
    for (auto id : allSeries)
    {
        if (! isSeriesActive (id, s) || (isCycleOnly (id) && perStep))
            continue;
        longest = std::max (longest, passLength (id, s.shape, s));
    }
    if (++link.count >= longest && longest > 1)
    {
        reset (s);
        return allActive (s);
    }
    return {};
}

// ---------------------------------------------------------------------------------------------
// Series Curve: all active series follow the same step list (1..8 scale)
// ---------------------------------------------------------------------------------------------

void Progression::applyCurve (const Settings& s, bool isCycleEnd)
{
    std::array<double, maxCustomSteps> steps {};
    const int count = curveSteps (s, steps);
    const double step = steps[(size_t) std::min (curve.index, count - 1)];
    // The curve's shape is stretched over each range: its lowest step is the min, its highest the
    // max (so 1, 2 plays min, max even on a 2-value range). A flat curve keeps the 1..8 scale.
    double lowest = steps[0], highest = steps[0];
    for (int i = 1; i < count; ++i)
    {
        lowest = std::min (lowest, steps[(size_t) i]);
        highest = std::max (highest, steps[(size_t) i]);
    }
    if (highest - lowest < 1e-9)
    {
        lowest = 1.0;
        highest = 8.0;
    }
    const double fraction = (step - lowest) / (highest - lowest);
    for (auto id : allSeries)
    {
        if (! isSeriesActive (id, s) || (isCycleOnly (id) && ! isCycleEnd))
            continue;
        const auto b = seriesBounds (id, s);
        positions[(size_t) id].pos = b.minPos + int (jsRound (fraction * double (b.maxPos - b.minPos)));
    }
}

int Progression::pickRandomStep (int count)
{
    int index = rng.nextInt (count);
    if (count > 1 && index == curve.lastRandom)
        index = (index + 1 + rng.nextInt (count - 1)) % count;
    curve.lastRandom = index;
    return index;
}

namespace
{
// Where a shape starts in a curve's step list. A list has no base: Down and Down-Up play it
// backward first, the others forward (so Up-Down and Triangle both go forward then back).
SeriesPosition curveStart (Shape shape, int last)
{
    if (shape == Shape::Down || shape == Shape::DownUp)
        return { last, -1 };
    return { 0, 1 };
}

bool isRandomCurve (const Settings& s)
{
    return s.curve == Curve::Random || s.shape == Shape::Random;
}
} // namespace

void Progression::resetCurve (const Settings& s)
{
    std::array<double, maxCustomSteps> steps {};
    const int last = curveSteps (s, steps) - 1;
    const auto start = curveStart (s.shape, last);
    curve.index = start.pos;
    curve.dir = start.dir;
    curve.lastRandom = -1;
    curve.count = 0;
    if (isRandomCurve (s))
        curve.index = pickRandomStep (last + 1);
    applyCurve (s, true);
}

SeriesSet Progression::advanceCurve (const Settings& s, bool isCycleEnd)
{
    std::array<double, maxCustomSteps> steps {};
    const int last = curveSteps (s, steps) - 1;
    bool completed = false;
    if (isRandomCurve (s))
    {
        curve.index = pickRandomStep (last + 1);
        // The Random curve never completes a pass; the Random shape does after as many advances
        // as the curve has steps
        if (s.shape == Shape::Random && last > 0 && ++curve.count > last)
        {
            curve.count = 0;
            completed = true;
        }
    }
    else
    {
        const auto stepped = stepSeriesValue ({ curve.index, curve.dir }, 0, last, s.shape);
        curve.index = stepped.pos;
        curve.dir = stepped.dir;
        const auto start = curveStart (s.shape, last);
        completed = last > 0 && curve.index == start.pos && curve.dir == start.dir;
    }
    applyCurve (s, isCycleEnd);
    return completed ? allActive (s) : SeriesSet {};
}

// ---------------------------------------------------------------------------------------------
// Settings changes (the prototype's ParameterChanged rules, for a whole-block change)
// ---------------------------------------------------------------------------------------------

SettingsChangeResult Progression::applySettingsChange (const Settings& before, const Settings& after)
{
    SettingsChangeResult result;
    if (before == after)
        return result;

    // Rate controls changed by hand: snap the next note to the new rate's grid
    result.realignToRateGrid = before.baseRate != after.baseRate || before.rateActive != after.rateActive
                               || before.rateSpreadDown != after.rateSpreadDown || before.rateSpreadUp != after.rateSpreadUp
                               || (before.globalRange != after.globalRange && after.rateActive);

    // Restart a series when its position falls outside its bounds, or when its base, active
    // toggle, or the shape changes. Linked series (and series following a curve) restart
    // together; changing the curve or its steps restarts it.
    const bool linked = after.link != LinkMode::Free || after.curve != Curve::Linear;
    const bool linkChanged = before.link != after.link;
    const bool curveChanged = before.curve != after.curve;
    const bool customChanged = before.customLength != after.customLength || before.customSteps != after.customSteps;
    bool resyncAll = linkChanged || curveChanged || customChanged;

    for (auto id : allSeries)
    {
        const auto b = seriesBounds (id, after);
        const int pos = position (id).pos;
        const bool needsReset = pos < b.minPos || pos > b.maxPos
                                || isSeriesActive (id, before) != isSeriesActive (id, after)
                                || seriesBase (id, before) != seriesBase (id, after)
                                || before.shape != after.shape;
        if (! needsReset)
            continue;
        if (linked)
            resyncAll = true;
        else
            resetSeries (id, after);
    }

    if (linkChanged || curveChanged || (linked && (resyncAll || before.advanceTrigger != after.advanceTrigger)))
        reset (after);

    return result;
}

} // namespace parp
