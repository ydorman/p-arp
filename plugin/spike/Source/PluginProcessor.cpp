#include "PluginProcessor.h"
#include "PluginEditor.h"

SarpSpikeProcessor::SarpSpikeProcessor()
    : AudioProcessor (BusesProperties()), // MIDI effect: no audio buses
      state (*this, nullptr, "SarpSpikeState", createParameterLayout())
{
}

juce::AudioProcessorValueTreeState::ParameterLayout SarpSpikeProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    // Stable string IDs (unlike Scripter's index-based parameters)
    layout.add (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "testKnob", 1 }, "Test Knob",
        juce::NormalisableRange<float> (0.0f, 100.0f, 0.1f), 50.0f));
    return layout;
}

void SarpSpikeProcessor::prepareToPlay (double, int)
{
}

void SarpSpikeProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    buffer.clear();

    // MIDI passes through unchanged (the buffer is both input and output); just count note-ons
    int count = 0;
    for (const auto metadata : midi)
        if (metadata.getMessage().isNoteOn())
            ++count;
    if (count > 0)
        noteOnCount.fetch_add (count, std::memory_order_relaxed);

    // Host transport: the real engine depends on this being available to a MIDI FX
    if (auto* playHead = getPlayHead())
    {
        if (auto position = playHead->getPosition())
        {
            if (auto ppq = position->getPpqPosition())
                ppqPosition.store (*ppq, std::memory_order_relaxed);
            if (auto tempo = position->getBpm())
                bpm.store (*tempo, std::memory_order_relaxed);
            isPlaying.store (position->getIsPlaying(), std::memory_order_relaxed);
        }
    }
}

juce::AudioProcessorEditor* SarpSpikeProcessor::createEditor()
{
    return new SarpSpikeEditor (*this);
}

void SarpSpikeProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (auto xml = state.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void SarpSpikeProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (state.state.getType()))
            state.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new SarpSpikeProcessor();
}
