// Ported from the Scripter prototype's Node tests (tests/progressive_arp.test.js): same inputs,
// same expected values. Section names follow the JS describe() blocks.

#include <set>
#include "TestHarness.h"
#include "parp/Progression.h"

using namespace parp;

namespace
{
using Vec = std::vector<int>;

int rate (const char* name)
{
    return rateIndex (name);
}

std::string rateName (int index)
{
    return std::string (rates()[(size_t) index].name);
}

// A Progression with its own random generator, reset with the given settings (like loading the
// prototype script, which restarts every series from the settings)
struct Fixture
{
    Settings s;
    Random rng { 1 };
    Progression progression { rng };

    explicit Fixture (Settings settings) : s (settings) { progression.reset (s); }

    int pos (SeriesId id) const { return progression.position (id).pos; }
    SeriesSet advance() { return progression.advance (s, true); }

    // Like setParam() in the JS tests: change settings and apply the change rules
    void change (const std::function<void (Settings&)>& edit)
    {
        Settings after = s;
        edit (after);
        progression.applySettingsChange (s, after);
        s = after;
    }
};

Vec stepRun (int start, int dir, int min, int max, Shape shape, int steps)
{
    Vec out;
    SeriesPosition p { start, dir };
    for (int i = 0; i < steps; ++i)
    {
        p = stepSeriesValue (p, min, max, shape);
        out.push_back (p.pos);
    }
    return out;
}

Vec valuesAt (SeriesId id, const Settings& s, const Vec& positions)
{
    Vec out;
    for (int p : positions)
        out.push_back (seriesValueAt (id, p, s));
    return out;
}
} // namespace

// ---------------------------------------------------------------------------------------------
// rates
// ---------------------------------------------------------------------------------------------

TEST_CASE ("rates: straight, dotted and triplet values for 1/1..1/128, slowest first")
{
    const auto& table = rates();
    CHECK_EQ (table.size(), size_t (24));
    const int quarter = rate ("1/4");
    CHECK_EQ (rateName (quarter + 1), std::string ("1/8 dotted"));
    CHECK_EQ (rateName (quarter + 2), std::string ("1/4 triplet"));
    CHECK_EQ (rateName (quarter + 3), std::string ("1/8"));
    for (size_t i = 1; i < table.size(); ++i)
        CHECK (table[i].beats < table[i - 1].beats);
    CHECK_EQ (rateName (0), std::string ("1/1 dotted"));
    CHECK_EQ (rateName (23), std::string ("1/128 triplet"));
}

TEST_CASE ("rates: step lengths and snap grids")
{
    const auto beatsOf = [] (const char* name) { return rates()[(size_t) rate (name)].beats; };
    CHECK_EQ (beatsOf ("1/1"), 4.0);
    CHECK_EQ (beatsOf ("1/4"), 1.0);
    CHECK_EQ (beatsOf ("1/8"), 0.5);
    CHECK_EQ (beatsOf ("1/128"), 0.03125);
    CHECK_EQ (beatsOf ("1/8 dotted"), 0.75);
    CHECK (std::abs (beatsOf ("1/4 triplet") - 2.0 / 3.0) < 1e-12);
    CHECK_EQ (rates()[(size_t) rate ("1/8 dotted")].grid, 0.25); // dotted: snaps to its pulse
    CHECK_EQ (rates()[(size_t) rate ("1/8")].grid, 0.5);
    CHECK_EQ (Settings {}.baseRate, rate ("1/8"));
}

// ---------------------------------------------------------------------------------------------
// stepSeriesValue
// ---------------------------------------------------------------------------------------------

TEST_CASE ("stepSeriesValue: Up is a rising sawtooth")
{
    CHECK_EQ (stepRun (1, 1, 1, 3, Shape::Up, 6), (Vec { 2, 3, 1, 2, 3, 1 }));
}

TEST_CASE ("stepSeriesValue: Down is a falling sawtooth")
{
    CHECK_EQ (stepRun (3, -1, 1, 3, Shape::Down, 6), (Vec { 2, 1, 3, 2, 1, 3 }));
}

TEST_CASE ("stepSeriesValue: Triangle bounces without repeating the ends")
{
    CHECK_EQ (stepRun (2, 1, 1, 3, Shape::UpDown, 8), (Vec { 3, 2, 1, 2, 3, 2, 1, 2 }));
}

