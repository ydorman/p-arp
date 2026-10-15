// Live view feed: generated notes on a timeline that never jumps back.

#include <cmath>
#include <memory>
#include "HostSim.h"
#include "TestHarness.h"

using namespace parp;
using namespace parp_test;

namespace
{
// Timeline values accumulate block lengths, so they carry floating-point slack
bool near (double a, double b)
{
    return std::abs (a - b) < 1e-9;
}

std::vector<LiveNote> drain (LiveNoteRing& ring)
{
    std::vector<LiveNote> notes;
    LiveNote note;
    while (ring.pop (note))
        notes.push_back (note);
    return notes;
}

Settings eighths()
{
    Settings s;
    s.pattern = Pattern::Up;
    s.baseRate = rateIndex ("1/8");
    s.gate = 80;
    return s;
}
} // namespace

TEST_CASE ("live notes: one per note-on, with pitch, velocity, beat and length")
{
    auto ring = std::make_unique<LiveNoteRing>();
    HostSim host (eighths());
    host.engine.setLiveNotes (ring.get());
    host.noteOn (60, 90);
    host.noteOn (64, 90);
    host.play (2.0);
    const auto notes = drain (*ring);
    const auto ons = host.noteOns();
    REQUIRE (notes.size() == ons.size());
    REQUIRE (notes.size() == 4);
    for (size_t i = 0; i < notes.size(); ++i)
    {
        CHECK_EQ ((int) notes[i].pitch, ons[i].pitch);
        CHECK_EQ ((int) notes[i].velocity, ons[i].velocity);
        CHECK (near (notes[i].beat, ons[i].beat));
        CHECK (near (notes[i].time, ons[i].beat - 1.0)); // timeline starts at 0 with the transport at beat 1
        CHECK (near (notes[i].length, 0.4));
    }
}

TEST_CASE ("live notes: the timeline keeps going across a loop wrap and stands still when stopped")
{
    auto ring = std::make_unique<LiveNoteRing>();
    HostSim host (eighths());
    host.setCycle (1.0, 3.0);
    host.engine.setLiveNotes (ring.get());
    host.noteOn (60);
    host.play (5.0);
    CHECK (near (host.engine.status().timeline, 5.0));
    const auto notes = drain (*ring);
    REQUIRE (notes.size() == 10);
    for (size_t i = 1; i < notes.size(); ++i)
        CHECK (near (notes[i].time - notes[i - 1].time, 0.5));
    CHECK_EQ (notes[3].beat, 2.5);
    CHECK_EQ (notes[4].beat, 1.0); // wrapped (loop of 4 eighths)
    host.stop();
    CHECK (near (host.engine.status().timeline, 5.0));
}
