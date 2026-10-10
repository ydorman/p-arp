#include "parp/Rates.h"

#include <algorithm>

namespace parp
{

namespace
{
std::array<Rate, numRates> buildRates()
{
    static constexpr std::string_view straightNames[] = { "1/1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", "1/128" };
    static constexpr std::string_view dottedNames[] = { "1/1 dotted", "1/2 dotted", "1/4 dotted", "1/8 dotted",
                                                        "1/16 dotted", "1/32 dotted", "1/64 dotted", "1/128 dotted" };
    static constexpr std::string_view tripletNames[] = { "1/1 triplet", "1/2 triplet", "1/4 triplet", "1/8 triplet",
                                                         "1/16 triplet", "1/32 triplet", "1/64 triplet", "1/128 triplet" };
    std::array<Rate, numRates> table {};
    int i = 0;
    for (int power = 0; power <= rateMaxPower; ++power)
    {
        const double straight = 4.0 / double (1 << power);
        table[(size_t) i++] = { dottedNames[power], RateFamily::Dotted, power, straight * 1.5, straight / 2.0 };
        table[(size_t) i++] = { straightNames[power], RateFamily::Straight, power, straight, straight };
        table[(size_t) i++] = { tripletNames[power], RateFamily::Triplet, power, straight * 2.0 / 3.0, straight * 2.0 / 3.0 };
    }
    std::stable_sort (table.begin(), table.end(), [] (const Rate& a, const Rate& b) { return a.beats > b.beats; });
    return table;
}
} // namespace

const std::array<Rate, numRates>& rates()
{
    static const auto table = buildRates();
    return table;
}

int findRate (RateFamily family, int power)
{
    const auto& table = rates();
    for (size_t i = 0; i < table.size(); ++i)
        if (table[i].family == family && table[i].power == power)
            return (int) i;
    return -1;
}

int rateIndex (std::string_view name)
{
    const auto& table = rates();
    for (size_t i = 0; i < table.size(); ++i)
        if (table[i].name == name)
            return (int) i;
    return -1;
}

} // namespace parp
