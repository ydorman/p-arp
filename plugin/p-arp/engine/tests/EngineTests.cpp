#include "TestHarness.h"
#include "parp/Engine.h"

using parp::Engine;
using parp::MidiEvent;
using parp::Transport;

namespace
{
MidiEvent noteOn (int offset, int note, int velocity = 100)
{
    MidiEvent e;
    e.type = MidiEvent::Type::NoteOn;
    e.sampleOffset = offset;
    e.note = note;
    e.velocity = velocity;
    return e;
}

MidiEvent noteOff (int offset, int note)
{
    MidiEvent e;
    e.type = MidiEvent::Type::NoteOff;
    e.sampleOffset = offset;
    e.note = note;
    return e;
}

std::vector<MidiEvent> makeOut()
{
    std::vector<MidiEvent> out;
    out.reserve (Engine::maxEventsPerBlock);
    return out;
}
} // namespace

TEST_CASE ("pass-through: events come out unchanged, in order")
{
    Engine engine;
    engine.prepare (48000.0, 512);
    const std::vector<MidiEvent> in { noteOn (0, 60), noteOn (10, 64, 90), noteOff (300, 60) };
    auto out = makeOut();
    engine.process (Transport {}, 512, in, out);

    REQUIRE_EQ (out.size(), in.size());
    for (size_t i = 0; i < in.size(); ++i)
    {
        CHECK (out[i].type == in[i].type);
        CHECK_EQ (out[i].sampleOffset, in[i].sampleOffset);
        CHECK_EQ (out[i].note, in[i].note);
        CHECK_EQ (out[i].velocity, in[i].velocity);
    }
}

TEST_CASE ("status counts note-ons; reset clears it")
{
    Engine engine;
    engine.prepare (48000.0, 512);
    const std::vector<MidiEvent> in { noteOn (0, 60), noteOn (5, 64), noteOff (100, 60) };
    auto out = makeOut();
    engine.process (Transport {}, 512, in, out);
    CHECK_EQ (engine.status().noteOnsIn, 2);
    CHECK_EQ (engine.status().noteOnsOut, 2);
    engine.reset();
    CHECK_EQ (engine.status().noteOnsIn, 0);
}

TEST_CASE ("never grows the output buffer (no allocation on the audio thread)")
{
    Engine engine;
    engine.prepare (48000.0, 512);
    std::vector<MidiEvent> in;
    for (int i = 0; i < Engine::maxEventsPerBlock + 50; ++i)
        in.push_back (noteOn (i % 512, 60));
    auto out = makeOut();
    const auto capacity = out.capacity();
    engine.process (Transport {}, 512, in, out);
    CHECK_EQ (out.capacity(), capacity);
    CHECK_EQ (out.size(), capacity);
}
