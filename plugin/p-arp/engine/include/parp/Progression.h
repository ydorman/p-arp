#pragma once

#include <array>
#include <cstdint>
#include <vector>
#include "parp/Random.h"
#include "parp/Settings.h"

namespace parp
{

// The modulated targets ("series"). Order matches the Scripter prototype.
enum class SeriesId { Pattern, Octave, Rate, Gate, Velocity, Swing };
inline constexpr int numSeries = 6;
inline constexpr std::array<SeriesId, numSeries> allSeries {
    SeriesId::Pattern, SeriesId::Octave, SeriesId::Rate, SeriesId::Gate, SeriesId::Velocity, SeriesId::Swing
};

// Position bounds of a series around its base.
// "Range" series (pattern, octave, rate) move in whole values: position = the value (rate:
// the power within the base rate's family). "Scaled" series (gate, velocity, swing) move in
// steps k = -steps..+steps around the base (position 0 = exactly the base).
struct Bounds
{
    int minPos = 0;
    int basePos = 0;
    int maxPos = 0;
};

struct SeriesPosition
{
    int pos = 0;
    int dir = 1; // +1 / -1 (direction for the Up-Down shape)
};

// Set of series (bit per SeriesId), e.g. which series just completed a pass
class SeriesSet
{
public:
    void add (SeriesId id) { bits = std::uint8_t (bits | bit (id)); }
    bool contains (SeriesId id) const { return (bits & bit (id)) != 0; }
    bool empty() const { return bits == 0; }

private:
    static std::uint8_t bit (SeriesId id) { return std::uint8_t (1u << unsigned (id)); }
    std::uint8_t bits = 0;
};

// What a settings change requires from the scheduler
struct SettingsChangeResult
{
    bool realignToRateGrid = false; // rate controls changed by hand: snap the next note to the new grid
};

// JavaScript Math.round (rounds .5 up, also for negatives), so results match the prototype
double jsRound (double value);

// Step a value across [minVal, maxVal] with the given shape (Up / Down sawtooth, Up-Down triangle)
SeriesPosition stepSeriesValue (SeriesPosition current, int minVal, int maxVal, Shape shape);

// Starting point for a shape: Up starts at min, Down at max, Up-Down at the base
SeriesPosition seriesStart (Shape shape, int minVal, int base, int maxVal);

// Static description of the series for given settings
bool isSeriesActive (SeriesId id, const Settings& s);
bool isCycleOnly (SeriesId id); // pattern: advances only at the end of an arp cycle
int seriesBase (SeriesId id, const Settings& s);
double effectiveSpread (SeriesId id, const Settings& s, bool below); // scaled by Global Range
Bounds seriesBounds (SeriesId id, const Settings& s);
int seriesValueAt (SeriesId id, int pos, const Settings& s); // pattern index, octaves, rate index, %, velocity

// Steps of the selected curve on the 1..8 scale (1 = each series' min, 8 = its max).
// Fills `out` (capacity 8) without allocating; returns the number of steps.
int curveSteps (const Settings& s, std::array<double, maxCustomSteps>& out);

// The series system: positions of all series, Link Series state and Series Curve state.
// Real-time safe: no allocation after construction.
class Progression
{
public:
    explicit Progression (Random& random) : rng (random) {}

    // Restart every series (and the link / curve state) from its starting point
    void reset (const Settings& s);

    // Advance active series once. isCycleEnd: called at the end of an arp cycle (cycle-only
    // series advance only then). Returns the series that just completed a full pass; linked
    // series and curves complete together.
    SeriesSet advance (const Settings& s, bool isCycleEnd);

    // Apply the prototype's ParameterChanged rules for a change from `before` to `after`
    SettingsChangeResult applySettingsChange (const Settings& before, const Settings& after);

    // Value currently in effect (the base when the series is not active)
    int value (SeriesId id, const Settings& s) const;

    SeriesPosition& position (SeriesId id) { return positions[(size_t) id]; }
    const SeriesPosition& position (SeriesId id) const { return positions[(size_t) id]; }
    int curveIndex() const { return curve.index; }

private:
    void resetSeries (SeriesId id, const Settings& s);
    SeriesSet advanceIndependent (const Settings& s, bool isCycleEnd);
    SeriesSet advanceShared (const Settings& s, bool isCycleEnd);
    SeriesSet advanceRestartTogether (const Settings& s, bool isCycleEnd);
    SeriesSet advanceCurve (const Settings& s, bool isCycleEnd);
    void resetCurve (const Settings& s);
    void applyCurve (const Settings& s, bool isCycleEnd);
    int pickRandomStep (int count);
    static SeriesSet allActive (const Settings& s);

    struct LinkRange
    {
        int down = 0;
        int up = 0;
    };
    static LinkRange linkRange (const Settings& s);
    static int linkedPos (SeriesId id, int masterPos, LinkRange range, const Settings& s);
    static int passLength (SeriesId id, Shape shape, const Settings& s);

    Random& rng;
    std::array<SeriesPosition, numSeries> positions {};
    struct { int pos = 0; int dir = 1; int count = 0; } link;
    struct { int index = 0; int dir = 1; int lastRandom = -1; } curve;
};

} // namespace parp
