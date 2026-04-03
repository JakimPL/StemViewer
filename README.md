# StemViewer - Multi-Stem Audio Waveform Viewer

A client-side web application for visualizing and playing multi-track audio with synchronized waveform display, individual stem control, and section navigation.

## Features

✅ **Synchronized Multi-Stem Playback** - Play multiple audio stems in perfect sync using Web Audio API  
✅ **Real-Time Waveform Visualization** - Canvas-based waveform rendering extracted from actual audio data (RMS amplitude)  
✅ **Individual Stem Control** - Mute/Solo individual tracks with instant gain adjustment  
✅ **Interactive Timeline** - Click anywhere on the waveform to seek, hover for time/bar display  
✅ **Section Markers** - Visual section boundaries with click-to-navigate  
✅ **Keyboard Shortcuts** - Comprehensive keyboard control for playback, navigation, and stem mixing  
✅ **Visual Feedback** - Loading states, playhead tracking, hover tooltips, notifications  
✅ **Configurable Granularity** - Adjustable waveform detail level via `WAVEFORM_PIXELS_PER_BAR` constant  

## Running Locally

Due to browser CORS restrictions with ES6 modules, you need to run a local web server.

### Quick Start (Python)

```bash
# In the project directory
python3 -m http.server 8192
```

Then open: **http://localhost:8192**

### Alternative Options

**Node.js:**
```bash
npm install -g http-server
http-server -p 8192
```

**PHP:**
```bash
php -S localhost:8192
```

**Stop server:** Press `Ctrl+C` in the terminal

## Keyboard Shortcuts

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `Space` | Play/Pause | `Esc` | Stop |
| `←` `→` | Seek backward/forward 5s | `Home` | Jump to start |
| `Tab` | Next section | `Shift+Tab` | Previous section |
| `1-9` | Toggle mute stem 1-9 | `Shift+1-9` | Toggle solo stem 1-9 |
| `M` | Mute all tracks | `U` | Unmute all tracks |

## File Structure

```
StemViewer/
├── index.html              # Main page
├── run.sh                  # Helper script to start server
├── css/
│   └── styles.css          # Complete styling (layout, controls, waveform, notifications)
├── js/
│   ├── main.js             # Main application logic & UI coordination
│   ├── dataLoader.js       # Manifest loading and validation
│   ├── utils.js            # Utility functions (time, section calculations)
│   └── audioEngine.js      # Web Audio API playback engine
└── data/
    ├── manifest.json       # Song metadata (EDIT THIS!)
    ├── MANIFEST_FORMAT.md  # Manifest documentation
    ├── music.mp3           # Full mix (optional)
    └── stems/
        ├── drums.mp3       # Individual stem files
        ├── bass.mp3
        └── ...
```

## Editing Your Song

1. **Edit `data/manifest.json`** with your song details:
   - Song metadata (title, artist, BPM, duration, time signature)
   - Stems array (id, name, file path, color)
   - Sections array (name, start/end times)

2. **Add your audio files** to `data/stems/` folder

3. **Refresh the page** - changes load automatically

See [data/MANIFEST_FORMAT.md](data/MANIFEST_FORMAT.md) for complete manifest documentation.

## Implementation Status

### Completed Features
✅ Project structure & module organization  
✅ Manifest loading & validation  
✅ UI layout with responsive design  
✅ **Synchronized multi-stem playback** with Web Audio API  
✅ **Real waveform rendering** from AudioBuffer data (RMS calculation)  
✅ Mute/Solo controls with instant gain adjustment  
✅ Play/Pause/Stop transport controls  
✅ Time display (MM:SS, bar/beat, duration)  
✅ Playhead tracking with visibility control  
✅ Section markers with click-to-navigate  
✅ Waveform click-to-seek  
✅ Hover tooltips with time/bar display  
✅ Loading state visual feedback  
✅ Comprehensive keyboard shortcuts  
✅ Notification system for user actions  
✅ Configurable waveform granularity  

### Planned Enhancements
⏳ Zoom functionality (zoom in/out on waveform)  
⏳ Module separation & code deduplication (see REFACTORING_PLAN.md)  
⏳ Performance optimization for 15+ stems  
⏳ Responsive testing & mobile improvements  

## Technical Architecture

**Core Technologies:**
- **Web Audio API** - Synchronized multi-stem playback, gain control, AudioBuffer processing
- **Canvas 2D** - Waveform rendering with RMS amplitude calculation
- **ES6 Modules** - Modular code organization
- **Vanilla JS** - Zero dependencies

**Key Design Patterns:**
- Event-driven audio engine (timeupdate, statechange, loadprogress, decodestart/end)
- Race condition protection (source reference capture, shared decode promise)
- Lazy audio decoding (decode on first user interaction to comply with autoplay policy)
- State synchronization between audio engine and UI

## Browser Compatibility

**Requires modern browser with:**
- ES6 modules support
- Web Audio API
- Canvas 2D API
- Fetch API

**Tested on:** Chrome, Firefox, Safari (recent versions)  
**Not supported:** Internet Explorer

## Known Issues

- `_handlePlaybackEnded` called twice at song end (marked TODO in audioEngine.js)
- Waveform granularity adjustment requires manual constant change (no UI control yet)

## Contributing

See [PLAN.md](PLAN.md) for overall project roadmap and [AUDIO_ENGINE.md](AUDIO_ENGINE.md) for audio engine implementation details.