TEST_CASE ("stepSeriesValue: returns min when the range is a single value")
{
    CHECK_EQ (stepRun (2, 1, 2, 2, Shape::UpDown, 3), (Vec { 2, 2, 2 }));
}

TEST_CASE ("stepSeriesValue: clamps an out-of-range current value back into range")
{
    CHECK_EQ (stepRun (9, 1, 1, 3, Shape::Up, 2), (Vec { 1, 2 }));
}

// ---------------------------------------------------------------------------------------------
// series bounds
// ---------------------------------------------------------------------------------------------

TEST_CASE ("series bounds: octave bounds are clamped to 1..4")
{
    Settings s;
    s.baseOctave = 4;
    s.octaveSpreadDown = 3;
    s.octaveSpreadUp = 3;
    const auto b = seriesBounds (SeriesId::Octave, s);
    CHECK_EQ ((Vec { b.minPos, b.basePos, b.maxPos }), (Vec { 1, 4, 4 }));
}

TEST_CASE ("series bounds: rate bounds are doublings within the base rate's family")
{
    const auto names = [] (const char* base, int down, int up) {
        Settings s;
        s.baseRate = rate (base);
        s.rateSpreadDown = down;
        s.rateSpreadUp = up;
        const auto b = seriesBounds (SeriesId::Rate, s);
        return rateName (seriesValueAt (SeriesId::Rate, b.minPos, s)) + " | "
             + rateName (seriesValueAt (SeriesId::Rate, b.basePos, s)) + " | "
             + rateName (seriesValueAt (SeriesId::Rate, b.maxPos, s));
    };
    CHECK_EQ (names ("1/16", 1, 7), std::string ("1/8 | 1/16 | 1/128"));
    CHECK_EQ (names ("1/8 triplet", 1, 1), std::string ("1/4 triplet | 1/8 triplet | 1/16 triplet"));
    CHECK_EQ (names ("1/4 dotted", 7, 2), std::string ("1/1 dotted | 1/4 dotted | 1/16 dotted"));
}

TEST_CASE ("series bounds: pattern bounds are clamped to the menu range")
{
    Settings s;
    s.pattern = Pattern::Down;
    s.patternSpreadDown = 3;
    s.patternSpreadUp = 5;
    const auto b = seriesBounds (SeriesId::Pattern, s);
    CHECK_EQ ((Vec { b.minPos, b.basePos, b.maxPos }), (Vec { (int) Pattern::Up, (int) Pattern::Down, (int) Pattern::Random }));
}

TEST_CASE ("series bounds: velocity steps collapse on a side with zero spread")
{
    Settings s;
    s.velocitySpreadDown = 0;
    s.velocitySpreadUp = 10;
    const auto b = seriesBounds (SeriesId::Velocity, s);
    CHECK_EQ ((Vec { b.minPos, b.maxPos }), (Vec { 0, 4 }));
}

TEST_CASE ("series bounds: octave Transpose allows up to 3 octaves either side of the base")
{
    Settings s;
    s.octaveMode = OctaveMode::Transpose;
    s.baseOctave = 1;
    s.octaveSpreadDown = 3;
    s.octaveSpreadUp = 3;
    const auto b = seriesBounds (SeriesId::Octave, s);
    CHECK_EQ ((Vec { b.minPos, b.basePos, b.maxPos }), (Vec { -2, 1, 4 }));
}

// ---------------------------------------------------------------------------------------------
// velocity / gate series values, configurable steps
// ---------------------------------------------------------------------------------------------

TEST_CASE ("velocity: returns the base when velocity mod is off")
{
    Settings s;
    s.velocity = 70;
    Fixture f (s);
    f.progression.position (SeriesId::Velocity).pos = 4;
    CHECK_EQ (f.progression.value (SeriesId::Velocity, f.s), 70);
}

TEST_CASE ("velocity: spreads 4 steps on each side of the base")
{
    Settings s;
    s.velocity = 70;
    s.velocityActive = true;
    s.velocitySpreadDown = 25;
    s.velocitySpreadUp = 25;
    CHECK_EQ (valuesAt (SeriesId::Velocity, s, { -4, -3, -2, -1, 0, 1, 2, 3, 4 }),
              (Vec { 45, 51, 57, 64, 70, 76, 83, 89, 95 }));
}

