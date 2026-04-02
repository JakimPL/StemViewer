# Manifest.json Structure

This file defines all metadata for your song, including song information, stems, and sections.

## Top-Level Structure

```json
{
  "song": { ... },
  "files": { ... },
  "stems": [ ... ],
  "sections": [ ... ]
}
```

## Song Object (Required)

Contains metadata about the song.

### Required Fields:
- **`title`** (string): Song title
- **`artist`** (string): Artist name
- **`duration`** (number): Total duration in seconds (e.g., 225.5)
- **`bpm`** (number): Beats per minute (e.g., 120)

### Optional Fields:
- **`durationFormatted`** (string): Pre-formatted duration (e.g., "3:45")
- **`timeSignature`** (string): Time signature (e.g., "4/4", "3/4")
- **`key`** (string): Musical key (e.g., "C Major", "A minor")
- **`sampleRate`** (number): Audio sample rate in Hz (e.g., 44100)
- **`format`** (string): Audio format (e.g., "mp3", "wav")
- **`bitrate`** (string): Bitrate (e.g., "320kbps", "192kbps")

### Example:
```json
"song": {
  "title": "My Song",
  "artist": "Artist Name",
  "duration": 180.0,
  "durationFormatted": "3:00",
  "bpm": 120,
  "timeSignature": "4/4",
  "key": "C Major",
  "sampleRate": 44100,
  "format": "mp3",
  "bitrate": "320kbps"
}
```

## Files Object (Required)

Contains paths to audio files.

- **`mix`** (string): Path to the full mix/sum of all stems (relative to data/ folder)

### Example:
```json
"files": {
  "mix": "music.mp3"
}
```

## Stems Array (Required)

Array of stem objects. Each stem represents an individual audio track.

### Required Fields:
- **`id`** (string): Unique identifier (e.g., "drums", "bass")
- **`name`** (string): Display name (e.g., "Drums", "Bass Guitar")
- **`file`** (string): Path to audio file relative to data/ folder (e.g., "stems/drums.mp3")

### Optional Fields:
- **`order`** (number): Display order (0-indexed). If omitted, uses array order
- **`color`** (string): Hex color for waveform visualization (e.g., "#ff6b6b"). Default: "#888888"

### Example:
```json
"stems": [
  {
    "id": "drums",
    "name": "Drums",
    "file": "stems/drums.mp3",
    "order": 0,
    "color": "#ff6b6b"
  },
  {
    "id": "bass",
    "name": "Bass",
    "file": "stems/bass.mp3",
    "order": 1,
    "color": "#4ecdc4"
  }
]
```

### Suggested Colors:
- Red: `#ff6b6b`
- Teal: `#4ecdc4`
- Yellow: `#ffe66d`
- Light Blue: `#a8dadc`
- Purple: `#b794f4`
- Orange: `#ffa94d`
- Green: `#51cf66`
- Pink: `#ff6b9d`

## Sections Array (Required)

Array of song sections (Intro, Verse, Chorus, etc.) with timing information.

**You must provide EITHER bar-based OR time-based values (or both):**

### Option A: Time-Based (recommended for flexibility)
- **`startTime`** (number, required if no bars): Start time in seconds
- **`endTime`** (number, required if no bars): End time in seconds

### Option B: Bar-Based (recommended for musical accuracy)
- **`startBar`** (number, required if no time): Start bar number (0-indexed, can be fractional like 8.5)
- **`endBar`** (number, required if no time): End bar number (0-indexed, can be fractional)

### Common Field:
- **`name`** (string, required): Section name (e.g., "Intro", "Verse 1", "Chorus")

### Behavior:
- If **only bars** are provided → time is calculated from bars using BPM and time signature
- If **only time** is provided → bars are calculated from time using BPM and time signature  
- If **both** are provided → bars take precedence, time is recalculated from bars
- If **neither** is provided → error is thrown

**Note**: Bar numbers are 0-indexed (first bar = 0) and can be fractional (e.g., 8.5 = middle of bar 9).

### Example (Time-Based):
```json
"sections": [
  {
    "name": "Intro",
    "startTime": 0,
    "endTime": 16.0
  },
  {
    "name": "Verse 1",
    "startTime": 16.0,
    "endTime": 48.0
  }
]
```

### Example (Bar-Based):
```json
"sections": [
  {
    "name": "Intro",
    "startBar": 0,
    "endBar": 8,
  },
  {
    "name": "Verse 1",
    "startBar": 8,
    "endBar": 24
  }
]
```

### Example (Both - bars take precedence):
```json
"sections": [
  {
    "name": "Intro",
    "startBar": 0,
    "endBar": 8,
    "startTime": 0,
    "endTime": 16.0
  }
]
```
In this case, `startTime` and `endTime` will be recalculated from the bar values.

## Calculating Times and Bars

### Time from Bars:
If you know bar numbers but not exact times:

```
secondsPerBeat = 60 / BPM
beatsPerBar = timeSignature (first number, e.g., 4 in "4/4")
secondsPerBar = secondsPerBeat × beatsPerBar
timeInSeconds = barNumber × secondsPerBar
```

**Example** (120 BPM, 4/4):
- secondsPerBeat = 60 / 120 = 0.5 seconds
- beatsPerBar = 4
- secondsPerBar = 0.5 × 4 = 2 seconds
- Bar 0 = 0 × 2 = 0 seconds (start)
- Bar 8 = 8 × 2 = 16 seconds

**Note**: Bar numbers are 0-indexed, so the first bar is 0, not 1.

### Bars from Time:
If you know time but want to calculate bars:

```
barNumber = timeInSeconds / secondsPerBar
```

For the above example at 16 seconds:
- barNumber = 16 / 2 = 8 (bar 8, which is the 9th bar)

### Duration Formatting:
The `durationFormatted` field is optional. If omitted, the app will auto-format from the `duration` field (e.g., 225.5 seconds → "3:45").

## Complete Example

```json
{
  "song": {
    "title": "Epic Track",
    "artist": "Sound Designer",
    "duration": 180.0,
    "durationFormatted": "3:00",
    "bpm": 128,
    "timeSignature": "4/4",
    "key": "D minor",
    "sampleRate": 44100,
    "format": "mp3",
    "bitrate": "320kbps"
  },
  "files": {
    "mix": "music.mp3"
  },
  "stems": [
    {
      "id": "kick",
      "name": "Kick Drum",
      "file": "stems/kick.mp3",
      "order": 0,
      "color": "#ff6b6b"
    },
    {
      "id": "bass",
      "name": "Bass",
      "file": "stems/bass.mp3",
      "order": 1,
      "color": "#4ecdc4"
    },
    {
      "id": "synth",
      "name": "Synth Lead",
      "file": "stems/synth.mp3",
      "order": 2,
      "color": "#ffe66d"
    }
  ],
  "sections": [
    {
      "name": "Intro",
      "startTime": 0,
      "endTime": 15.0
    },
    {
      "name": "Drop",
      "startTime": 15.0,
      "endTime": 60.0
    },
    {
      "name": "Breakdown",
      "startTime": 60.0,
      "endTime": 90.0
    }
  ]
}
```

## File Paths

All file paths in the manifest are **relative to the `data/` folder**:
- `"mix": "music.mp3"` → looks for `data/music.mp3`
- `"file": "stems/drums.mp3"` → looks for `data/stems/drums.mp3`

Make sure your audio files are placed in the correct locations!
