#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <parp/Engine.h>
#include <parp/Parameters.h>
#include <atomic>
#include <vector>

// Parameter IDs used directly by the plugin layer. All parameters are defined once in the engine's
// parameter table (parp::parameterSpecs); IDs are saved in projects and automation: never rename.
namespace ParamID
{
    inline constexpr const char* globalRange = "globalRange";
}

// p-arp AU MIDI FX. Adapts the host (MIDI buffer, play head, parameters) to parp::Engine and
// publishes engine status for the UI. All real logic lives in the engine.
class ParpProcessor : public juce::AudioProcessor
{
public:
    ParpProcessor();

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

    // Engine status for the UI (written on the audio thread, read on the UI thread)
    struct UiStatus
    {
        std::atomic<int> noteOnsIn { 0 };
        std::atomic<int> noteOnsOut { 0 };
        std::atomic<bool> playing { false };
        std::atomic<double> bpm { 0.0 };
        std::atomic<double> ppq { 0.0 };
    } uiStatus;

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    parp::Transport readTransport();
    parp::Settings readSettings() const;

    parp::Engine engine;
    std::vector<std::atomic<float>*> parameterValues; // same order as parp::parameterSpecs()
    std::vector<parp::MidiEvent> engineIn, engineOut; // preallocated in prepareToPlay
    juce::MidiBuffer passThrough;                     // non-note MIDI bypasses the engine

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ParpProcessor)
};