TEST_CASE ("velocity: clamps to 1..127")
{
    Settings s;
    s.velocity = 120;
    s.velocityActive = true;
    s.velocitySpreadDown = 64;
    s.velocitySpreadUp = 64;
    CHECK_EQ (seriesValueAt (SeriesId::Velocity, 4, s), 127);
    s.velocity = 10;
    CHECK_EQ (seriesValueAt (SeriesId::Velocity, -4, s), 1);
}

TEST_CASE ("configurable steps: velocity steps per side set the series resolution")
{
    Settings s;
    s.velocity = 70;
    s.velocityActive = true;
    s.velocitySpreadDown = 24;
    s.velocitySpreadUp = 24;
    s.velocitySteps = 2;
    const auto b = seriesBounds (SeriesId::Velocity, s);
    CHECK_EQ ((Vec { b.minPos, b.maxPos }), (Vec { -2, 2 }));
    CHECK_EQ (valuesAt (SeriesId::Velocity, s, { -2, -1, 0, 1, 2 }), (Vec { 46, 58, 70, 82, 94 }));
}

TEST_CASE ("configurable steps: a single step jumps straight to the spread ends")
{
    Settings s;
    s.gate = 60;
    s.gateActive = true;
    s.gateSpreadDown = 30;
    s.gateSpreadUp = 40;
    s.gateSteps = 1;
    CHECK_EQ (valuesAt (SeriesId::Gate, s, { -1, 0, 1 }), (Vec { 30, 60, 100 }));
}

TEST_CASE ("configurable steps: gate and velocity steps are independent")
{
    Settings s;
    s.gateSteps = 8;
    s.velocitySteps = 1;
    CHECK_EQ (seriesBounds (SeriesId::Gate, s).maxPos, 8);
    CHECK_EQ (seriesBounds (SeriesId::Velocity, s).maxPos, 1);
}

TEST_CASE ("configurable steps: reducing steps restarts a series that falls outside the new range")
{
    Settings s;
    s.velocityActive = true;
    s.velocitySteps = 8;
    s.shape = Shape::Down;
    Fixture f (s);
    CHECK_EQ (f.pos (SeriesId::Velocity), 8);
    f.change ([] (Settings& x) { x.velocitySteps = 3; });
    CHECK_EQ (f.pos (SeriesId::Velocity), 3);
}

TEST_CASE ("gate: returns the base when gate mod is off")
{
    Settings s;
    s.gate = 80;
    Fixture f (s);
    f.progression.position (SeriesId::Gate).pos = -4;
    CHECK_EQ (f.progression.value (SeriesId::Gate, f.s), 80);
}

TEST_CASE ("gate: spreads 4 steps on each side of the base")
{
    Settings s;
    s.gate = 80;
    s.gateActive = true;
    s.gateSpreadDown = 40;
    s.gateSpreadUp = 20;
    CHECK_EQ (valuesAt (SeriesId::Gate, s, { -4, -3, -2, -1, 0, 1, 2, 3, 4 }),
              (Vec { 40, 50, 60, 70, 80, 85, 90, 95, 100 }));
}

TEST_CASE ("gate: clamps to 10..100")
{
    Settings s;
    s.gate = 20;
    s.gateActive = true;
    s.gateSpreadDown = 40;
    s.gateSpreadUp = 90;
    CHECK_EQ (seriesValueAt (SeriesId::Gate, -4, s), 10);
    CHECK_EQ (seriesValueAt (SeriesId::Gate, 4, s), 100);
}

// ---------------------------------------------------------------------------------------------
// series modulation (direct series stepping)
// ---------------------------------------------------------------------------------------------

TEST_CASE ("triangle starts at the base and bounces")
{
    Settings s;
    s.baseOctave = 2;
    s.octaveActive = true;
    s.octaveSpreadDown = 1;
    s.octaveSpreadUp = 1;
    s.shape = Shape::UpDown;
    Fixture f (s);
    Vec seen { f.pos (SeriesId::Octave) };
    for (int i = 0; i < 5; ++i)
    {
        f.advance();
        seen.push_back (f.pos (SeriesId::Octave));
    }
    CHECK_EQ (seen, (Vec { 2, 3, 2, 1, 2, 3 }));
}

