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

std::vector<MidiEvent> makeOut (size_t capacity = Engine::maxEventsPerBlock)
{
    std::vector<MidiEvent> out;
    out.reserve (capacity);
    return out;
}
} // namespace

TEST_CASE ("engine: incoming notes are consumed (the arp generates the output)")
{
    Engine engine;
    engine.prepare (48000.0, 512);
    const std::vector<MidiEvent> in { noteOn (0, 60), noteOn (10, 64, 90) };
    auto out = makeOut();
    engine.process (Transport {}, 512, in, out); // transport stopped: nothing plays
    CHECK_EQ (out.size(), size_t (0));
    CHECK_EQ (engine.status().noteOnsIn, 2);
    engine.reset();
    CHECK_EQ (engine.status().noteOnsIn, 0);
}

TEST_CASE ("engine: never grows the output buffer (no allocation on the audio thread)")
{
    Engine engine;
    auto settings = engine.settings();
    settings.baseRate = parp::rateIndex ("1/128 triplet"); // ~1150 notes in this block
    engine.setSettings (settings);
    engine.prepare (48000.0, 24000);
    const std::vector<MidiEvent> in { noteOn (0, 60) };
    Transport transport;
    transport.playing = true;
    auto out = makeOut (16);
    const auto capacity = out.capacity();
    engine.process (transport, 24000, in, out);
    CHECK_EQ (out.capacity(), capacity);
    CHECK_EQ (out.size(), capacity);
}
