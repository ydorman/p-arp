#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

// Hosts the React UI in a web view. Controls bind to parameters through JUCE relays; engine
// status is pushed to the page as "engineStatus" events.
//
// Release builds serve the UI from the zip embedded in the binary. Builds configured with
// PARP_UI_DEV_SERVER=ON load it from the Vite dev server instead (hot reload inside Logic).
class ParpEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit ParpEditor (ParpProcessor&);
    ~ParpEditor() override;

    void resized() override;

private:
    void timerCallback() override;
    std::optional<juce::WebBrowserComponent::Resource> getResource (const juce::String& url);
    static juce::WebBrowserComponent::Options createBrowserOptions (ParpEditor& editor);

    ParpProcessor& parpProcessor;
    juce::ZipFile uiZip;

    // Declaration order matters: relays before the browser (its options reference them),
    // attachments after both.
    juce::WebSliderRelay globalRangeRelay { ParamID::globalRange };

    juce::WebBrowserComponent browser { createBrowserOptions (*this) };

    juce::WebSliderParameterAttachment globalRangeAttachment {
        *parpProcessor.state.getParameter (ParamID::globalRange), globalRangeRelay, nullptr
    };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ParpEditor)
};