TEST_CASE ("triangle with base at the top does not repeat the top after a parameter change")
{
    Settings s;
    s.baseOctave = 4;
    s.octaveSpreadDown = 1;
    s.octaveSpreadUp = 0;
    s.shape = Shape::UpDown;
    Fixture f (s);
    f.change ([] (Settings& x) { x.octaveActive = true; });
    Vec seen { f.pos (SeriesId::Octave) };
    for (int i = 0; i < 3; ++i)
    {
        f.advance();
        seen.push_back (f.pos (SeriesId::Octave));
    }
    CHECK_EQ (seen, (Vec { 4, 3, 4, 3 }));
}

TEST_CASE ("moving a Base restarts its series from the start of the new range")
{
    Settings s;
    s.baseOctave = 2;
    s.octaveActive = true;
    s.octaveSpreadDown = 1;
    s.octaveSpreadUp = 1;
    s.shape = Shape::Up;
    Fixture f (s);
    f.advance();
    f.advance();
    CHECK_EQ (f.pos (SeriesId::Octave), 3);
    f.change ([] (Settings& x) { x.baseOctave = 3; });
    CHECK_EQ (f.pos (SeriesId::Octave), 2);
}

TEST_CASE ("pattern only advances at a cycle end")
{
    Settings s;
    s.pattern = Pattern::Up;
    s.patternActive = true;
    s.patternSpreadDown = 0;
    s.patternSpreadUp = 1;
    s.velocityActive = true;
    Fixture f (s);
    f.progression.advance (f.s, false);
    CHECK_EQ (f.pos (SeriesId::Pattern), 0);
    CHECK_EQ (f.pos (SeriesId::Velocity), -3);
    f.progression.advance (f.s, true);
    CHECK_EQ (f.pos (SeriesId::Pattern), 1);
}

// ---------------------------------------------------------------------------------------------
// link series
// ---------------------------------------------------------------------------------------------

namespace
{
// Octave 1..3 (2 steps above base 1) and velocity k = -4..+4 around its base
Settings twoSeries (LinkMode link, Shape shape)
{
    Settings s;
    s.link = link;
    s.shape = shape;
    s.baseOctave = 1;
    s.octaveActive = true;
    s.octaveSpreadDown = 0;
    s.octaveSpreadUp = 2;
    s.velocityActive = true;
    s.velocitySpreadDown = 25;
    s.velocitySpreadUp = 25;
    s.velocitySteps = 4;
    return s;
}

// Positions of [octave, velocity] before and after each of `steps` advances
std::pair<Vec, Vec> walkOctaveVelocity (const Settings& s, int steps)
{
    Fixture f (s);
    Vec octave { f.pos (SeriesId::Octave) }, velocity { f.pos (SeriesId::Velocity) };
    for (int i = 0; i < steps; ++i)
    {
        f.advance();
        octave.push_back (f.pos (SeriesId::Octave));
        velocity.push_back (f.pos (SeriesId::Velocity));
    }
    return { octave, velocity };
}
} // namespace

TEST_CASE ("link Off: each series wraps at its own length")
{
    const auto [octave, velocity] = walkOctaveVelocity (twoSeries (LinkMode::Off, Shape::Up), 9);
    CHECK_EQ (octave, (Vec { 1, 2, 3, 1, 2, 3, 1, 2, 3, 1 }));
    CHECK_EQ (velocity, (Vec { -4, -3, -2, -1, 0, 1, 2, 3, 4, -4 }));
}

TEST_CASE ("link Shared Phase (Up): all series hit min, base and max together")
{
    const auto [octave, velocity] = walkOctaveVelocity (twoSeries (LinkMode::SharedPhase, Shape::Up), 9);
    CHECK_EQ (velocity, (Vec { -4, -3, -2, -1, 0, 1, 2, 3, 4, -4 }));
    CHECK_EQ (octave, (Vec { 1, 1, 1, 1, 1, 2, 2, 3, 3, 1 }));
}

TEST_CASE ("link Shared Phase (Up-Down): starts at every base, peaks and bottoms together")
{
    const auto [octave, velocity] = walkOctaveVelocity (twoSeries (LinkMode::SharedPhase, Shape::UpDown), 16);
    CHECK_EQ (velocity, (Vec { 0, 1, 2, 3, 4, 3, 2, 1, 0, -1, -2, -3, -4, -3, -2, -1, 0 }));
    CHECK_EQ (octave, (Vec { 1, 2, 2, 3, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1 }));
}

