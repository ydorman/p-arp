#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

// Hosts the React UI in a web view. Every parameter in the engine's table gets a JUCE relay (named
// by the parameter id) and an attachment binding it to the host parameter, so UI controls read and
// write the real parameters (incl. automation gestures). Engine status is pushed to the page as
// "engineStatus" events; generated notes are sent as "liveNotes" batches while the editor is open.
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
    void sendLiveNotes();
    std::optional<juce::WebBrowserComponent::Resource> getResource (const juce::String& url);
    static juce::WebBrowserComponent::Options createBrowserOptions (ParpEditor& editor);

    // One relay per parameter, by kind (Int -> slider, Bool -> toggle, Choice -> combo box)
    struct Relays
    {
        std::vector<std::unique_ptr<juce::WebSliderRelay>> sliders;
        std::vector<std::unique_ptr<juce::WebToggleButtonRelay>> toggles;
        std::vector<std::unique_ptr<juce::WebComboBoxRelay>> comboBoxes;
    };
    static Relays createRelays();

    ParpProcessor& parpProcessor;
    juce::ZipFile uiZip;

    // Declaration order matters: relays before the browser (its options reference them),
    // attachments (created in the constructor) after both.
    Relays relays = createRelays();
    juce::WebBrowserComponent browser { createBrowserOptions (*this) };

    std::vector<std::unique_ptr<juce::WebSliderParameterAttachment>> sliderAttachments;
    std::vector<std::unique_ptr<juce::WebToggleButtonParameterAttachment>> toggleAttachments;
    std::vector<std::unique_ptr<juce::WebComboBoxParameterAttachment>> comboBoxAttachments;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ParpEditor)
};
