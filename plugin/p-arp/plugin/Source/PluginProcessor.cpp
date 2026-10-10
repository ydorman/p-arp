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
    for (const auto& spec : parp::parameterSpecs())
        parameterValues.push_back (state.getRawParameterValue (juce::String (spec.id.data(), spec.id.size())));
}

namespace
{
juce::String toString (std::string_view text)
{
    return juce::String (text.data(), text.size());
}

// position: 1-based place in the parameter table. Used as the parameter's version hint: JUCE's AU
// wrapper orders parameters by version hint (then by the hash of the ID), so this keeps the table's
// order in Logic. The AU parameter ID itself is only the hash of the text ID, so changing a
// position (reordering, inserting) never breaks saved projects or automation.
std::unique_ptr<juce::RangedAudioParameter> createParameter (const parp::ParamSpec& spec, int position)
{
    const juce::ParameterID id { toString (spec.id), position };
    const auto name = toString (spec.name);
    switch (spec.kind)
    {
        case parp::ParamKind::Bool:
            return std::make_unique<juce::AudioParameterBool> (id, name, spec.defaultValue() != 0);
        case parp::ParamKind::Choice:
        {
            juce::StringArray choices;
            for (auto choice : spec.choices)
                choices.add (toString (choice));
            return std::make_unique<juce::AudioParameterChoice> (id, name, choices, spec.defaultValue() - spec.min);
        }
        case parp::ParamKind::Int:
            break;
    }
    return std::make_unique<juce::AudioParameterInt> (id, name, spec.min, spec.max, spec.defaultValue(),
                                                      juce::AudioParameterIntAttributes().withLabel (toString (spec.unit)));
}
} // namespace

// All parameters come from the engine's table, grouped (Logic shows the groups as submenus)
juce::AudioProcessorValueTreeState::ParameterLayout ParpProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    std::vector<std::unique_ptr<juce::AudioProcessorParameterGroup>> groups;
    int position = 0;
    for (const auto& spec : parp::parameterSpecs())
    {
        const auto groupName = toString (spec.group);
        if (groups.empty() || groups.back()->getName() != groupName)
            groups.push_back (std::make_unique<juce::AudioProcessorParameterGroup> (
                groupName.removeCharacters (" ").toLowerCase(), groupName, " | "));
        groups.back()->addChild (createParameter (spec, ++position));
    }
    for (auto& group : groups)
        layout.add (std::move (group));
    return layout;
}

// Parameter values -> engine settings (runs on the audio thread: atomic loads only)
parp::Settings ParpProcessor::readSettings() const
{
    parp::Settings settings;
    const auto specs = parp::parameterSpecs();
    for (size_t i = 0; i < specs.size(); ++i)
    {
        const int value = (int) std::lround (parameterValues[i]->load (std::memory_order_relaxed));
        specs[i].set (settings, juce::jlimit (specs[i].min, specs[i].max, value + (specs[i].kind == parp::ParamKind::Choice ? specs[i].min : 0)));
    }
    return settings;
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

    engine.setSettings (readSettings());

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
