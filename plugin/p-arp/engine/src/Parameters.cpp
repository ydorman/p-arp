#include "parp/Parameters.h"

#include <array>
#include <vector>

namespace parp
{

namespace
{
constexpr std::string_view triggerNames[] = { "Per Arp Cycle", "Per Note Step", "Per Beat", "Per Bar", "Per 2 Bars" };
constexpr std::string_view shapeNames[] = { "Up", "Down", "Up-Down (Triangle)" };
constexpr std::string_view linkNames[] = { "Off", "Shared Phase", "Restart Together" };
constexpr std::string_view curveNames[] = { "Linear", "Accelerating", "Decelerating", "Fibonacci", "Primes", "Random", "Custom" };
constexpr std::string_view patternNames[] = { "Up", "Down", "Up/Down", "Down/Up", "As Played", "Random" };
constexpr std::string_view octaveModeNames[] = { "Range", "Transpose" };
constexpr std::string_view timingNames[] = { "Snap to Grid", "Flow (realign each pass)", "Free (no snapping)" };

std::array<std::string_view, numRates> buildRateNames()
{
    std::array<std::string_view, numRates> names {};
    for (size_t i = 0; i < names.size(); ++i)
        names[i] = rates()[i].name;
    return names;
}

// Field accessors. Macros keep each table row on one line and impossible to mismatch.
#define PARP_INT(field) [] (const Settings& s) { return int (s.field); }, [] (Settings& s, int v) { s.field = v; }
#define PARP_BOOL(field) [] (const Settings& s) { return s.field ? 1 : 0; }, [] (Settings& s, int v) { s.field = v != 0; }
#define PARP_ENUM(field, Type) [] (const Settings& s) { return int (s.field); }, [] (Settings& s, int v) { s.field = Type (v); }
#define PARP_CUSTOM(i) [] (const Settings& s) { return s.customSteps[i]; }, [] (Settings& s, int v) { s.customSteps[i] = v; }

std::vector<ParamSpec> buildSpecs()
{
    static const auto rateNames = buildRateNames();
    using K = ParamKind;
    const std::span<const std::string_view> none;
    return {
        // Global
        { "latch", "Latch Chord", "Global", K::Bool, 0, 1, "", none, PARP_BOOL (latch) },
        { "advanceTrigger", "Advance Trigger", "Global", K::Choice, 0, 4, "", triggerNames, PARP_ENUM (advanceTrigger, AdvanceTrigger) },
        { "shape", "Progression Shape", "Global", K::Choice, 0, 2, "", shapeNames, PARP_ENUM (shape, Shape) },
        { "link", "Link Series", "Global", K::Choice, 0, 2, "", linkNames, PARP_ENUM (link, LinkMode) },
        { "globalRange", "Global Range", "Global", K::Int, 0, 100, "%", none, PARP_INT (globalRange) },
        { "curve", "Series Curve", "Global", K::Choice, 0, 6, "", curveNames, PARP_ENUM (curve, Curve) },

        // Pattern
        { "pattern", "Arp Pattern", "Pattern", K::Choice, 0, 5, "", patternNames, PARP_ENUM (pattern, Pattern) },
        { "patternActive", "Pattern Mod Active", "Pattern", K::Bool, 0, 1, "", none, PARP_BOOL (patternActive) },
        { "patternSpreadDown", "Pattern Spread (-) Before", "Pattern", K::Int, 0, 5, "", none, PARP_INT (patternSpreadDown) },
        { "patternSpreadUp", "Pattern Spread (+) After", "Pattern", K::Int, 0, 5, "", none, PARP_INT (patternSpreadUp) },

        // Octave
        { "baseOctave", "Base Octave Range", "Octave", K::Int, 1, 4, "", none, PARP_INT (baseOctave) },
        { "octaveActive", "Octave Mod Active", "Octave", K::Bool, 0, 1, "", none, PARP_BOOL (octaveActive) },
        { "octaveSpreadDown", "Octave Spread (-) Below", "Octave", K::Int, 0, 3, "", none, PARP_INT (octaveSpreadDown) },
        { "octaveSpreadUp", "Octave Spread (+) Above", "Octave", K::Int, 0, 3, "", none, PARP_INT (octaveSpreadUp) },
        { "octaveMode", "Octave Mode", "Octave", K::Choice, 0, 1, "", octaveModeNames, PARP_ENUM (octaveMode, OctaveMode) },

        // Rate (subdivision)
        { "baseRate", "Base Subdivision", "Rate", K::Choice, 0, numRates - 1, "", rateNames, PARP_INT (baseRate) },
        { "rateActive", "Subdiv Mod Active", "Rate", K::Bool, 0, 1, "", none, PARP_BOOL (rateActive) },
        { "rateSpreadDown", "Subdiv Spread (-) Slower", "Rate", K::Int, 0, 7, "", none, PARP_INT (rateSpreadDown) },
        { "rateSpreadUp", "Subdiv Spread (+) Faster", "Rate", K::Int, 0, 7, "", none, PARP_INT (rateSpreadUp) },
        { "timing", "Subdiv Change Timing", "Rate", K::Choice, 0, 2, "", timingNames, PARP_ENUM (timing, TimingMode) },

        // Gate
        { "gate", "Gate Length", "Gate", K::Int, 10, 100, "%", none, PARP_INT (gate) },
        { "gateActive", "Gate Mod Active", "Gate", K::Bool, 0, 1, "", none, PARP_BOOL (gateActive) },
        { "gateSpreadDown", "Gate Spread (-) Shorter", "Gate", K::Int, 0, 90, "%", none, PARP_INT (gateSpreadDown) },
        { "gateSpreadUp", "Gate Spread (+) Longer", "Gate", K::Int, 0, 90, "%", none, PARP_INT (gateSpreadUp) },
        { "gateSteps", "Gate Steps (per side)", "Gate", K::Int, 1, 8, "", none, PARP_INT (gateSteps) },

        // Velocity
        { "velocity", "Velocity Base", "Velocity", K::Int, 1, 127, "", none, PARP_INT (velocity) },
        { "velocityActive", "Velocity Mod Active", "Velocity", K::Bool, 0, 1, "", none, PARP_BOOL (velocityActive) },
        { "velocitySpreadDown", "Velocity Spread (-) Down", "Velocity", K::Int, 0, 64, "", none, PARP_INT (velocitySpreadDown) },
        { "velocitySpreadUp", "Velocity Spread (+) Up", "Velocity", K::Int, 0, 64, "", none, PARP_INT (velocitySpreadUp) },
        { "velocitySteps", "Velocity Steps (per side)", "Velocity", K::Int, 1, 8, "", none, PARP_INT (velocitySteps) },

        // Swing
        { "swing", "Swing", "Swing", K::Int, 50, 75, "%", none, PARP_INT (swing) },
        { "swingActive", "Swing Mod Active", "Swing", K::Bool, 0, 1, "", none, PARP_BOOL (swingActive) },
        { "swingSpreadDown", "Swing Spread (-) Straighter", "Swing", K::Int, 0, 25, "%", none, PARP_INT (swingSpreadDown) },
        { "swingSpreadUp", "Swing Spread (+) Swingier", "Swing", K::Int, 0, 25, "%", none, PARP_INT (swingSpreadUp) },
        { "swingSteps", "Swing Steps (per side)", "Swing", K::Int, 1, 8, "", none, PARP_INT (swingSteps) },

        // Humanize
        { "humanizeVelocity", "Humanize Velocity (+/-)", "Humanize", K::Int, 0, 40, "", none, PARP_INT (humanizeVelocity) },
        { "humanizeGate", "Humanize Gate (+/-)", "Humanize", K::Int, 0, 40, "%", none, PARP_INT (humanizeGate) },

        // Custom series curve
        { "customLength", "Custom Length", "Custom Series", K::Int, 1, maxCustomSteps, "", none, PARP_INT (customLength) },
        { "customStep1", "Custom Step 1", "Custom Series", K::Int, 1, 8, "", none, PARP_CUSTOM (0) },
        { "customStep2", "Custom Step 2", "Custom Series", K::Int, 1, 8, "", none, PARP_CUSTOM (1) },
        { "customStep3", "Custom Step 3", "Custom Series", K::Int, 1, 8, "", none, PARP_CUSTOM (2) },
        { "customStep4", "Custom Step 4", "Custom Series", K::Int, 1, 8, "", none, PARP_CUSTOM (3) },
        { "customStep5", "Custom Step 5", "Custom Series", K::Int, 1, 8, "", none, PARP_CUSTOM (4) },
        { "customStep6", "Custom Step 6", "Custom Series", K::Int, 1, 8, "", none, PARP_CUSTOM (5) },
        { "customStep7", "Custom Step 7", "Custom Series", K::Int, 1, 8, "", none, PARP_CUSTOM (6) },
        { "customStep8", "Custom Step 8", "Custom Series", K::Int, 1, 8, "", none, PARP_CUSTOM (7) },
    };
}

#undef PARP_INT
#undef PARP_BOOL
#undef PARP_ENUM
#undef PARP_CUSTOM
} // namespace

std::span<const ParamSpec> parameterSpecs()
{
    static const auto specs = buildSpecs();
    return specs;
}

const ParamSpec* findParameter (std::string_view id)
{
    for (const auto& spec : parameterSpecs())
        if (spec.id == id)
            return &spec;
    return nullptr;
}

} // namespace parp
