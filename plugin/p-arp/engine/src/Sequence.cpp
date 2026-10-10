#include "parp/Sequence.h"

#include <algorithm>
#include "parp/Progression.h"

namespace parp
{

void buildSequence (std::span<const Note> active, Pattern pattern, int octaves, int transposeSemitones, Sequence& out)
{
    out.clear();
    if (active.empty())
        return;

    // Sort by pitch for standard patterns (held pitches are unique, so std::sort's order is
    // deterministic, and it sorts in place without allocating)
    NoteList base;
    for (const auto& note : active)
        base.push_back (note);
    if (pattern != Pattern::AsPlayed)
        std::sort (base.begin(), base.end(), [] (const Note& a, const Note& b) { return a.pitch < b.pitch; });

    // Expand across octaves
    Sequence expanded;
    for (int octave = 0; octave < octaves; ++octave)
    {
        for (const auto& note : base)
        {
            const int pitch = int (note.pitch) + octave * 12 + transposeSemitones;
            if (pitch >= 0 && pitch <= 127)
                expanded.push_back ({ std::uint8_t (pitch), note.velocity });
        }
    }
    if (expanded.empty())
        return;

    const auto n = expanded.size();
    switch (pattern)
    {
        case Pattern::Up:
        case Pattern::AsPlayed:
        case Pattern::Random:
            for (const auto& note : expanded)
                out.push_back (note);
            break;
        case Pattern::Down:
            for (std::size_t i = n; i-- > 0;)
                out.push_back (expanded[i]);
            break;
        case Pattern::UpDown: // without repeating top/bottom
            for (const auto& note : expanded)
                out.push_back (note);
            for (std::size_t i = n - 1; i-- > 1;)
                out.push_back (expanded[i]);
            break;
        case Pattern::DownUp: // without repeating bottom/top
            for (std::size_t i = n; i-- > 0;)
                out.push_back (expanded[i]);
            for (std::size_t i = 1; i + 1 < n; ++i)
                out.push_back (expanded[i]);
            break;
    }
}

void buildSequence (std::span<const Note> active, const Settings& s, const Progression& progression, Sequence& out)
{
    int octaves = progression.value (SeriesId::Octave, s);
    int transpose = 0;
    if (s.octaveMode == OctaveMode::Transpose)
    {
        transpose = (octaves - s.baseOctave) * 12;
        octaves = s.baseOctave;
    }
    const auto pattern = Pattern (progression.value (SeriesId::Pattern, s));
    buildSequence (active, pattern, octaves, transpose, out);
}

// ---------------------------------------------------------------------------------------------

void ChordTracker::addOrUpdate (NoteList& list, int pitch, int velocity)
{
    for (auto& note : list)
    {
        if (note.pitch == pitch)
        {
            note.velocity = std::uint8_t (velocity);
            return;
        }
    }
    list.push_back ({ std::uint8_t (pitch), std::uint8_t (velocity) });
}

ChordTracker::NoteOnResult ChordTracker::noteOn (int pitch, int velocity, bool latch)
{
    NoteOnResult result;
    result.newChord = heldNotes.empty();
    if (latch && result.newChord)
    {
        // A new chord in latch mode replaces the previous latched chord
        result.stopSounding = true;
        latchedNotes.clear();
    }
    addOrUpdate (heldNotes, pitch, velocity);
    if (latch)
        addOrUpdate (latchedNotes, pitch, velocity);
    return result;
}

ChordTracker::NoteOffResult ChordTracker::noteOff (int pitch, bool latch)
{
    for (std::size_t i = 0; i < heldNotes.size(); ++i)
    {
        if (heldNotes[i].pitch == pitch)
        {
            heldNotes.erase (i);
            break;
        }
    }
    NoteOffResult result;
    if (! latch)
    {
        result.stopSounding = heldNotes.empty(); // releasing the whole chord stops the arp at once
        result.sequenceChanged = true;
    }
    return result;
}

void ChordTracker::clear()
{
    heldNotes.clear();
    latchedNotes.clear();
}

std::span<const Note> ChordTracker::active (bool latch) const
{
    if (latch && ! latchedNotes.empty())
        return latchedNotes.view();
    return heldNotes.view();
}

} // namespace parp
