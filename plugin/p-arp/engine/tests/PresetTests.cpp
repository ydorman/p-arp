// Factory presets (presets/*.xml, imported from Logic by tools/import_presets.py): every value
// must be a known parameter within its range, or the plugin would load something the host and the
// engine reject. (Parameters a preset lacks load as their defaults.)

#include <cmath>
#include <filesystem>
#include <fstream>
#include <regex>
#include <set>
#include <sstream>
#include "TestHarness.h"
#include "parp/Parameters.h"

using namespace parp;

TEST_CASE ("presets: every factory preset sets known parameters within their ranges")
{
    const std::filesystem::path folder (PARP_PRESETS_DIR);
    int presets = 0;
    for (const auto& entry : std::filesystem::directory_iterator (folder))
    {
        if (entry.path().extension() != ".xml")
            continue;
        ++presets;
        std::ifstream file (entry.path());
        std::stringstream text;
        text << file.rdbuf();
        const auto xml = text.str();
        CHECK (xml.find ("<ParpPreset name=\"" + entry.path().stem().string() + "\"") != std::string::npos);

        const std::regex param (R"re(<PARAM id="([^"]+)" value="([^"]+)"/>)re");
        std::set<std::string> seen;
        for (std::sregex_iterator it (xml.begin(), xml.end(), param), end; it != end; ++it)
        {
            const auto id = (*it)[1].str();
            const double value = std::stod ((*it)[2].str());
            const auto* spec = findParameter (id);
            if (spec == nullptr)
            {
                CHECK (spec != nullptr); // unknown parameter
                std::printf ("    %s: unknown parameter %s\n", entry.path().filename().c_str(), id.c_str());
                continue;
            }
            CHECK (seen.insert (id).second);
            // Host values: choices are 0-based indices, everything else the value itself
            const double low = spec->kind == ParamKind::Choice ? 0 : spec->min;
            const double high = spec->kind == ParamKind::Choice ? spec->max - spec->min : spec->max;
            CHECK (value == std::round (value));
            CHECK (value >= low && value <= high);
        }
        CHECK (! seen.empty());
    }
    CHECK (presets > 0);
}
