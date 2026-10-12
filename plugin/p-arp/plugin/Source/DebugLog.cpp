#include "DebugLog.h"

DebugLog::DebugLog()
{
    startTimer (250);
}

DebugLog::~DebugLog()
{
    stopTimer();
    timerCallback(); // write what is left
}

juce::File DebugLog::folder()
{
    return juce::File::getSpecialLocation (juce::File::userHomeDirectory).getChildFile ("Library/Logs/p-arp");
}

void DebugLog::setEnabled (bool shouldBeEnabled)
{
    if (shouldBeEnabled && ! enabled.load())
        startNewFile = true;
    enabled = shouldBeEnabled;
}

void DebugLog::timerCallback()
{
    const auto lines = parp::drainLog (*events, formatter);
    if (lines.empty())
        return;

    if (startNewFile.exchange (false) || file == juce::File())
    {
        folder().createDirectory();
        const auto now = juce::Time::getCurrentTime();
        file = folder().getNonexistentChildFile ("debug-" + now.formatted ("%Y-%m-%d_%H-%M-%S"), ".log", false);
        file.appendText ("p-arp " JucePlugin_VersionString " debug log, " + now.toString (true, true) + "\n"
                         "Replay in the Scripter prototype: node tests/replay.js \"" + file.getFullPathName() + "\"\n\n");
    }

    juce::String text;
    for (const auto& line : lines)
        text << "[SARP] " << juce::String (line) << "\n";
    file.appendText (text);
}
