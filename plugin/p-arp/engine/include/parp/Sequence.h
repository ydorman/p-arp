#pragma once

#include <cstdint>
#include <span>
#include "parp/FixedVector.h"
#include "parp/Settings.h"

namespace parp
{

class Progression;

struct Note
{
    std::uint8_t pitch = 0;
    std::uint8_t velocity = 0;

    bool operator== (const Note&) const = default;
};

inline constexpr std::size_t maxHeldNotes = 128;
// 128 notes x 4 octaves, about doubled by Up/Down
inline constexpr std::size_t maxSequenceLength = 1024;

using NoteList = FixedVector<Note, maxHeldNotes>;
using Sequence = FixedVector<Note, maxSequenceLength>;

// Builds one arp cycle (the prototype's rebuildSequence): notes sorted by pitch (except As
// Played), expanded across `octaves` octaves and shifted by `transposeSemitones`, notes outside
// 0..127 dropped, then ordered by the pattern. Up/Down and Down/Up don't repeat the ends. Random
// keeps the Up order (the scheduler picks a random step each note).
void buildSequence (std::span<const Note> active, Pattern pattern, int octaves, int transposeSemitones, Sequence& out);

// Same, with pattern and octaves taken from the current series values (Octave Range: the series
// sets the octave count; Octave Transpose: the cycle spans Base Octave Range octaves, shifted by
// the series' offset from the base)
void buildSequence (std::span<const Note> active, const Settings& s, const Progression& progression, Sequence& out);

// Held and latched notes, and chord detection (the prototype's handleNoteOn / handleNoteOff)
class ChordTracker
{
public:
    struct NoteOnResult
    {
        bool newChord = false;      // first key down after all keys were up: restart series and pattern
        bool stopSounding = false;  // latch: a new chord replaces the latched one, stop its notes
    };

    struct NoteOffResult
    {
        bool stopSounding = false;    // not latched and every key released: stop sounding notes now
        bool sequenceChanged = false; // not latched: the active notes changed
    };

    NoteOnResult noteOn (int pitch, int velocity, bool latch);
    NoteOffResult noteOff (int pitch, bool latch);
    void clear();

    // Notes the arp plays: the latched chord when latch is on and one exists, else the held keys
    std::span<const Note> active (bool latch) const;

    const NoteList& held() const { return heldNotes; }
    const NoteList& latched() const { return latchedNotes; }

private:
    static void addOrUpdate (NoteList& list, int pitch, int velocity);

    NoteList heldNotes;
    NoteList latchedNotes;
};

} // namespace parp
