## Plan: Multi-Stem Audio Waveform Viewer

Build a static HTML/CSS/JS audio player that displays and plays multiple audio stems with waveform visualization, time tracking, zoom, and section markers. No server required - loads from static files (JSON metadata + pre-rendered MP3s including sum of all stems).

**Architecture**: Pure client-side vanilla JS, Web Audio API for synchronized playback and waveform data extraction, Canvas for waveform rendering. Modular structure separating concerns: audio engine, waveform renderer, UI controller, data loader. Waveform is generated client-side from audio buffer data.

**Steps**

*Phase 1: Foundation & Basic Playback*
1. **Project structure & HTML skeleton** - Create index.html, styles.css, JS module files, sample manifest.json (*parallel with 2, 3*)
2. **Data loader module** (dataLoader.js) - Fetch/parse manifest.json and waveform.json with validation (*parallel with 1, 3*)
3. **Audio engine module** (audioEngine.js) - Web Audio API setup, load MP3s as AudioBuffers, play/pause/stop, time tracking (*depends on 2 for manifest data*)

*Phase 2: Waveform Visualization*
4. **Waveform renderer module** (waveformRenderer.js) - Canvas setup, render stacked stems with color coding from waveform data
5. **Playhead indicator** - Draw vertical line synced to playback position with requestAnimationFrame

*Phase 3: UI Controls & Time Display*
6. **Transport controls UI** (ui.js) - Play/Pause/Stop buttons wired to audio engine
7. **Time display** - Show MM:SS, bar number (from BPM), time ruler on canvas

*Phase 4: Zoom Functionality*
8. **Zoom controls & logic** - Zoom in/out buttons, re-render waveform, horizontal scroll for zoomed view

*Phase 5: Stem Controls*
9. **Stem mixer panel** - Mute/unmute checkboxes, solo functionality via Web Audio gain nodes, visual indication on waveform

*Phase 6: Section Markers*
10. **Section markers visualization** - Draw boundaries and labels on waveform, optional click-to-jump

*Phase 7: Polish & Optimization*
11. **Error handling & loading states** - Spinners, error messages, progress indicators, graceful degradation
12. **Responsive improvements & testing** - Canvas resize, test with sample data, performance check (15+ stems), browser compatibility

**Module Structure**
```
index.html
styles.css
js/
  ├── main.js              (initialization, coordinates modules)
  ├── dataLoader.js        (fetch & parse JSON)
  ├── audioEngine.js       (Web Audio API, playback control)
  ├── waveformRenderer.js  (Canvas rendering)
  ├── ui.js                (DOM manipulation, event handlers)
  └── utils.js             (time formatting, bar calculation)
data/
  ├── manifest.json
  ├── waveform.json
  └── stems/
      ├── drums.mp3
      └── ...
```

**Data Formats**

manifest.json includes: song metadata (title, artist, duration, BPM, time signature, sample rate), stems array (id, name, file path, order, color), sections array (name, start/end bar & time), optional mix file path (sum of all stems for poor connections)

Waveform data is extracted client-side from AudioBuffer using Web Audio API getChannelData(), then downsampled for rendering performance

**Verification**
1. Load page and play - verify all stems audible in sync
2. Waveform matches audio with correct colors per stem
3. MM:SS and bar number update accurately during playback
4. Zoom in/out with working horizontal scroll, detail increases when zoomed
5. Mute/solo correctly affects audio output
6. Section markers display at correct time positions
7. Performance test with 15+ stems, 8+ minute song
8. Browser throttling test for "poor connection" scenario

**Decisions**
- Web Audio API (modern browsers, no IE support)
- Pre-rendered waveform data provided by user
- Single zoom resolution initially (can add LOD later if needed)
- Full stem loading before playback (no streaming)
- Canvas 2D rendering (WebGL deferred)
- Time ruler shows minutes/seconds; bar ruler shows bar numbers

**Code Standards**
1. **Modularity** - Avoid spaghetti code by organizing into classes and functions with a single clear objective
2. **DRY Principle** - Avoid duplicated code through proper abstraction of reusable elements
3. **Clear responsibilities** - Each module/class should have one primary purpose
4. **Reusable utilities** - Extract common patterns into utility functions

**Further Considerations**
1. **Waveform generation tool** - Include Node.js script to generate waveform.json from MP3s? *Recommend: defer, assume user provides*
2. **Pre-rendered mix fallback** - Load single mix.mp3 when stems unavailable? *Recommend: defer to future enhancement*
3. **Beat grid** - Show beat subdivisions beyond bars? *Recommend: bars only initially*
4. **Keyboard shortcuts** - Space for play/pause, arrows for seek? *Recommend: add in Phase 6-7*
5. **Multi-resolution waveforms** - Support multiple samplesPerPeak levels for zoom? *Recommend: single resolution (512), add LOD only if performance issues*
