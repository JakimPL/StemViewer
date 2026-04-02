# StemViewer - Local Development

## Running Locally

Due to browser CORS restrictions with ES6 modules, you need to run a local web server.

### Option 1: Python (Easiest)

```bash
# In the project directory
python3 -m http.server 8192
```

Then open: **http://localhost:8080**

### Option 2: Node.js (if you have it installed)

```bash
# Install http-server globally (one time)
npm install -g http-server

# Run server
http-server -p 8080
```

Then open: **http://localhost:8080**

### Option 3: PHP (if installed)

```bash
php -S localhost:8080
```

Then open: **http://localhost:8080**

## Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

## File Structure

```
StemViewer/
├── index.html          # Main page
├── css/
│   └── styles.css      # Styling
├── js/
│   ├── main.js         # Main application logic
│   ├── dataLoader.js   # Load and validate manifest.json
│   ├── utils.js        # Utility functions (time formatting, etc.)
│   ├── audioEngine.js  # (Future) Web Audio API integration
│   ├── waveformRenderer.js  # (Future) Canvas waveform rendering
│   └── ui.js           # (Future) UI event handlers
└── data/
    ├── manifest.json   # Song metadata (edit this!)
    ├── MANIFEST_FORMAT.md  # Documentation for manifest structure
    ├── music.mp3       # Full mix
    └── stems/
        ├── drums.mp3
        ├── bass.mp3
        └── ...         # Individual stem files
```

## Editing Your Song

1. **Edit `data/manifest.json`** with your song details
2. **Add your audio files** to `data/` folder
3. **Refresh the page** - changes load automatically

See [data/MANIFEST_FORMAT.md](data/MANIFEST_FORMAT.md) for complete documentation on the manifest structure.

## Current Status

✅ Project structure created  
✅ Metadata loading and display  
✅ UI layout with responsive design  
✅ Placeholder waveform visualization  
⏳ Audio playback (next step)  
⏳ Real waveform from audio data  
⏳ Zoom functionality  
⏳ Mute/Solo controls  

## Browser Compatibility

Requires modern browser with:
- ES6 modules support
- Web Audio API
- Canvas 2D
- Fetch API

Tested on: Chrome, Firefox, Safari (recent versions)
