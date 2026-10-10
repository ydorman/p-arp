#pragma once

#include <cstdint>

namespace parp
{

// Small, fast, seedable random generator (xorshift64*). Real-time safe (no allocation, no locks).
// Injected into the engine so tests can be deterministic.
class Random
{
public:
    explicit Random (std::uint64_t seed = 0x9E3779B97F4A7C15ull) { setSeed (seed); }

    void setSeed (std::uint64_t seed) { state = seed != 0 ? seed : 0x9E3779B97F4A7C15ull; }

    // Uniform in [0, 1)
    double next()
    {
        state ^= state >> 12;
        state ^= state << 25;
        state ^= state >> 27;
        const std::uint64_t value = state * 0x2545F4914F6CDD1Dull;
        return double (value >> 11) * (1.0 / 9007199254740992.0); // 53 bits
    }

    // Uniform integer in [0, count)
    int nextInt (int count) { return int (next() * double (count)); }

private:
    std::uint64_t state = 0;
};

} // namespace parp
