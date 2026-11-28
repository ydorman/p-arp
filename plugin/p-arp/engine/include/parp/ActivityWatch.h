#pragma once

#include <cstdint>

namespace parp
{

// Tells the live view whether the plugin is running, checked on every editor timer tick (~30/s).
//
// When p-arp is switched off in Logic, either the host stops calling the render callback, or JUCE
// calls processBlockBypassed instead of processBlock. Either way the last engine status freezes
// (still "playing", same position); resent on every tick, it made the live view run the playhead
// ahead and snap back. The processor counts the blocks it really processes; the watch reports
// "not running" once that count stops moving (or bypass is reported), and asks for the live view
// to be cleared when that happens while the transport was playing (the plugin was turned off).
// When the transport is stopped and the host simply stops rendering, the view keeps its notes.
class ActivityWatch
{
public:
    static constexpr int stallTicks = 8; // ~250 ms without a processed block (large buffers are ~50 ms)

    struct Result
    {
        bool running = true; // false: bypassed or no blocks lately (show the transport as stopped)
        bool clear = false;  // just stopped running while playing (or bypassed): clear the live view
    };

    Result tick (std::uint64_t blocksProcessed, bool bypassed, bool playing)
    {
        if (blocksProcessed != lastBlocks)
        {
            lastBlocks = blocksProcessed;
            idleTicks = 0;
        }
        else if (idleTicks < stallTicks)
        {
            ++idleTicks;
        }

        Result result;
        result.running = ! bypassed && idleTicks < stallTicks;
        if (result.running)
            lastPlaying = playing;
        else if (wasRunning)
            result.clear = bypassed || lastPlaying;
        wasRunning = result.running;
        return result;
    }

private:
    std::uint64_t lastBlocks = 0;
    int idleTicks = 0;
    bool wasRunning = true;
    bool lastPlaying = false;
};

} // namespace parp