TEST_CASE ("link Shared Phase with equal ranges is the same as Off")
{
    const auto run = [] (LinkMode link) {
        Settings s;
        s.link = link;
        s.shape = Shape::Up;
        s.octaveActive = true;
        s.octaveSpreadDown = 0;
        s.octaveSpreadUp = 2;
        s.baseOctave = 1;
        s.rateActive = true;
        s.rateSpreadDown = 0;
        s.rateSpreadUp = 2;
        Fixture f (s);
        Vec out;
        for (int i = 0; i < 7; ++i)
        {
            out.push_back (f.pos (SeriesId::Octave) * 100 + f.pos (SeriesId::Rate));
            f.advance();
        }
        return out;
    };
    CHECK_EQ (run (LinkMode::SharedPhase), run (LinkMode::Off));
}

TEST_CASE ("link Restart Together: shorter series repeat until the longest completes its pass")
{
    Settings s;
    s.link = LinkMode::RestartTogether;
    s.shape = Shape::Up;
    s.baseOctave = 1;
    s.octaveActive = true;
    s.octaveSpreadDown = 0;
    s.octaveSpreadUp = 1; // 2 values
    s.velocityActive = true;
    s.velocitySpreadDown = 0;
    s.velocitySpreadUp = 20;
    s.velocitySteps = 4; // k 0..4, 5 values
    const auto [octave, velocity] = walkOctaveVelocity (s, 11);
    CHECK_EQ (velocity, (Vec { 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1 }));
    CHECK_EQ (octave, (Vec { 1, 2, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2 }));
}

TEST_CASE ("linked series report a completed pass together")
{
    auto s = twoSeries (LinkMode::SharedPhase, Shape::Up);
    s.rateActive = true;
    s.rateSpreadUp = 1;
    Fixture f (s);
    Vec passes;
    for (int i = 0; i < 18; ++i)
        if (f.advance().contains (SeriesId::Rate))
            passes.push_back (i + 1);
    CHECK_EQ (passes, (Vec { 9, 18 }));
}

TEST_CASE ("changing one series' base restarts all linked series")
{
    Fixture f (twoSeries (LinkMode::SharedPhase, Shape::Up));
    for (int i = 0; i < 6; ++i)
        f.advance();
    f.change ([] (Settings& x) { x.velocity = 90; });
    CHECK_EQ ((Vec { f.pos (SeriesId::Octave), f.pos (SeriesId::Velocity) }), (Vec { 1, -4 }));
}

// ---------------------------------------------------------------------------------------------
// global range
// ---------------------------------------------------------------------------------------------

namespace
{
Settings globalRangeSet (int pct)
{
    Settings s;
    s.globalRange = pct;
    s.baseOctave = 2;
    s.octaveActive = true;
    s.octaveSpreadDown = 1;
    s.octaveSpreadUp = 2;
    s.velocity = 70;
    s.velocityActive = true;
    s.velocitySpreadDown = 24;
    s.velocitySpreadUp = 24;
    s.velocitySteps = 4;
    s.baseRate = rateIndex ("1/8");
    s.rateActive = true;
    s.rateSpreadDown = 2;
    s.rateSpreadUp = 2;
    return s;
}

Vec rangeOf (SeriesId id, const Settings& s)
{
    const auto b = seriesBounds (id, s);
    return { seriesValueAt (id, b.minPos, s), seriesValueAt (id, b.maxPos, s) };
}

std::string rateRangeOf (const Settings& s)
{
    const auto r = rangeOf (SeriesId::Rate, s);
    return rateName (r[0]) + " .. " + rateName (r[1]);
}
} // namespace

TEST_CASE ("global range: 100% (default) leaves every series' spread as set")
{
    const auto s = globalRangeSet (100);
    CHECK_EQ (rangeOf (SeriesId::Octave, s), (Vec { 1, 4 }));
    CHECK_EQ (rangeOf (SeriesId::Velocity, s), (Vec { 46, 94 }));
    CHECK_EQ (rateRangeOf (s), std::string ("1/2 .. 1/32"));
}

