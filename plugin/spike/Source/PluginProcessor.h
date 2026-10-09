#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>

// SARP Spike: an AU MIDI FX that passes MIDI through unchanged. It exists to de-risk the real
// plugin's architecture (AU MIDI processor in Logic + web view UI), not to do anything musical.
class SarpSpikeProcessor : public juce::AudioProcessor
{
public:
    SarpSpikeProcessor();

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override { return true; }
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState state;

    // Engine -> UI values (written on the audio thread, read on the UI thread)
    std::atomic<int> noteOnCount { 0 };
    std::atomic<double> ppqPosition { 0.0 };
    std::atomic<double> bpm { 0.0 };
    std::atomic<bool> isPlaying { false };

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SarpSpikeProcessor)
};
