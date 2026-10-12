// Prints the engine's parameter table as JSON. The UI's parameter list (ui/src/params/
// parameters.json) is generated with this tool, so the C++ table stays the single source of truth;
// a test fails if the committed file is out of date. Regenerate with:
//   ./build-tests/engine/tools/parp_dump_parameters > ui/src/params/parameters.json

#include <iostream>
#include <string>
#include <string_view>
#include "parp/Parameters.h"

namespace
{
std::string json (std::string_view text)
{
    std::string out = "\"";
    for (char c : text)
    {
        if (c == '"' || c == '\\')
            out += '\\';
        out += c;
    }
    return out + "\"";
}

const char* kindName (parp::ParamKind kind)
{
    switch (kind)
    {
        case parp::ParamKind::Bool:   return "bool";
        case parp::ParamKind::Int:    return "int";
        case parp::ParamKind::Choice: return "choice";
    }
    return "int";
}
} // namespace

int main()
{
    const auto specs = parp::parameterSpecs();
    std::cout << "[\n";
    for (std::size_t i = 0; i < specs.size(); ++i)
    {
        const auto& p = specs[i];
        std::cout << "  { \"id\": " << json (p.id) << ", \"name\": " << json (p.name) << ", \"group\": " << json (p.group)
                  << ", \"kind\": \"" << kindName (p.kind) << "\", \"min\": " << p.min << ", \"max\": " << p.max
                  << ", \"defaultValue\": " << p.defaultValue();
        if (! p.unit.empty())
            std::cout << ", \"unit\": " << json (p.unit);
        if (! p.choices.empty())
        {
            std::cout << ", \"choices\": [";
            for (std::size_t c = 0; c < p.choices.size(); ++c)
                std::cout << (c > 0 ? ", " : "") << json (p.choices[c]);
            std::cout << "]";
        }
        std::cout << " }" << (i + 1 < specs.size() ? "," : "") << "\n";
    }
    std::cout << "]\n";
    return 0;
}
