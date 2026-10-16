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

ParpEditor::Relays ParpEditor::createRelays()
{
    Relays relays;
    for (const auto& spec : parp::parameterSpecs())
    {
        const juce::String id (spec.id.data(), spec.id.size());
        switch (spec.kind)
        {
            case parp::ParamKind::Int:    relays.sliders.push_back (std::make_unique<juce::WebSliderRelay> (id)); break;
            case parp::ParamKind::Bool:   relays.toggles.push_back (std::make_unique<juce::WebToggleButtonRelay> (id)); break;
            case parp::ParamKind::Choice: relays.comboBoxes.push_back (std::make_unique<juce::WebComboBoxRelay> (id)); break;
        }
    }
    return relays;
}

juce::WebBrowserComponent::Options ParpEditor::createBrowserOptions (ParpEditor& editor)
{
    auto options = juce::WebBrowserComponent::Options {}
                       .withNativeIntegrationEnabled()
                       .withNativeFunction ("setDebugLog", [&editor] (const juce::Array<juce::var>& args, auto complete) {
                           editor.parpProcessor.debugLog.setEnabled (args.size() > 0 && (bool) args[0]);
                           complete (editor.parpProcessor.debugLog.isEnabled());
                       })
                       .withNativeFunction ("setEditorWidth", [&editor] (const juce::Array<juce::var>& args, auto complete) {
                           if (args.size() > 0)
                               editor.setWidth ((int) args[0]);
                           complete (editor.getWidth());
                       })
                       .withNativeFunction ("revealDebugLog", [&editor] (const juce::Array<juce::var>&, auto complete) {
                           const auto file = editor.parpProcessor.debugLog.currentFile();
                           if (file.existsAsFile())
                               file.revealToUser();
                           else
                               (DebugLog::folder().isDirectory() ? DebugLog::folder() : DebugLog::folder().getParentDirectory()).revealToUser();
                           complete (juce::var());
                       });
    for (auto& relay : editor.relays.sliders)
        options = options.withOptionsFrom (*relay);
    for (auto& relay : editor.relays.toggles)
        options = options.withOptionsFrom (*relay);
    for (auto& relay : editor.relays.comboBoxes)
        options = options.withOptionsFrom (*relay);
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
    // Bind each relay to its host parameter (same table order as createRelays)
    size_t slider = 0, toggle = 0, comboBox = 0;
    for (const auto& spec : parp::parameterSpecs())
    {
        auto& parameter = *parpProcessor.state.getParameter (juce::String (spec.id.data(), spec.id.size()));
        switch (spec.kind)
        {
            case parp::ParamKind::Int:
                sliderAttachments.push_back (std::make_unique<juce::WebSliderParameterAttachment> (parameter, *relays.sliders[slider++], nullptr));
                break;
            case parp::ParamKind::Bool:
                toggleAttachments.push_back (std::make_unique<juce::WebToggleButtonParameterAttachment> (parameter, *relays.toggles[toggle++], nullptr));
                break;
            case parp::ParamKind::Choice:
                comboBoxAttachments.push_back (std::make_unique<juce::WebComboBoxParameterAttachment> (parameter, *relays.comboBoxes[comboBox++], nullptr));
                break;
        }
    }

    addAndMakeVisible (browser);
#ifdef PARP_UI_DEV_URL
    browser.goToURL (PARP_UI_DEV_URL);
#else
    browser.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
#endif
    // Fixed layout (like a hardware panel): the UI scales proportionally with the window. The
    // page draws its own resize grip (JUCE's corner resizer would sit under the native web view)
    // and calls setEditorWidth; host-initiated resizes keep the aspect ratio too.
    setResizable (true, false);
    if (auto* constrainer = getConstrainer())
    {
        constrainer->setFixedAspectRatio (double (designWidth) / designHeight);
        constrainer->setSizeLimits (minWidth, minWidth * designHeight / designWidth, maxWidth, maxWidth * designHeight / designWidth);
    }
    setWidth (parpProcessor.editorWidth.load());

    // Live view feed: drop notes left from an earlier editor, then let the engine push new ones
    parp::LiveNote stale;
    while (parpProcessor.liveNotes.pop (stale)) {}
    parpProcessor.liveNotesEnabled = true;
    startTimerHz (30);
}

ParpEditor::~ParpEditor()
{
    parpProcessor.liveNotesEnabled = false;
    stopTimer();
}

void ParpEditor::resized()
{
    browser.setBounds (getLocalBounds());
    parpProcessor.editorWidth = getWidth();
}

void ParpEditor::setWidth (int width)
{
    width = juce::jlimit (minWidth, maxWidth, width);
    setSize (width, (int) std::lround (width * double (designHeight) / designWidth));
}

void ParpEditor::timerCallback()
{
    auto* status = new juce::DynamicObject();
    status->setProperty ("noteOnsIn", parpProcessor.uiStatus.noteOnsIn.load());
    status->setProperty ("noteOnsOut", parpProcessor.uiStatus.noteOnsOut.load());
    status->setProperty ("playing", parpProcessor.uiStatus.playing.load());
    status->setProperty ("bpm", parpProcessor.uiStatus.bpm.load());
    status->setProperty ("ppq", parpProcessor.uiStatus.ppq.load());
    status->setProperty ("timeline", parpProcessor.uiStatus.timeline.load());
    status->setProperty ("beatsPerBar", parpProcessor.uiStatus.beatsPerBar.load());
    status->setProperty ("debugLog", parpProcessor.debugLog.isEnabled());
    status->setProperty ("debugLogFile", parpProcessor.debugLog.currentFile().getFullPathName());
    browser.emitEventIfBrowserIsVisible ("engineStatus", juce::var (status));
    sendLiveNotes();
}

// Generated notes since the last tick: { time, beat, length, pitch, velocity }
void ParpEditor::sendLiveNotes()
{
    juce::Array<juce::var> notes;
    parp::LiveNote note;
    while (parpProcessor.liveNotes.pop (note))
    {
        auto* item = new juce::DynamicObject();
        item->setProperty ("time", note.time);
        item->setProperty ("beat", note.beat);
        item->setProperty ("length", note.length);
        item->setProperty ("pitch", (int) note.pitch);
        item->setProperty ("velocity", (int) note.velocity);
        notes.add (juce::var (item));
    }
    if (! notes.isEmpty())
        browser.emitEventIfBrowserIsVisible ("liveNotes", notes);
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
