#include "parp/Engine.h"

#include <algorithm>
#include <cmath>
#include "parp/Parameters.h"

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
    timelineAtBlockStart = 0.0;
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

void Engine::logEvent (LogRecord record)
{
    if (eventLog == nullptr)
        return;
    record.beatsPerBar = beatsPerBar;
    eventLog->push (record);
}

void Engine::logSettingChanges (double beat)
{
    if (eventLog == nullptr || loggedSettings == currentSettings)
        return;
    const auto specs = parameterSpecs();
    for (std::size_t i = 0; i < specs.size(); ++i)
    {
        const int value = specs[i].get (currentSettings);
        if (value == specs[i].get (loggedSettings))
            continue;
        LogRecord record;
        record.type = LogType::Param;
        record.param = std::int16_t (i);
        record.value = value;
        record.beat = beat;
        logEvent (record);
    }
    loggedSettings = currentSettings;
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
            const int offset = toOffset (block, pendingOffs[i].beat);
            emit (out, MidiEvent::Type::NoteOff, offset, pendingOffs[i].pitch, 64, pendingOffs[i].channel);
            if (eventLog != nullptr)
            {
                LogRecord record { .type = LogType::Off, .pitch = std::int16_t (pendingOffs[i].pitch), .beat = pendingOffs[i].beat };
                logTiming (record, pendingOffs[i].beat, offset);
                logEvent (record);
            }
            pendingOffs.erase (i);
        }
        else
        {
            ++i;
        }
    }
}

bool Engine::startsWithSamePitch (const Block& block, int pitch, int offset) const
{
    for (const auto& p : pendingOffs)
        if (p.pitch == pitch && p.onBeat >= block.start - beatEpsilon && toOffset (block, p.onBeat) == offset)
            return true;
    return false;
}

// A new note of a pitch that is still sounding ends the old note first (at the same sample; the
// output sort puts note-offs first). Otherwise the old note's note-off would cut the new note
// and the new note's note-off would find nothing to end (a stuck voice on some instruments).
void Engine::endSoundingPitch (const Block& block, int pitch, int offset, std::vector<MidiEvent>& out)
{
    for (std::size_t i = 0; i < pendingOffs.size();)
    {
        if (pendingOffs[i].pitch != pitch)
        {
            ++i;
            continue;
        }
        emit (out, MidiEvent::Type::NoteOff, offset, pitch, 64, pendingOffs[i].channel);
        if (eventLog != nullptr)
        {
            const double beat = block.start + double (offset) / block.samplesPerBeat;
            LogRecord record { .type = LogType::Off, .pitch = std::int16_t (pitch), .beat = beat };
            logTiming (record, beat, offset);
            logEvent (record);
        }
        pendingOffs.erase (i);
    }
}

