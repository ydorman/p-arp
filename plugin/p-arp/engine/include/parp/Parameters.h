#pragma once

#include <span>
#include <string_view>
#include "parp/Settings.h"

namespace parp
{

// Every user-facing parameter, described once. The plugin builds its host parameters from this
// table (and copies their values into Settings each block); the UI can build its controls from it.
//
// IDs are saved in projects and automation: never change or reuse one. Names can change.
// All parameters are integer-valued (bool: 0/1, choice: index into `choices`).

enum class ParamKind { Bool, Int, Choice };

struct ParamSpec
{
    std::string_view id;
    std::string_view name;
    std::string_view group;
    ParamKind kind;
    int min;
    int max;
    std::string_view unit; // e.g. "%", empty if none
    std::span<const std::string_view> choices; // Choice only: max - min + 1 entries
    int (*get) (const Settings&);
    void (*set) (Settings&, int);

    int defaultValue() const { return get (Settings {}); }
};

std::span<const ParamSpec> parameterSpecs();

// Spec by id, or nullptr
const ParamSpec* findParameter (std::string_view id);

} // namespace parp
