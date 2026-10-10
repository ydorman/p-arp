#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr int maxInputEventsPerBlock = 1024;
}

ParpProcessor::ParpProcessor()
    : AudioProcessor (BusesProperties()), // MIDI effect: no audio buses
      state (*this, nullptr, "ParpState", createParameterLayout())
{
    globalRangeParam = state.getRawParameterValue (ParamID::globalRange);
}

juce::AudioProcessorValueTreeState::ParameterLayout ParpProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    layout.add (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { ParamID::globalRange, 1 }, "Global Range",
        juce::NormalisableRange<float> (0.0f, 100.0f, 1.0f), 100.0f,
        juce::AudioParameterFloatAttributes().withLabel ("%")));
    return layout;
}

void ParpProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    engine.prepare (sampleRate, samplesPerBlock);
    engineIn.clear();
    engineIn.reserve (maxInputEventsPerBlock);
    engineOut.clear();
    engineOut.reserve ((size_t) parp::Engine::maxEventsPerBlock);
    passThrough.ensureSize (4096);
}

parp::Transport ParpProcessor::readTransport()
{
    parp::Transport transport;
    if (auto* playHead = getPlayHead())
    {
        if (auto position = playHead->getPosition())
        {
            transport.playing = position->getIsPlaying();
            if (auto bpm = position->getBpm())
                transport.bpm = *bpm;
            if (auto ppq = position->getPpqPosition())
                transport.ppqAtBlockStart = *ppq;
            if (auto timeSig = position->getTimeSignature())
            {
                transport.timeSigNumerator = timeSig->numerator;
                transport.timeSigDenominator = timeSig->denominator;
            }
            transport.looping = position->getIsLooping();
            if (auto loop = position->getLoopPoints())
            {
                transport.loopStartPpq = loop->ppqStart;
                transport.loopEndPpq = loop->ppqEnd;
            }
        }
    }
    return transport;
}

void ParpProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    buffer.clear();
    const auto transport = readTransport();

    // juce::MidiBuffer -> engine events (notes only); everything else bypasses the engine
    engineIn.clear();
    engineOut.clear();
    passThrough.clear();
    for (const auto metadata : midi)
    {
        const auto message = metadata.getMessage();
        if ((message.isNoteOn() || message.isNoteOff()) && engineIn.size() < engineIn.capacity())
        {
            parp::MidiEvent event;
            event.type = message.isNoteOn() ? parp::MidiEvent::Type::NoteOn : parp::MidiEvent::Type::NoteOff;
            event.sampleOffset = metadata.samplePosition;
            event.channel = message.getChannel();
            event.note = message.getNoteNumber();
            event.velocity = message.getVelocity();
            engineIn.push_back (event);
        }
        else
        {
            passThrough.addEvent (message, metadata.samplePosition);
        }
    }

    // Parameters -> engine settings (the rest of the settings keep their defaults for now)
    auto settings = engine.settings();
    settings.globalRange = (int) std::lround (globalRangeParam->load (std::memory_order_relaxed));
    engine.setSettings (settings);

    engine.process (transport, buffer.getNumSamples(), engineIn, engineOut);

    // engine events -> juce::MidiBuffer
    midi.clear();
    midi.addEvents (passThrough, 0, -1, 0);
    for (const auto& event : engineOut)
    {
        const auto velocity = (juce::uint8) juce::jlimit (0, 127, event.velocity);
        if (event.type == parp::MidiEvent::Type::NoteOn)
            midi.addEvent (juce::MidiMessage::noteOn (event.channel, event.note, velocity), event.sampleOffset);
        else if (event.type == parp::MidiEvent::Type::NoteOff)
            midi.addEvent (juce::MidiMessage::noteOff (event.channel, event.note, velocity), event.sampleOffset);
    }

    const auto status = engine.status();
    uiStatus.noteOnsIn.store (status.noteOnsIn, std::memory_order_relaxed);
    uiStatus.noteOnsOut.store (status.noteOnsOut, std::memory_order_relaxed);
    uiStatus.playing.store (transport.playing, std::memory_order_relaxed);
    uiStatus.bpm.store (transport.bpm, std::memory_order_relaxed);
    uiStatus.ppq.store (transport.ppqAtBlockStart, std::memory_order_relaxed);
}

juce::AudioProcessorEditor* ParpProcessor::createEditor()
{
    return new ParpEditor (*this);
}

void ParpProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (auto xml = state.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void ParpProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (state.state.getType()))
            state.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ParpProcessor();
}
