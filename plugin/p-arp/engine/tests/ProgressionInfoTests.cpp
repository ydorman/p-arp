// describeProgressions: value counts, pass lengths and curve step values shown in the UI (#19)

#include "TestHarness.h"
#include "parp/ProgressionInfo.h"

using namespace parp;

namespace
{
using Vec = std::vector<int>;

const SeriesInfo& info (const std::array<SeriesInfo, numSeries>& all, SeriesId id)
{
    return all[(size_t) id];
}

// Velocity 70 -25/+25 in 3 steps a side: 7 values (45, 53, 62, 70, 78, 87, 95)
Settings velocity7()
{
    Settings s;
    s.velocityActive = true;
    s.velocity = 70;
    s.velocitySpreadDown = 25;
    s.velocitySpreadUp = 25;
    s.velocitySteps = 3;
    return s;
}

Vec curveValues (const SeriesInfo& i)
{
    return Vec (i.curveValue.begin(), i.curveValue.begin() + i.curveSteps);
}

Vec curvePositions (const SeriesInfo& i)
{
    return Vec (i.curvePos.begin(), i.curvePos.begin() + i.curveSteps);
}
} // namespace

TEST_CASE ("progression info: inactive series report nothing")
{
    const auto all = describeProgressions (Settings {});
    for (auto id : allSeries)
        CHECK (! info (all, id).active);
}

TEST_CASE ("progression info: values and pass length per shape")
{
    auto s = velocity7();
    const std::pair<Shape, int> passes[] = {
        { Shape::Up, 7 }, { Shape::Down, 7 }, { Shape::UpDown, 12 }, { Shape::DownUp, 12 }, { Shape::Triangle, 12 }, { Shape::Random, 7 },
    };
    for (const auto& [shape, pass] : passes)
    {
        s.shape = shape;
        const auto v = info (describeProgressions (s), SeriesId::Velocity);
        CHECK (v.active);
        CHECK_EQ (v.values, 7);
        CHECK_EQ (v.passAdvances, pass);
        CHECK_EQ (v.curveSteps, 0);
    }
}

TEST_CASE ("progression info: a range with values on both sides of the base has an odd count")
{
    Settings s;
    s.rateActive = true; // 1/8, one doubling each way: 1/4, 1/8, 1/16
    const auto r = info (describeProgressions (s), SeriesId::Rate);
    CHECK_EQ (r.values, 3);
    CHECK_EQ (r.passAdvances, 3);

    s.rateSpreadDown = 0;
    s.rateSpreadUp = 7; // 1/8 .. 1/128 (the range stops at the fastest rate)
    CHECK_EQ (info (describeProgressions (s), SeriesId::Rate).values, 5);
}

TEST_CASE ("progression info: a single value has no pass")
{
    auto s = velocity7();
    s.velocitySpreadDown = 0;
    s.velocitySpreadUp = 0;
    const auto v = info (describeProgressions (s), SeriesId::Velocity);
    CHECK (v.active);
    CHECK_EQ (v.values, 1);
    CHECK_EQ (v.passAdvances, 0);
}

TEST_CASE ("progression info: Locked shares the longest range's pass")
{
    auto s = velocity7();
    s.rateActive = true; // 3 values, scaled onto the velocity's 3 steps a side
    s.link = LinkMode::Locked;
    const auto all = describeProgressions (s);
    CHECK_EQ (info (all, SeriesId::Rate).values, 3);
    CHECK_EQ (info (all, SeriesId::Rate).passAdvances, 7);
    CHECK_EQ (info (all, SeriesId::Velocity).passAdvances, 7);
}

TEST_CASE ("progression info: Restart repeats every series with the longest pass")
{
    auto s = velocity7();
    s.rateActive = true;
    s.link = LinkMode::Restart;
    s.shape = Shape::UpDown;
    const auto all = describeProgressions (s);
    CHECK_EQ (info (all, SeriesId::Rate).passAdvances, 12);
    CHECK_EQ (info (all, SeriesId::Velocity).passAdvances, 12);
}

TEST_CASE ("progression info: the pattern counts arp cycles with Per Note Step")
{
    Settings s;
    s.patternActive = true; // Up-Down -1/+1: Up, Up-Down, Down-Up
    s.advanceTrigger = AdvanceTrigger::NoteStep;
    auto p = info (describeProgressions (s), SeriesId::Pattern);
    CHECK_EQ (p.values, 3);
    CHECK_EQ (p.passAdvances, 3);
    CHECK (p.perCycle);

    // Restart leaves the pattern out with Per Note Step: on its own it just loops
    s.link = LinkMode::Restart;
    p = info (describeProgressions (s), SeriesId::Pattern);
    CHECK_EQ (p.passAdvances, 3);
    CHECK (p.perCycle);

    // Locked: follows the shared steps
    s.link = LinkMode::Locked;
    CHECK (! info (describeProgressions (s), SeriesId::Pattern).perCycle);

    s.link = LinkMode::Free;
    s.advanceTrigger = AdvanceTrigger::Bar;
    CHECK (! info (describeProgressions (s), SeriesId::Pattern).perCycle);
}

TEST_CASE ("progression info: curve steps map onto each range")
{
    auto s = velocity7();
    s.velocitySteps = 4; // positions -4..4
    s.curve = Curve::Fibonacci; // 1, 2, 3, 5, 8 -> fractions 0, 1/7, 2/7, 4/7, 1
    const auto v = info (describeProgressions (s), SeriesId::Velocity);
    CHECK_EQ (curvePositions (v), (Vec { -4, -3, -2, 1, 4 }));
    CHECK_EQ (curveValues (v), (Vec { 45, 51, 57, 76, 95 }));
    CHECK_EQ (v.values, 5);
    CHECK_EQ (v.passAdvances, 5);
}

TEST_CASE ("progression info: a custom curve 2, 2, 5 plays min, min, max")
{
    Settings s;
    s.octaveActive = true;
    s.baseOctave = 1;
    s.octaveSpreadDown = 0;
    s.octaveSpreadUp = 3; // 1..4 octaves
    s.curve = Curve::Custom;
    s.customLength = 3;
    s.customSteps = { 2, 2, 5, 1, 1, 1, 1, 1 };
    auto o = info (describeProgressions (s), SeriesId::Octave);
    CHECK_EQ (curveValues (o), (Vec { 1, 1, 4 }));
    CHECK_EQ (o.values, 2);
    CHECK_EQ (o.passAdvances, 3);

    s.shape = Shape::UpDown; // forward then back: 2, 2, 5, 2
    o = info (describeProgressions (s), SeriesId::Octave);
    CHECK_EQ (o.passAdvances, 4);
}

TEST_CASE ("progression info: the Random curve has no fixed pass")
{
    auto s = velocity7();
    s.curve = Curve::Random;
    auto v = info (describeProgressions (s), SeriesId::Velocity);
    CHECK_EQ (v.curveSteps, 8);
    CHECK_EQ (v.values, 7); // 8 steps over 7 values
    CHECK_EQ (v.passAdvances, 0);

    s.shape = Shape::Random; // the Random shape counts a pass as many advances as steps
    v = info (describeProgressions (s), SeriesId::Velocity);
    CHECK_EQ (v.passAdvances, 8);
}
