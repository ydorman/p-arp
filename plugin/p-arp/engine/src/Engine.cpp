#include "parp/Engine.h"

#include <algorithm>
#include <cmath>

namespace parp
{

double quantizeBeatToGrid (double beat, double stepDuration)
{
    const double ticks = (beat - 1.0) / stepDuration;
    const double roundedTicks = jsRound (ticks);
    if (std::abs (ticks - roundedTicks) < 0.001)
        return 1.0 + roundedTicks * stepDuration; // already on the grid
    return 1.0 + std::ceil (ticks) * stepDuration; // snap forward
}

SwingTiming swingTiming (bool isOffBeat, double stepDuration, double swingPercent)
{
    const double s = swingPercent / 100.0;
    if (! isOffBeat)
        return { 0.0, 2.0 * s * stepDuration };
    return { (2.0 * s - 1.0) * stepDuration, 2.0 * (1.0 - s) * stepDuration };
}

Engine::Engine (std::uint64_t randomSeed) : rng (randomSeed)
{
    progression.reset (currentSettings);
}

void Engine::prepare (double newSampleRate, int)
{
    sampleRate = newSampleRate;
    reset();
}

void Engine::reset()
{
    chords.clear();
    sequence.clear();
    pendingOffs.clear();
    progression.reset (currentSettings);
    stepIndex = 0;
    nextBeat = 0.0;
    pendingRealign = Realign::None;
    chordStartBeat = -1.0;
    wasPlaying = false;
    lastBlockStartBeat = -1.0;
    swingStepCount = 0;
    hasAdvanceBoundary = false;
    lastLateOnset = -1.0;
    currentStatus = {};
}

void Engine::setSettings (const Settings& newSettings)
{
    if (newSettings == currentSettings)
        return;
    const unsigned resetsBefore = progression.resetCount();
    const auto result = progression.applySettingsChange (currentSettings, newSettings);
    if (result.realignToRateGrid)
        pendingRealign = Realign::Rate;
    // A full series restart also restarts the time-based advance count (prototype: resetSeriesState)
    if (progression.resetCount() != resetsBefore)
        hasAdvanceBoundary = false;
    currentSettings = newSettings;
    rebuildSequence();
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

void Engine::emit (std::vector<MidiEvent>& out, MidiEvent::Type type, int offset, int pitch, int velocity, int channel)
{
    if (out.size() >= out.capacity())
        return; // never grow on the audio thread
    MidiEvent event;
    event.type = type;
    event.sampleOffset = offset;
    event.note = pitch;
    event.velocity = velocity;
    event.channel = channel;
    out.push_back (event);
}

int Engine::toOffset (const Block& block, double beat)
{
    const int offset = int (std::floor ((beat - block.start) * block.samplesPerBeat + 0.5));
    return std::clamp (offset, 0, std::max (0, block.numSamples - 1));
}

void Engine::rebuildSequence()
{
    buildSequence (chords.active (currentSettings.latch), currentSettings, progression, sequence);
    if (stepIndex >= (int) sequence.size())
        stepIndex = 0;
}

void Engine::alignSchedule (double beat, double gridLength, double stepDuration)
{
    // Snap forward to a grid line, and restart swing pairing so notes on even grid ticks of the
    // current rate are on-beats
    nextBeat = quantizeBeatToGrid (beat, gridLength);
    const long long tick = (long long) jsRound ((nextBeat - 1.0) / stepDuration);
    swingStepCount = int (((tick % 2) + 2) % 2);
}

void Engine::restartAtTransportStart (double fromBeat)
{
    // Restart the series and pattern (also resets the time-based advance count)
    progression.reset (currentSettings);
    hasAdvanceBoundary = false;
    stepIndex = 0;
    rebuildSequence();
    const auto& rate = rates()[(size_t) progression.value (SeriesId::Rate, currentSettings)];
    alignSchedule (fromBeat, rate.grid, rate.beats);
    pendingRealign = Realign::None;
}

double Engine::advanceUnitBeats() const
{
    switch (currentSettings.advanceTrigger)
    {
        case AdvanceTrigger::Beat:    return 1.0;
        case AdvanceTrigger::Bar:     return beatsPerBar;
        case AdvanceTrigger::TwoBars: return 2.0 * beatsPerBar;
        case AdvanceTrigger::ArpCycle:
        case AdvanceTrigger::NoteStep: break;
    }
    return 0.0;
}

void Engine::flushDueOffs (const Block& block, double before, std::vector<MidiEvent>& out)
{
    for (std::size_t i = 0; i < pendingOffs.size();)
    {
        if (pendingOffs[i].beat < before - beatEpsilon)
        {
            emit (out, MidiEvent::Type::NoteOff, toOffset (block, pendingOffs[i].beat), pendingOffs[i].pitch, 64, pendingOffs[i].channel);
            pendingOffs.erase (i);
        }
        else
        {
            ++i;
        }
    }
}

void Engine::stopAllSoundingNotes (int offset, std::vector<MidiEvent>& out)
{
    // One note-off per sounding pitch, now
    for (std::size_t i = 0; i < pendingOffs.size(); ++i)
    {
        bool alreadySent = false;
        for (std::size_t j = 0; j < i; ++j)
            alreadySent = alreadySent || pendingOffs[j].pitch == pendingOffs[i].pitch;
        if (! alreadySent)
            emit (out, MidiEvent::Type::NoteOff, offset, pendingOffs[i].pitch, 64, pendingOffs[i].channel);
    }
    pendingOffs.clear();
}

// ---------------------------------------------------------------------------------------------
// Incoming notes (the prototype's handleNoteOn / handleNoteOff)
// ---------------------------------------------------------------------------------------------

void Engine::handleNoteOn (int pitch, int velocity, double beat, int offset, std::vector<MidiEvent>& out)
{
    ++currentStatus.noteOnsIn;
    const auto result = chords.noteOn (pitch, velocity, currentSettings.latch);
    if (result.stopSounding)
        stopAllSoundingNotes (offset, out);
    if (result.newChord)
    {
        // A new chord restarts the series and the pattern, snapped to the grid of its starting rate
        progression.reset (currentSettings);
        hasAdvanceBoundary = false;
        stepIndex = 0;
        pendingRealign = Realign::Chord;
        chordStartBeat = beat;
    }
    rebuildSequence();
}

void Engine::handleNoteOff (int pitch, int offset, std::vector<MidiEvent>& out)
{
    const auto result = chords.noteOff (pitch, currentSettings.latch);
    if (result.stopSounding)
        stopAllSoundingNotes (offset, out); // releasing the whole chord stops the arp at once
    if (result.sequenceChanged)
        rebuildSequence();
}

// ---------------------------------------------------------------------------------------------
// Block processing (the prototype's ProcessMIDI)
// ---------------------------------------------------------------------------------------------

void Engine::process (const Transport& transport, int numSamples, std::span<const MidiEvent> in, std::vector<MidiEvent>& out)
{
    Block block;
    block.samplesPerBeat = sampleRate * 60.0 / std::max (1.0, transport.bpm);
    block.numSamples = numSamples;
    block.start = transport.ppqAtBlockStart + 1.0;
    block.end = block.start + double (numSamples) / block.samplesPerBeat;
    block.cycling = transport.looping && transport.loopEndPpq > transport.loopStartPpq;
    block.leftCycleBeat = transport.loopStartPpq + 1.0;
    block.rightCycleBeat = transport.loopEndPpq + 1.0;
    if (transport.timeSigNumerator > 0 && transport.timeSigDenominator > 0)
        beatsPerBar = transport.timeSigNumerator * 4.0 / transport.timeSigDenominator;

    const auto beatAt = [&block] (int offset) { return block.start + double (offset) / block.samplesPerBeat; };
    const auto applyInput = [&] (const MidiEvent& event) {
        if (event.type == MidiEvent::Type::NoteOn && event.velocity > 0)
            handleNoteOn (event.note, event.velocity, beatAt (event.sampleOffset), event.sampleOffset, out);
        else if (event.type == MidiEvent::Type::NoteOn || event.type == MidiEvent::Type::NoteOff)
            handleNoteOff (event.note, event.sampleOffset, out);
    };
    const std::size_t firstOut = out.size();

    // 1. Transport start
    if (transport.playing && ! wasPlaying)
    {
        wasPlaying = true;
        lastBlockStartBeat = block.start;
        restartAtTransportStart (block.start);
    }

    // 2. Transport stop: stop sounding notes; incoming notes are still tracked
    if (! transport.playing)
    {
        if (wasPlaying)
        {
            wasPlaying = false;
            lastBlockStartBeat = -1.0;
            stopAllSoundingNotes (0, out);
        }
        for (const auto& event : in)
            applyInput (event);
        return;
    }

    // 3. Loop wrap or backward jump: restart like a transport start, so every loop pass plays the
    // same. If the block starts just past the loop start (blocks can straddle the loop end),
    // align from the loop start so its downbeat still plays (immediately).
    if (lastBlockStartBeat >= 0.0 && block.start < lastBlockStartBeat)
    {
        stopAllSoundingNotes (0, out);
        double wrapFrom = block.start;
        if (block.cycling && block.start >= block.leftCycleBeat && block.start - block.leftCycleBeat < chordLateTolerance)
            wrapFrom = block.leftCycleBeat;
        restartAtTransportStart (wrapFrom);
    }
    lastBlockStartBeat = block.start;

    // 4. Catch up if the transport jumped forward or the schedule got out of range. The schedule
    // can legitimately run one slowest step (6 beats) past the block, be up to chordLateTolerance
    // behind it after a late chord or a loop wrap, and wait on a swung off-beat's grid position.
    if (! chords.active (currentSettings.latch).empty() && ! sequence.empty())
    {
        const auto& rate = rates()[(size_t) progression.value (SeriesId::Rate, currentSettings)];
        const double maxSwingDelay = (2.0 * progression.value (SeriesId::Swing, currentSettings) / 100.0 - 1.0) * rate.beats;
        if (nextBeat < block.start - chordLateTolerance - maxSwingDelay || nextBeat > block.end + 8.0)
        {
            alignSchedule (block.start, rate.grid, rate.beats);
            pendingRealign = Realign::None;
        }
    }

    // 5. Schedule in segments split at each incoming event, applying the event in between
    double segmentStart = block.start;
    for (const auto& event : in)
    {
        const double eventBeat = beatAt (event.sampleOffset);
        scheduleSegment (block, segmentStart, eventBeat, out);
        applyInput (event);
        segmentStart = std::max (segmentStart, eventBeat);
    }
    scheduleSegment (block, segmentStart, block.end, out);
    flushDueOffs (block, block.end, out);

    // Sort this block's output by sample; at the same sample, note-offs before note-ons (a note
    // ending where the next one of the same pitch starts must not cut the new note)
    std::sort (out.begin() + (std::ptrdiff_t) firstOut, out.end(), [] (const MidiEvent& a, const MidiEvent& b) {
        if (a.sampleOffset != b.sampleOffset)
            return a.sampleOffset < b.sampleOffset;
        return a.type == MidiEvent::Type::NoteOff && b.type != MidiEvent::Type::NoteOff;
    });
}

void Engine::scheduleSegment (const Block& block, double segmentStart, double segmentEnd, std::vector<MidiEvent>& out)
{
    flushDueOffs (block, segmentStart, out);
    const auto& s = currentSettings;

    if (chords.active (s.latch).empty() || sequence.empty())
    {
        nextBeat = std::max (nextBeat, segmentEnd);
        return;
    }

    // A new chord starts from where it was played (snapped forward to the grid below). Starting
    // slightly before its beat lets a chord played just after a grid line start on that line.
    // Its beat is only trusted when within the tolerance before this segment.
    if (pendingRealign == Realign::Chord)
    {
        double chordBeat = segmentStart;
        if (chordStartBeat >= 0.0 && chordStartBeat <= segmentStart && segmentStart - chordStartBeat <= chordLateTolerance)
            chordBeat = chordStartBeat;
        nextBeat = chordBeat - chordLateTolerance;
    }

    while (nextBeat < segmentEnd - beatEpsilon)
    {
        if (sequence.empty())
            break;

        // A. Rate for this step
        const auto& rate = rates()[(size_t) progression.value (SeriesId::Rate, s)];
        const double stepBeats = rate.beats;

        // Grid alignment per Subdiv Change Timing (Snap: every note to its rate's grid; Flow /
        // Free: only on request). Requests: Chord / Rate -> this rate's grid; Beat -> the beat
        // (or this rate's grid if coarser), after the rate series completed a pass in Flow.
        const bool snapToGrid = s.timing == TimingMode::SnapToGrid;
        if (pendingRealign != Realign::None || snapToGrid)
        {
            const double gridLength = pendingRealign == Realign::Beat ? std::max (1.0, rate.grid) : rate.grid;
            alignSchedule (nextBeat, gridLength, stepBeats);
            // After a late (immediately played) note, resync to a grid line after it, never onto it
            if (lastLateOnset >= 0.0 && nextBeat <= lastLateOnset + beatEpsilon)
                alignSchedule (lastLateOnset + gridLength * 0.5, gridLength, stepBeats);
            lastLateOnset = -1.0;
            pendingRealign = Realign::None;
            if (nextBeat >= segmentEnd - beatEpsilon)
                break;
        }

        // Time-based Advance Trigger: the first note in a new beat/bar advances the series and
        // restarts the pattern, then this note is re-evaluated with the new values
        const double unitBeats = advanceUnitBeats();
        if (unitBeats > 0.0)
        {
            const auto boundary = (long long) std::floor ((nextBeat - 1.0) / unitBeats + 1e-6);
            if (! hasAdvanceBoundary || boundary < lastAdvanceBoundary)
            {
                hasAdvanceBoundary = true;
                lastAdvanceBoundary = boundary;
            }
            else if (boundary > lastAdvanceBoundary)
            {
                lastAdvanceBoundary = boundary;
                const auto completed = progression.advance (s, true);
                stepIndex = 0;
                rebuildSequence();
                if (completed.contains (SeriesId::Rate) && s.timing == TimingMode::Flow)
                    pendingRealign = Realign::Beat;
                continue;
            }
        }

        // B. Swing: the grid pointer stays on the straight grid; only this note's timing moves
        // (never in the past). Only send a note in the segment where it starts.
        const auto swing = swingTiming (swingStepCount % 2 == 1, stepBeats, progression.value (SeriesId::Swing, s));
        const double noteOnBeat = std::max (nextBeat + swing.offset, segmentStart);
        if (noteOnBeat >= segmentEnd - beatEpsilon)
            break;

        // C. Select note
        const auto pattern = Pattern (progression.value (SeriesId::Pattern, s));
        const Note note = pattern == Pattern::Random
                              ? sequence[(std::size_t) std::min ((int) sequence.size() - 1, int (rng.next() * double (sequence.size())))]
                              : sequence[(std::size_t) stepIndex];

        // D. Velocity (series, then humanize)
        double velocity = isSeriesActive (SeriesId::Velocity, s) ? progression.value (SeriesId::Velocity, s) : note.velocity;
        if (s.humanizeVelocity > 0)
            velocity += (rng.next() * 2.0 - 1.0) * s.humanizeVelocity;
        const int finalVelocity = std::clamp ((int) jsRound (velocity), 1, 127);

        // E. Gate (series, then humanize), relative to the swung slot
        double gatePercent = progression.value (SeriesId::Gate, s);
        if (s.humanizeGate > 0)
            gatePercent += (rng.next() * 2.0 - 1.0) * s.humanizeGate;
        const double gate = std::clamp (gatePercent, 1.0, 100.0) / 100.0;
        double noteOffBeat = noteOnBeat + swing.length * gate;

        // Loop boundaries: a note pushed to or past the loop end is skipped; a note running past it
        // is cut just before it
        const bool playNote = ! (block.cycling && noteOnBeat >= block.rightCycleBeat);
        if (block.cycling && noteOffBeat >= block.rightCycleBeat)
            noteOffBeat = std::max (noteOnBeat, block.rightCycleBeat - 0.005);
        noteOffBeat = std::max (noteOffBeat, noteOnBeat + 1.0 / block.samplesPerBeat); // at least 1 sample

        // F. Emit the note-on now, queue the note-off
        if (playNote)
        {
            emit (out, MidiEvent::Type::NoteOn, toOffset (block, noteOnBeat), note.pitch, finalVelocity);
            pendingOffs.push_back ({ noteOffBeat, note.pitch, 1 });
            ++currentStatus.noteOnsOut;
        }

        // G. Advance the step
        bool isCycleEnd = false;
        if (++stepIndex >= (int) sequence.size())
        {
            stepIndex = 0;
            isCycleEnd = true;
        }

        // H. Advance the beat pointer by this note's step (before the series change the rate)
        nextBeat += stepBeats;
        ++swingStepCount;

        // Safety net: at most one note is played "immediately" (late start); if still behind,
        // jump forward and snap to the grid instead of firing every missed step at once
        if (nextBeat < segmentStart)
        {
            nextBeat = segmentStart;
            pendingRealign = Realign::Rate;
            lastLateOnset = noteOnBeat;
        }

        // I. Advance the series; Flow realigns to the beat when the rate series starts over
        if (s.advanceTrigger == AdvanceTrigger::NoteStep || (s.advanceTrigger == AdvanceTrigger::ArpCycle && isCycleEnd))
        {
            const auto completed = progression.advance (s, isCycleEnd);
            if (completed.contains (SeriesId::Rate) && s.timing == TimingMode::Flow)
                pendingRealign = Realign::Beat;
            rebuildSequence();
        }

        // Note-offs due before the next note (keeps output ordered within the segment)
        flushDueOffs (block, std::min (nextBeat, segmentEnd), out);
    }
}

} // namespace parp
