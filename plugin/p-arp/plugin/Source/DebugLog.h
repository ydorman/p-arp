#pragma once

#include <juce_events/juce_events.h>
#include <parp/EventLog.h>
#include <atomic>
#include <memory>

// The plugin's debug log: while enabled, the engine records events into `events` (audio thread)
// and a timer on the message thread formats them and appends them to a file in
// ~/Library/Logs/p-arp/ (one file per time the log is switched on). Lines carry the prototype's
// "[SARP] " prefix, so tests/replay.js can replay them in the Scripter prototype's mock.
class DebugLog : private juce::Timer
{
public:
    DebugLog();
    ~DebugLog() override;

    // Any thread
    void setEnabled (bool enabled);
    bool isEnabled() const { return enabled.load (std::memory_order_relaxed); }

    // Audio thread: the engine's log while enabled, else nullptr
    parp::EventLog* engineLog() { return isEnabled() ? events.get() : nullptr; }

    // Message thread: the current log file (empty until something was logged)
    juce::File currentFile() const { return file; }
    static juce::File folder();

private:
    void timerCallback() override;

    std::unique_ptr<parp::EventLog> events = std::make_unique<parp::EventLog>();
    std::atomic<bool> enabled { false };
    std::atomic<bool> startNewFile { true };
    parp::LogFormatter formatter;
    juce::File file;
};