TEST_CASE ("global range: 50% halves every spread on both sides")
{
    const auto s = globalRangeSet (50);
    CHECK_EQ (rangeOf (SeriesId::Octave, s), (Vec { 1, 3 })); // 1 x 50% rounds to 1; 2 x 50% = 1
    CHECK_EQ (rangeOf (SeriesId::Velocity, s), (Vec { 58, 82 }));
    CHECK_EQ (rateRangeOf (s), std::string ("1/4 .. 1/16"));
}

TEST_CASE ("global range: whole-value spreads round to the nearest step as the knob turns")
{
    Vec mins;
    for (int pct : { 100, 50, 49, 0 })
        mins.push_back (rangeOf (SeriesId::Octave, globalRangeSet (pct))[0]);
    CHECK_EQ (mins, (Vec { 1, 1, 2, 2 }));
}

TEST_CASE ("global range: 0% keeps every series at its base")
{
    const auto s = globalRangeSet (0);
    CHECK_EQ (rangeOf (SeriesId::Octave, s), (Vec { 2, 2 }));
    CHECK_EQ (rangeOf (SeriesId::Velocity, s), (Vec { 70, 70 }));
    CHECK_EQ (rateRangeOf (s), std::string ("1/8 .. 1/8"));
}

TEST_CASE ("global range: velocity keeps its step count and compresses the distance")
{
    CHECK_EQ (valuesAt (SeriesId::Velocity, globalRangeSet (50), { -4, -2, 0, 2, 4 }), (Vec { 58, 64, 70, 76, 82 }));
}

TEST_CASE ("global range: turning the knob down mid-play pulls series back into range")
{
    auto s = globalRangeSet (100);
    s.shape = Shape::Up;
    Fixture f (s);
    for (int i = 0; i < 3; ++i)
        f.advance(); // octave reaches 4
    f.change ([] (Settings& x) { x.globalRange = 0; });
    const auto b = seriesBounds (SeriesId::Octave, f.s);
    CHECK (f.pos (SeriesId::Octave) >= b.minPos && f.pos (SeriesId::Octave) <= b.maxPos);
}

TEST_CASE ("global range: scales a linked (Shared Phase) progression as a whole")
{
    const auto walk = [] (int pct) {
        auto s = globalRangeSet (pct);
        s.link = LinkMode::SharedPhase;
        s.shape = Shape::Up;
        Fixture f (s);
        Vec out;
        for (int i = 0; i < 9; ++i)
        {
            out.push_back (f.progression.value (SeriesId::Velocity, f.s));
            f.advance();
        }
        return out;
    };
    CHECK_EQ (walk (100), (Vec { 46, 52, 58, 64, 70, 76, 82, 88, 94 }));
    CHECK_EQ (walk (50), (Vec { 58, 61, 64, 67, 70, 73, 76, 79, 82 }));
}

TEST_CASE ("global range: changing it with rate modulation on asks for a grid realign")
{
    auto s = globalRangeSet (100);
    Random rng;
    Progression p (rng);
    p.reset (s);
    auto after = s;
    after.globalRange = 50;
    CHECK (p.applySettingsChange (s, after).realignToRateGrid);
    s.rateActive = false;
    after.rateActive = false;
    CHECK (! p.applySettingsChange (s, after).realignToRateGrid);
}

// ---------------------------------------------------------------------------------------------
// series curve
// ---------------------------------------------------------------------------------------------

namespace
{
// velocity k = -4..+4 (9 positions) and octave 1..4 (4 positions)
Settings curveSet (Curve curve, Shape shape)
{
    Settings s;
    s.curve = curve;
    s.shape = shape;
    s.velocity = 70;
    s.velocityActive = true;
    s.velocitySpreadDown = 24;
    s.velocitySpreadUp = 24;
    s.velocitySteps = 4;
    s.baseOctave = 1;
    s.octaveActive = true;
    s.octaveSpreadDown = 0;
    s.octaveSpreadUp = 3;
    return s;
}

Settings custom (Settings s, const Vec& steps)
{
    s.curve = Curve::Custom;
    s.customLength = (int) steps.size();
    for (size_t i = 0; i < steps.size(); ++i)
        s.customSteps[i] = steps[i];
    return s;
}

// [velocity, octave] positions at each of `count` advances (before advancing)
std::pair<Vec, Vec> walkCurve (const Settings& s, int count)
{
    Fixture f (s);
    Vec velocity, octave;
    for (int i = 0; i < count; ++i)
    {
        velocity.push_back (f.pos (SeriesId::Velocity));
        octave.push_back (f.pos (SeriesId::Octave));
        f.advance();
    }
    return { velocity, octave };
}
} // namespace

