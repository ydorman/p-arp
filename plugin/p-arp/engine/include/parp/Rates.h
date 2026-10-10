#pragma once

#include <array>
#include <string_view>

namespace parp
{

// Every note value from 1/1 to 1/128 in straight, dotted and triplet form, ordered slowest to
// fastest (the order of the Base Subdivision menu): ... 1/4, 1/8 dotted, 1/4 triplet, 1/8 ...
enum class RateFamily { Straight, Dotted, Triplet };

struct Rate
{
    std::string_view name;
    RateFamily family;
    int power;    // note value 1/2^power: 0 = 1/1 ... 7 = 1/128
    double beats; // step length (1 beat = quarter note)
    double grid;  // snap grid: own length, except dotted rates snap to their pulse (a third)
};

inline constexpr int numRates = 24;
inline constexpr int rateMaxPower = 7;

const std::array<Rate, numRates>& rates();

// Index into rates() of the rate with this family and power, or -1
int findRate (RateFamily family, int power);

// Index into rates() of the rate with this name, or -1
int rateIndex (std::string_view name);

} // namespace parp
