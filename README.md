# StemViewer - Multi-Stem Audio Waveform Viewer

A client-side web application for visualizing and playing multi-track audio with synchronized waveform display, individual stem control, and section navigation.

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
│   ├── main.js             # App entrypoint and module coordination
│   ├── waveformRenderer.js # Canvas waveform rendering
│   ├── uiController.js     # DOM updates and UI state management
│   ├── keyboardController.js # Keyboard shortcuts and action dispatching
│   ├── notifications.js    # Notification and error manager
│   ├── songMetrics.js      # Timing, bars, sections, and ruler calculations
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
