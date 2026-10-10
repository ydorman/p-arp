#include "PluginEditor.h"
#include "BinaryData.h"

namespace
{
juce::MemoryInputStream* createUiZipStream()
{
    return new juce::MemoryInputStream (BinaryData::ui_zip, (size_t) BinaryData::ui_zipSize, false);
}

const char* mimeTypeFor (const juce::String& path)
{
    const auto extension = path.fromLastOccurrenceOf (".", false, false).toLowerCase();
    if (extension == "html") return "text/html";
    if (extension == "js")   return "text/javascript";
    if (extension == "css")  return "text/css";
    if (extension == "json") return "application/json";
    if (extension == "svg")  return "image/svg+xml";
    if (extension == "png")  return "image/png";
    if (extension == "woff2") return "font/woff2";
    return "application/octet-stream";
}
} // namespace

juce::WebBrowserComponent::Options ParpEditor::createBrowserOptions (ParpEditor& editor)
{
    auto options = juce::WebBrowserComponent::Options {}
                       .withNativeIntegrationEnabled()
                       .withOptionsFrom (editor.globalRangeRelay);
#ifdef PARP_UI_DEV_URL
    // Let the dev server's origin use the native integration
    return options.withResourceProvider ([&editor] (const auto& url) { return editor.getResource (url); },
                                         juce::URL { PARP_UI_DEV_URL }.getOrigin());
#else
    return options.withResourceProvider ([&editor] (const auto& url) { return editor.getResource (url); });
#endif
}

ParpEditor::ParpEditor (ParpProcessor& p)
    : AudioProcessorEditor (&p), parpProcessor (p), uiZip (std::unique_ptr<juce::InputStream> (createUiZipStream()))
{
    addAndMakeVisible (browser);
#ifdef PARP_UI_DEV_URL
    browser.goToURL (PARP_UI_DEV_URL);
#else
    browser.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
#endif
    setSize (900, 560);
    startTimerHz (30);
}

ParpEditor::~ParpEditor()
{
    stopTimer();
}

void ParpEditor::resized()
{
    browser.setBounds (getLocalBounds());
}

void ParpEditor::timerCallback()
{
    auto* status = new juce::DynamicObject();
    status->setProperty ("noteOnsIn", parpProcessor.uiStatus.noteOnsIn.load());
    status->setProperty ("noteOnsOut", parpProcessor.uiStatus.noteOnsOut.load());
    status->setProperty ("playing", parpProcessor.uiStatus.playing.load());
    status->setProperty ("bpm", parpProcessor.uiStatus.bpm.load());
    status->setProperty ("ppq", parpProcessor.uiStatus.ppq.load());
    browser.emitEventIfBrowserIsVisible ("engineStatus", juce::var (status));
}

// Serve files from the embedded UI zip ("/" -> index.html)
std::optional<juce::WebBrowserComponent::Resource> ParpEditor::getResource (const juce::String& url)
{
    auto path = url.trimCharactersAtStart ("/").upToFirstOccurrenceOf ("?", false, false);
    if (path.isEmpty())
        path = "index.html";

    if (auto* entry = uiZip.getEntry (path))
    {
        std::unique_ptr<juce::InputStream> stream (uiZip.createStreamForEntry (*entry));
        if (stream != nullptr)
        {
            juce::WebBrowserComponent::Resource resource;
            resource.data.resize ((size_t) stream->getTotalLength());
            stream->read (resource.data.data(), (int) resource.data.size());
            resource.mimeType = mimeTypeFor (path);
            return resource;
        }
    }
    return std::nullopt;
}
