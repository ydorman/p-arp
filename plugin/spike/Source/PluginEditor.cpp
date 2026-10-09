#include "PluginEditor.h"
#include "BinaryData.h"

SarpSpikeEditor::SarpSpikeEditor (SarpSpikeProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    addAndMakeVisible (browser);
    browser.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
    setSize (440, 320);
    startTimerHz (30);
}

SarpSpikeEditor::~SarpSpikeEditor()
{
    stopTimer();
}

void SarpSpikeEditor::resized()
{
    browser.setBounds (getLocalBounds());
}

void SarpSpikeEditor::timerCallback()
{
    auto* engineState = new juce::DynamicObject();
    engineState->setProperty ("noteOnCount", processor.noteOnCount.load());
    engineState->setProperty ("ppq", processor.ppqPosition.load());
    engineState->setProperty ("bpm", processor.bpm.load());
    engineState->setProperty ("playing", processor.isPlaying.load());
    browser.emitEventIfBrowserIsVisible ("engineState", juce::var (engineState));
}

static const char* mimeTypeFor (const juce::String& filename)
{
    if (filename.endsWithIgnoreCase (".html")) return "text/html";
    if (filename.endsWithIgnoreCase (".js"))   return "text/javascript";
    if (filename.endsWithIgnoreCase (".css"))  return "text/css";
    return "application/octet-stream";
}

// Serve the bundled UI files. URLs are matched by file name ("/" -> index.html); the web UI
// files and JUCE's bridge library have distinct names.
std::optional<juce::WebBrowserComponent::Resource> SarpSpikeEditor::getResource (const juce::String& url)
{
    auto path = url.fromLastOccurrenceOf ("/", false, false);
    if (path.isEmpty())
        path = "index.html";

    for (int i = 0; i < BinaryData::namedResourceListSize; ++i)
    {
        if (path == BinaryData::originalFilenames[i])
        {
            int size = 0;
            if (auto* data = BinaryData::getNamedResource (BinaryData::namedResourceList[i], size))
            {
                juce::WebBrowserComponent::Resource resource;
                resource.data.resize ((size_t) size);
                std::memcpy (resource.data.data(), data, (size_t) size);
                resource.mimeType = mimeTypeFor (path);
                return resource;
            }
        }
    }
    return std::nullopt;
}
