#pragma once

#include <array>
#include "parp/Rates.h"

namespace parp
{

// Menu choices. Enumerator order = menu order in the Scripter prototype.
enum class AdvanceTrigger { ArpCycle, NoteStep, Beat, Bar, TwoBars };
enum class Shape { Up, Down, UpDown };
enum class LinkMode { Off, SharedPhase, RestartTogether };
enum class Curve { Linear, Accelerating, Decelerating, Fibonacci, Primes, Random, Custom };
enum class Pattern { Up, Down, UpDown, DownUp, AsPlayed, Random };
enum class OctaveMode { Range, Transpose };
enum class TimingMode { SnapToGrid, Flow, Free };

inline constexpr int numPatterns = 6;
inline constexpr int maxCustomSteps = 8;

// Every user setting, as plain values. The plugin layer fills this from its parameters once per
// block; the engine never reads parameters directly. Defaults match the Scripter prototype.
// Adding a field? Add its row to the parameter table (Parameters.cpp) too.
struct Settings
{
    // Global
    bool latch = false;
    AdvanceTrigger advanceTrigger = AdvanceTrigger::ArpCycle;
    Shape shape = Shape::Up;
    LinkMode link = LinkMode::Off;
    int globalRange = 100; // % applied to every series' spreads
    Curve curve = Curve::Linear;

    // Pattern series
    Pattern pattern = Pattern::UpDown;
    bool patternActive = false;
    int patternSpreadDown = 1, patternSpreadUp = 1; // 0..5

    // Octave series
    int baseOctave = 2; // 1..4
    bool octaveActive = false;
    int octaveSpreadDown = 1, octaveSpreadUp = 1; // 0..3
    OctaveMode octaveMode = OctaveMode::Range;

    // Rate (subdivision) series
    int baseRate = rateIndex ("1/8"); // index into rates()
    bool rateActive = false;
    int rateSpreadDown = 1, rateSpreadUp = 1; // 0..7 doublings
    TimingMode timing = TimingMode::SnapToGrid;

    // Gate series (%)
    int gate = 80; // 10..100
    bool gateActive = false;
    int gateSpreadDown = 40, gateSpreadUp = 20; // 0..90
    int gateSteps = 4;                          // 1..8 per side

    // Velocity series
    int velocity = 70; // 1..127
    bool velocityActive = false;
    int velocitySpreadDown = 25, velocitySpreadUp = 25; // 0..64
    int velocitySteps = 4;

    // Swing series (%)
    int swing = 50; // 50..75
    bool swingActive = false;
    int swingSpreadDown = 0, swingSpreadUp = 16; // 0..25
    int swingSteps = 4;

    // Humanize
    int humanizeVelocity = 0; // +/- 0..40
    int humanizeGate = 0;     // +/- 0..40 %

    // Custom series curve
    int customLength = 4; // 1..8
    std::array<int, maxCustomSteps> customSteps { 1, 5, 6, 8, 2, 3, 4, 7 }; // each 1..8

    bool operator== (const Settings&) const = default;
};

} // namespace parp
