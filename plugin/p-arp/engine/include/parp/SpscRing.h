#pragma once

#include <array>
#include <atomic>
#include <cstddef>

namespace parp
{

// Single-producer (audio thread) / single-consumer (message thread) ring buffer. push() never
// blocks or allocates; when full, items are dropped and counted. Holds Capacity - 1 items.
template <typename T, std::size_t Capacity>
class SpscRing
{
public:
    static constexpr std::size_t capacity = Capacity;

    bool push (const T& item)
    {
        const auto write = writeIndex.load (std::memory_order_relaxed);
        const auto next = (write + 1) % Capacity;
        if (next == readIndex.load (std::memory_order_acquire))
        {
            dropped.fetch_add (1, std::memory_order_relaxed);
            return false;
        }
        items[write] = item;
        writeIndex.store (next, std::memory_order_release);
        return true;
    }

    bool pop (T& item)
    {
        const auto read = readIndex.load (std::memory_order_relaxed);
        if (read == writeIndex.load (std::memory_order_acquire))
            return false;
        item = items[read];
        readIndex.store ((read + 1) % Capacity, std::memory_order_release);
        return true;
    }

    // Items dropped because the buffer was full since the last call
    int takeDropped() { return dropped.exchange (0, std::memory_order_relaxed); }

private:
    std::array<T, Capacity> items {};
    std::atomic<std::size_t> writeIndex { 0 };
    std::atomic<std::size_t> readIndex { 0 };
    std::atomic<int> dropped { 0 };
};

} // namespace parp