void Engine::logTiming (LogRecord& record, double exactBeat, int offset) const
{
    record.exactBeat = exactBeat;
    record.sample = offset;
    record.blockSamples = currentBlock.numSamples;
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
        {
            emit (out, MidiEvent::Type::NoteOff, offset, pendingOffs[i].pitch, 64, pendingOffs[i].channel);
            LogRecord record;
            record.type = LogType::Flush;
            record.pitch = std::int16_t (pendingOffs[i].pitch);
            logTiming (record, currentBlock.start + double (offset) / std::max (1.0, currentBlock.samplesPerBeat), offset);
            logEvent (record);
        }
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
        logEvent ({ .type = LogType::NewChord });
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
    // Releasing the whole chord stops the arp: no new notes, but a note still sounding finishes its
    // gate (like most arps; an instrument with an abrupt release made the cut audible)
    (void) offset;
    (void) out;
    const auto result = chords.noteOff (pitch, currentSettings.latch);
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

    currentBlock = block;
    const auto beatAt = [&block] (int offset) { return block.start + double (offset) / block.samplesPerBeat; };
    const auto applyInput = [&] (const MidiEvent& event) {
        const bool isOn = event.type == MidiEvent::Type::NoteOn && event.velocity > 0;
        if (! isOn && event.type != MidiEvent::Type::NoteOn && event.type != MidiEvent::Type::NoteOff)
            return;
        LogRecord record;
        record.type = isOn ? LogType::NoteIn : LogType::NoteInOff;
        record.pitch = std::int16_t (event.note);
        record.velocity = std::int16_t (event.velocity);
        record.beat = beatAt (event.sampleOffset);
        logTiming (record, record.beat, event.sampleOffset);
        logEvent (record);
        if (isOn)
            handleNoteOn (event.note, event.velocity, record.beat, event.sampleOffset, out);
        else
            handleNoteOff (event.note, event.sampleOffset, out);
    };
    const std::size_t firstOut = out.size();
    timelineAtBlockStart = currentStatus.timeline;
    if (transport.playing)
        currentStatus.timeline += block.end - block.start;

    // 1. Transport start
    if (transport.playing && ! wasPlaying)
    {
        wasPlaying = true;
        lastBlockStartBeat = block.start;
        if (eventLog != nullptr)
        {
            LogRecord start;
            start.type = LogType::Start;
            start.beat = block.start;
            start.value1 = transport.bpm;
            start.flag = block.cycling;
            start.value2 = block.leftCycleBeat;
            start.value3 = block.rightCycleBeat;
            logEvent (start);
            const auto specs = parameterSpecs();
            for (std::size_t i = 0; i < specs.size(); ++i)
                logEvent ({ .type = LogType::Set, .param = std::int16_t (i), .value = specs[i].get (currentSettings) });
            loggedSettings = currentSettings;
        }
        restartAtTransportStart (block.start);
        logEvent ({ .type = LogType::AlignStart, .rate = std::int16_t (progression.value (SeriesId::Rate, currentSettings)), .beat = nextBeat });
    }
    else if (transport.playing)
    {
        logSettingChanges (block.start);
    }

    // 2. Transport stop: stop sounding notes and release a latched chord (each play starts fresh;
    // a region's notes latch again when it plays). Incoming notes are still tracked.
    if (! transport.playing)
    {
        if (wasPlaying)
        {
            wasPlaying = false;
            lastBlockStartBeat = -1.0;
            logEvent ({ .type = LogType::Stop, .beat = block.start });
            stopAllSoundingNotes (0, out);
            chords.clearLatched();
            rebuildSequence();
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
        logEvent ({ .type = LogType::LoopWrap, .rate = std::int16_t (progression.value (SeriesId::Rate, currentSettings)), .beat = nextBeat });
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
            logEvent ({ .type = LogType::CatchUp, .beat = nextBeat });
        }
    }

    // 5. Schedule in segments split at each incoming event, applying the event in between. An
    // event applies before any note up to eventLeadSamples before it: Logic sends an event on a
    // grid line up to ~2 samples after that line (by our reading of the block position), and a
    // chord released or changed exactly on a beat must not play the old chord's note there. Such
    // a note is played after the event instead, at most eventLeadSamples late (62 us at 48 kHz).
    const double lead = (eventLeadSamples + 0.5) / block.samplesPerBeat; // + 0.5: notes round to the nearest sample
    double segmentStart = block.start;
    for (const auto& event : in)
    {
        const double eventBeat = beatAt (event.sampleOffset);
        scheduleSegment (block, segmentStart, eventBeat - lead, out);
        applyInput (event);
        segmentStart = std::max (segmentStart, eventBeat);
    }
    // Likewise a note in the last samples of the block waits for the next block's events (it is
    // played at the next block's start, unless an event there releases the chord)
    scheduleSegment (block, segmentStart, block.end - lead, out);
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
            const double beforeAlign = nextBeat;
            alignSchedule (nextBeat, gridLength, stepBeats);
            // After a late (immediately played) note, resync to a grid line after it, never onto it
            if (lastLateOnset >= 0.0 && nextBeat <= lastLateOnset + beatEpsilon)
                alignSchedule (lastLateOnset + gridLength * 0.5, gridLength, stepBeats);
            lastLateOnset = -1.0;
            if (pendingRealign != Realign::None || nextBeat - beforeAlign > 1e-6)
            {
                const char reason = pendingRealign == Realign::Chord ? 'c'
                                  : pendingRealign == Realign::Rate  ? 'r'
                                  : pendingRealign == Realign::Beat  ? 'b'
                                                                     : 's';
                logEvent ({ .type = LogType::Align, .reason = reason, .beat = nextBeat, .value1 = beforeAlign, .value2 = gridLength });
            }
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
                if (completed.contains (SeriesId::Rate))
                    logEvent ({ .type = LogType::Pass, .flag = s.timing == TimingMode::Flow });
                stepIndex = 0;
                rebuildSequence();
                logEvent ({ .type = LogType::Advance, .beat = nextBeat, .value1 = unitBeats });
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
        const int noteOnOffset = toOffset (block, noteOnBeat);
        // The same pitch already starting on this sample (a chord on a bar line at a very fast rate
        // can reach one sample twice): one note, not two
        const bool duplicate = playNote && startsWithSamePitch (block, note.pitch, noteOnOffset);
        if (playNote && ! duplicate)
        {
            endSoundingPitch (block, note.pitch, noteOnOffset, out); // never two notes of one pitch at once
            emit (out, MidiEvent::Type::NoteOn, noteOnOffset, note.pitch, finalVelocity);
            pendingOffs.push_back ({ noteOffBeat, note.pitch, 1, noteOnBeat });
            ++currentStatus.noteOnsOut;
        }
        if (liveNotes != nullptr && playNote && ! duplicate)
        {
            LiveNote live;
            live.time = timelineAtBlockStart + (noteOnBeat - block.start);
            live.beat = noteOnBeat;
            live.length = noteOffBeat - noteOnBeat;
            live.pitch = note.pitch;
            live.velocity = std::uint8_t (finalVelocity);
            liveNotes->push (live);
        }
        if (eventLog != nullptr)
        {
            LogRecord record;
            record.type = playNote ? LogType::Out : LogType::Skip;
            record.pitch = note.pitch;
            record.velocity = std::int16_t (finalVelocity);
            record.beat = noteOnBeat;
            logTiming (record, noteOnBeat, noteOnOffset);
            record.value1 = noteOffBeat - noteOnBeat;
            record.rate = std::int16_t (progression.value (SeriesId::Rate, s));
            record.octave = std::int16_t (progression.value (SeriesId::Octave, s));
            record.pattern = std::int16_t (pattern);
            record.gate = std::int16_t (jsRound (gate * 100.0));
            record.swing = std::int16_t (progression.value (SeriesId::Swing, s));
            record.step = std::int16_t (stepIndex + 1);
            record.stepCount = std::int16_t (sequence.size());
            logEvent (record);
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
            logEvent ({ .type = LogType::Behind, .beat = segmentStart, .value1 = nextBeat });
            nextBeat = segmentStart;
            pendingRealign = Realign::Rate;
            lastLateOnset = noteOnBeat;
        }

        // I. Advance the series; Flow realigns to the beat when the rate series starts over
        if (s.advanceTrigger == AdvanceTrigger::NoteStep || (s.advanceTrigger == AdvanceTrigger::ArpCycle && isCycleEnd))
        {
            const auto completed = progression.advance (s, isCycleEnd);
            if (completed.contains (SeriesId::Rate))
                logEvent ({ .type = LogType::Pass, .flag = s.timing == TimingMode::Flow });
            if (completed.contains (SeriesId::Rate) && s.timing == TimingMode::Flow)
                pendingRealign = Realign::Beat;
            rebuildSequence();
        }

        // Note-offs due before the next note (keeps output ordered within the segment)
        flushDueOffs (block, std::min (nextBeat, segmentEnd), out);
    }
}

} // namespace parp
