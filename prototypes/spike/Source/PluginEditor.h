#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

// Hosts the web UI. Controls are bound to parameters through JUCE relays; engine state is pushed
// to the page as events on a timer.
class SarpSpikeEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit SarpSpikeEditor (SarpSpikeProcessor&);
    ~SarpSpikeEditor() override;

    void resized() override;

private:
    void timerCallback() override;
    std::optional<juce::WebBrowserComponent::Resource> getResource (const juce::String& url);

    SarpSpikeProcessor& processor;

    // Declaration order matters: relays before the browser (the browser options reference them),
    // attachments after both.
    juce::WebSliderRelay testKnobRelay { "testKnob" };

    juce::WebBrowserComponent browser {
        juce::WebBrowserComponent::Options {}
            .withNativeIntegrationEnabled()
            .withOptionsFrom (testKnobRelay)
            .withResourceProvider ([this] (const auto& url) { return getResource (url); })
    };

    juce::WebSliderParameterAttachment testKnobAttachment {
        *processor.state.getParameter ("testKnob"), testKnobRelay, nullptr
    };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SarpSpikeEditor)
};
