#include "parp/Engine.h"

namespace parp
{

void Engine::prepare (double newSampleRate, int newMaxBlockSize)
{
    sampleRate = newSampleRate;
    maxBlockSize = newMaxBlockSize;
    reset();
}

void Engine::reset()
{
    currentStatus = {};
}

void Engine::process (const Transport&, int, std::span<const MidiEvent> in, std::vector<MidiEvent>& out)
{
    // Pass-through until the arp engine is ported
    for (const auto& event : in)
    {
        if (event.type == MidiEvent::Type::NoteOn)
        {
            ++currentStatus.noteOnsIn;
            ++currentStatus.noteOnsOut;
        }
        if (out.size() < out.capacity()) // never grow on the audio thread
            out.push_back (event);
    }
}

} // namespace parp
