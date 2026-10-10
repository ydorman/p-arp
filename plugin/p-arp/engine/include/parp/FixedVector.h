#pragma once

#include <array>
#include <cstddef>
#include <span>

namespace parp
{

// Vector with a fixed capacity and no heap allocation (safe on the audio thread). push_back past
// the capacity is ignored and reported, never undefined behavior.
template <typename T, std::size_t Capacity>
class FixedVector
{
public:
    bool push_back (const T& value)
    {
        if (count >= Capacity)
            return false;
        items[count++] = value;
        return true;
    }

    void clear() { count = 0; }
    void erase (std::size_t index)
    {
        for (std::size_t i = index; i + 1 < count; ++i)
            items[i] = items[i + 1];
        --count;
    }

    std::size_t size() const { return count; }
    bool empty() const { return count == 0; }
    static constexpr std::size_t capacity() { return Capacity; }

    T& operator[] (std::size_t i) { return items[i]; }
    const T& operator[] (std::size_t i) const { return items[i]; }
    T* begin() { return items.data(); }
    T* end() { return items.data() + count; }
    const T* begin() const { return items.data(); }
    const T* end() const { return items.data() + count; }

    std::span<const T> view() const { return { items.data(), count }; }

private:
    std::array<T, Capacity> items {};
    std::size_t count = 0;
};

} // namespace parp
