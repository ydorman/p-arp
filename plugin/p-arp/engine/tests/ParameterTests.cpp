#include <set>
#include "TestHarness.h"
#include "parp/Parameters.h"

using namespace parp;

TEST_CASE ("parameters: every Scripter control except Debug Log, with unique ids and names")
{
    const auto specs = parameterSpecs();
    CHECK_EQ (specs.size(), size_t (46));
    std::set<std::string_view> ids, names;
    for (const auto& spec : specs)
    {
        CHECK (ids.insert (spec.id).second);
        CHECK (names.insert (spec.name).second);
        CHECK (findParameter (spec.id) == &spec);
    }
    CHECK (findParameter ("nope") == nullptr);
}

TEST_CASE ("parameters: defaults come from Settings{} and lie within range")
{
    for (const auto& spec : parameterSpecs())
    {
        const int d = spec.defaultValue();
        if (d < spec.min || d > spec.max)
            std::cerr << "    " << spec.id << " default " << d << " outside " << spec.min << ".." << spec.max << "\n";
        CHECK (d >= spec.min && d <= spec.max);
    }
    CHECK_EQ (findParameter ("pattern")->defaultValue(), (int) Pattern::UpDown);
    CHECK_EQ (findParameter ("baseRate")->choices[(size_t) findParameter ("baseRate")->defaultValue()], std::string_view ("1/8"));
    CHECK_EQ (findParameter ("globalRange")->defaultValue(), 100);
    CHECK_EQ (findParameter ("customStep4")->defaultValue(), 8);
}

TEST_CASE ("parameters: set then get round-trips every value, touching only its own field")
{
    for (const auto& spec : parameterSpecs())
    {
        for (int v = spec.min; v <= spec.max; ++v)
        {
            Settings s;
            spec.set (s, v);
            CHECK_EQ (spec.get (s), v);
            // every other parameter keeps its default
            for (const auto& other : parameterSpecs())
                if (&other != &spec && other.get (s) != other.defaultValue())
                {
                    std::cerr << "    setting " << spec.id << " changed " << other.id << "\n";
                    CHECK (false);
                }
        }
    }
}

TEST_CASE ("parameters: copying every parameter value through the table reproduces the settings")
{
    // Settings that differ from the defaults in every parameter, copied through the specs, come out
    // identical. (This can't detect a Settings field with no parameter - C++ has no reflection -
    // so when adding a field to Settings, add its row to the parameter table too.)
    Settings changed;
    for (const auto& spec : parameterSpecs())
        spec.set (changed, spec.defaultValue() == spec.max ? spec.min : spec.max);
    Settings rebuilt;
    for (const auto& spec : parameterSpecs())
        spec.set (rebuilt, spec.get (changed));
    CHECK (rebuilt == changed);
    CHECK (! (changed == Settings {}));
    Settings defaults;
    for (const auto& spec : parameterSpecs())
        spec.set (defaults, spec.get (Settings {}));
    CHECK (defaults == Settings {});
}

TEST_CASE ("parameters: choices match their ranges")
{
    for (const auto& spec : parameterSpecs())
    {
        if (spec.kind == ParamKind::Choice)
            CHECK_EQ (spec.choices.size(), size_t (spec.max - spec.min + 1));
        else
            CHECK (spec.choices.empty());
        if (spec.kind == ParamKind::Bool)
            CHECK (spec.min == 0 && spec.max == 1);
    }
    CHECK_EQ (findParameter ("baseRate")->choices.front(), std::string_view ("1/1 dotted"));
    CHECK_EQ (findParameter ("advanceTrigger")->choices.back(), std::string_view ("Per 2 Bars"));
}