TEST_CASE ("curve: Linear (default) is unchanged")
{
    CHECK_EQ (walkCurve (curveSet (Curve::Linear, Shape::Up), 10).first, (Vec { -4, -3, -2, -1, 0, 1, 2, 3, 4, -4 }));
}

TEST_CASE ("curve: Custom 1, 5, 6, 8 on each series' own range, all series together")
{
    const auto [velocity, octave] = walkCurve (custom (curveSet (Curve::Linear, Shape::Up), { 1, 5, 6, 8 }), 5);
    CHECK_EQ (velocity, (Vec { -4, 1, 2, 4, -4 }));
    CHECK_EQ (octave, (Vec { 1, 3, 3, 4, 1 }));
}

TEST_CASE ("curve: Down plays the list backward, Up-Down forward then back")
{
    CHECK_EQ (walkCurve (custom (curveSet (Curve::Linear, Shape::Down), { 1, 5, 6, 8 }), 5).first, (Vec { 4, 2, 1, -4, 4 }));
    CHECK_EQ (walkCurve (custom (curveSet (Curve::Linear, Shape::UpDown), { 1, 5, 6, 8 }), 8).first,
              (Vec { -4, 1, 2, 4, 2, 1, -4, 1 }));
}

TEST_CASE ("curve: Accelerating small steps first; Decelerating the reverse")
{
    CHECK_EQ (walkCurve (curveSet (Curve::Accelerating, Shape::Up), 8).first, (Vec { -4, -4, -3, -3, -1, 0, 2, 4 }));
    CHECK_EQ (walkCurve (curveSet (Curve::Decelerating, Shape::Up), 8).first, (Vec { -4, -2, 0, 1, 3, 3, 4, 4 }));
}

TEST_CASE ("curve: Fibonacci and Primes use their step lists")
{
    CHECK_EQ (walkCurve (curveSet (Curve::Fibonacci, Shape::Up), 6).first, (Vec { -4, -3, -2, 1, 4, -4 }));
    CHECK_EQ (walkCurve (curveSet (Curve::Primes, Shape::Up), 5).first, (Vec { -3, -2, 1, 3, -3 }));
}

TEST_CASE ("curve: Random picks steps from the scale and never repeats the previous one")
{
    Fixture f (curveSet (Curve::Random, Shape::Up));
    f.rng.setSeed (5);
    Vec seen;
    for (int i = 0; i < 40; ++i)
    {
        seen.push_back (f.progression.curveIndex());
        f.advance();
    }
    for (size_t i = 1; i < seen.size(); ++i)
        CHECK (seen[i] != seen[i - 1]);
    CHECK (std::set<int> (seen.begin(), seen.end()).size() >= 6);
    for (int v : seen)
        CHECK (v >= 0 && v <= 7);
}

TEST_CASE ("curve: reports a completed pass at the end of the list")
{
    auto s = custom (curveSet (Curve::Linear, Shape::Up), { 1, 5, 6, 8 });
    s.rateActive = true;
    s.rateSpreadUp = 1;
    Fixture f (s);
    Vec passes;
    for (int i = 0; i < 8; ++i)
        if (f.advance().contains (SeriesId::Rate))
            passes.push_back (i + 1);
    CHECK_EQ (passes, (Vec { 4, 8 }));
}

TEST_CASE ("curve: changing a custom step restarts the curve")
{
    Fixture f (custom (curveSet (Curve::Linear, Shape::Up), { 1, 5, 6, 8 }));
    f.advance();
    f.advance();
    f.change ([] (Settings& x) { x.customSteps[0] = 8; });
    CHECK_EQ (f.progression.curveIndex(), 0);
    CHECK_EQ (f.pos (SeriesId::Velocity), 4);
}

TEST_CASE ("curve: works with Global Range (scales into the narrower range)")
{
    auto s = custom (curveSet (Curve::Linear, Shape::Up), { 1, 8 });
    s.globalRange = 50;
    const auto velocity = walkCurve (s, 2).first;
    CHECK_EQ (valuesAt (SeriesId::Velocity, s, velocity), (Vec { 58, 82 }));
}
