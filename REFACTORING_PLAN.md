# Refactoring Plan: Module Separation & Code Deduplication

## Current Issues

**main.js is doing too much (~1165 lines):**
- UI initialization and updates
- Event handling
- Waveform rendering
- Keyboard shortcuts
- Time calculations
- Notification display

**Code Duplication Patterns:**
1. **Guard clauses** - `if (!audioEngine) return;` appears 13 times
2. **Stem button UI updates** - querySelector + classList manipulation repeated 4+ times
3. **Audio engine state checks** - Similar patterns across action functions
4. **Section navigation logic** - Next/previous section have similar structure

## Proposed Module Structure

```
js/
├── main.js              (100-150 lines) - App initialization & coordination only
├── audioEngine.js       (EXISTING) - Web Audio API playback
├── dataLoader.js        (EXISTING) - Manifest loading
├── utils.js             (EXISTING) - Time/section utilities
├── waveformRenderer.js  (NEW) - Canvas waveform rendering
├── uiController.js      (NEW) - UI updates & DOM manipulation
├── keyboardController.js (NEW) - Keyboard shortcut handling
└── notifications.js     (NEW) - Notification/error display
```

## Refactoring Steps

### Phase 1: Extract Waveform Rendering Module

**File:** `js/waveformRenderer.js`

**Responsibility:** All canvas-related waveform rendering logic

**Extract from main.js:**
- `initializeCanvas()`
- `drawPlaceholderWaveform()`
- `getAudioBuffers()`
- `getAmplitudeAtPosition()`
- `WAVEFORM_PIXELS_PER_BAR` constant

**Benefits:**
- Single responsibility for waveform visualization
- Easier to add zoom functionality later
- Testable in isolation
- Reduces main.js size by ~150 lines

**Interface:**
```javascript
export class WaveformRenderer {
    constructor(canvasElement, manifest, pixelsPerBar = 4)
    setAudioEngine(audioEngine)
    render()
    resize()
    getTimeAtPosition(x) // For click-to-seek
}
```

---

### Phase 2: Extract UI Controller Module

**File:** `js/uiController.js`

**Responsibility:** All DOM updates and UI state management

**Extract from main.js:**
- `updateSongHeader()`
- `updateStemsList()` + `createStemItem()`
- `updateSectionMarkers()` + `createSectionMarker()`
- `updateTimeRuler()`
- `updateMetadataPanel()`
- `updateTimeDisplay()`
- `updatePlayhead()`
- `updatePlayheadVisibility()`
- `updateActiveSection()`
- `updatePlayButtonIcon()`
- `adjustStemHeights()`

**New helper functions to add:**
```javascript
updateStemButton(stemId, type, isActive) // Deduplicate button updates
updateAllStemButtons(stems) // For mute/unmute all
```

**Benefits:**
- Centralizes all UI updates
- Eliminates button update duplication
- Clear separation of concerns
- Reduces main.js by ~300 lines

**Interface:**
```javascript
export class UIController {
    constructor(manifest)
    
    // Initialization
    initializeHeader()
    initializeStems()
    initializeSections()
    initializeMetadata()
    
    // Updates
    updateTimeDisplay(currentTime)
    updatePlayhead(currentTime, isVisible)
    updateActiveSection(currentTime)
    updateStemButton(stemId, buttonType, isActive)
    updateTransportButton(buttonId, state)
    
    // Helpers
    getStemButton(stemId, type) // Returns button element
}
```

---

### Phase 3: Extract Keyboard Controller Module

**File:** `js/keyboardController.js`

**Responsibility:** Keyboard event handling and action dispatching

**Extract from main.js:**
- `setupKeyboardShortcuts()`
- All `action*()` functions (13 functions)
- Key mapping logic

**Deduplication opportunity:**
```javascript
// Instead of repeating in every action:
if (!audioEngine) return;

// Wrap actions:
function withAudioEngine(callback) {
    return function(...args) {
        if (!audioEngine) return;
        return callback.call(this, ...args);
    };
}
```

**Benefits:**
- Self-contained keyboard handling
- Easier to add/modify shortcuts
- Actions are properly encapsulated
- Guard clause duplication eliminated
- Reduces main.js by ~280 lines

**Interface:**
```javascript
export class KeyboardController {
    constructor(audioEngine, uiController, manifest)
    
    enable()
    disable()
    setAudioEngine(audioEngine) // For late binding
    
    // Actions can be called programmatically
    actions = {
        togglePlayPause: () => {...},
        stop: () => {...},
        seekBackward: (seconds) => {...},
        // etc.
    }
}
```

---

### Phase 4: Extract Notification System

**File:** `js/notifications.js`

**Responsibility:** User notifications and error messages

**Extract from main.js:**
- `showNotification()`
- `showError()`

**Benefits:**
- Can be extended with different notification types
- Centralized notification management
- Easy to add notification queue, priority, etc.
- Reduces main.js by ~30 lines

**Interface:**
```javascript
export class NotificationManager {
    static show(message, duration = 3000, type = 'info')
    static error(message, duration = 0) // 0 = no auto-dismiss
    static dismiss()
}
```

---

### Phase 5: Deduplicate Stem Button Updates

**Problem:** This pattern appears 4+ times in main.js:
```javascript
const muteBtn = document.querySelector(`.mute-btn[data-stem-id="${stem.id}"]`);
const soloBtn = document.querySelector(`.solo-btn[data-stem-id="${stem.id}"]`);
if (muteBtn) muteBtn.classList.toggle('active', isMuted);
if (soloBtn) soloBtn.classList.remove('active');
```

**Solution:** Create helper in UIController:
```javascript
// In uiController.js
updateStemButtons(stemId, { mute, solo }) {
    const muteBtn = this.getStemButton(stemId, 'mute');
    const soloBtn = this.getStemButton(stemId, 'solo');
    
    if (mute !== undefined && muteBtn) {
        muteBtn.classList.toggle('active', mute);
    }
    if (solo !== undefined && soloBtn) {
        soloBtn.classList.toggle('active', solo);
    }
}

// In keyboard actions:
uiController.updateStemButtons(stem.id, { mute: isMuted });
```

**Benefits:**
- Single source of truth for button updates
- Eliminates 4+ instances of duplicated code
- Easier to add more button types later

---

### Phase 6: Refactor main.js

**After extraction, main.js becomes:**

```javascript
import { loadManifest } from './dataLoader.js';
import { AudioEngine } from './audioEngine.js';
import { WaveformRenderer } from './waveformRenderer.js';
import { UIController } from './uiController.js';
import { KeyboardController } from './keyboardController.js';
import { NotificationManager } from './notifications.js';

// Application state
let manifest = null;
let audioEngine = null;
let waveformRenderer = null;
let uiController = null;
let keyboardController = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load data
        manifest = await loadManifest();
        
        // Initialize modules
        uiController = new UIController(manifest);
        uiController.initializeAll();
        
        waveformRenderer = new WaveformRenderer(
            document.getElementById('waveform-canvas'),
            manifest
        );
        
        audioEngine = new AudioEngine();
        setupAudioEventListeners();
        
        keyboardController = new KeyboardController(audioEngine, uiController, manifest);
        keyboardController.enable();
        
        await audioEngine.loadFromManifest(manifest);
        waveformRenderer.setAudioEngine(audioEngine);
        
        setupUIEventListeners();
        
    } catch (error) {
        NotificationManager.error('Failed to load: ' + error.message);
    }
});

function setupAudioEventListeners() {
    audioEngine.on('timeupdate', (time) => {
        uiController.updateTimeDisplay(time);
        uiController.updatePlayhead(time, true);
        uiController.updateActiveSection(time);
    });
    
    audioEngine.on('statechange', (state) => {
        uiController.updatePlayhead(state.currentTime, state.isPlaying || state.isPaused);
    });
    
    audioEngine.on('ended', () => {
        uiController.updateTransportButton('play', 'stopped');
        uiController.updateTransportButton('stop', 'disabled');
    });
    
    // ... other audio events
}

function setupUIEventListeners() {
    // Transport controls
    document.getElementById('play-btn').addEventListener('click', async () => {
        if (!audioEngine) return;
        
        const state = audioEngine.getState();
        if (state.isPlaying) {
            audioEngine.pause();
        } else {
            await audioEngine.play();
        }
    });
    
    // Stem controls
    document.querySelector('.stems-sidebar').addEventListener('click', (e) => {
        if (!audioEngine) return;
        
        const muteBtn = e.target.closest('.mute-btn');
        const soloBtn = e.target.closest('.solo-btn');
        
        if (muteBtn) {
            const stemId = muteBtn.dataset.stemId;
            const isMuted = audioEngine.toggleMute(stemId);
            uiController.updateStemButtons(stemId, { mute: isMuted, solo: false });
        } else if (soloBtn) {
            // ... similar with new helper
        }
    });
    
    // Waveform interactions
    setupWaveformInteractions();
    
    // Window resize
    window.addEventListener('resize', () => {
        uiController.adjustStemHeights();
        waveformRenderer.resize();
    });
}

function setupWaveformInteractions() {
    // Tooltip, click-to-seek, etc.
    // Could potentially move to waveformRenderer or separate module
}
```

**Result:** main.js reduced from ~1165 lines to ~150-200 lines

---

## Implementation Order

1. **Start with Phase 4** (Notifications) - smallest, easiest, immediate benefit
2. **Then Phase 1** (WaveformRenderer) - well-isolated functionality
3. **Then Phase 5** (Stem button deduplication) - quick win
4. **Then Phase 3** (KeyboardController) - moderately complex
5. **Then Phase 2** (UIController) - most complex, touches many parts
6. **Finally Phase 6** (Refactor main.js) - integrate everything

## Testing Strategy

After each phase:
1. Verify all features still work (playback, mute/solo, seek, shortcuts)
2. Check browser console for errors
3. Test keyboard shortcuts
4. Test waveform interactions
5. Validate notifications appear correctly

## Benefits Summary

**Code Quality:**
- Eliminates ~12 instances of duplicated logic
- Each module has single, clear responsibility
- Easier to understand and maintain

**Maintainability:**
- Changes to UI only affect uiController.js
- Changes to keyboard shortcuts only affect keyboardController.js
- main.js becomes simple coordinator

**Testability:**
- Each module can be tested independently
- Mock dependencies easily
- Clear interfaces for each module

**Future Development:**
- Easy to add zoom (extend WaveformRenderer)
- Easy to add new shortcuts (modify KeyboardController)
- Easy to add notification queue (extend NotificationManager)

## Potential Issues

1. **Import complexity** - More modules = more imports
   - *Mitigation:* Clear naming conventions, good IDE support
   
2. **Circular dependencies** - Modules might need each other
   - *Mitigation:* Use dependency injection, event bus pattern
   
3. **Over-engineering risk** - Too many small modules
   - *Mitigation:* Start with larger modules, split only when needed

## Decision Points

**Should we extract waveform tooltip to waveformRenderer?**
- Pro: Logically related to waveform
- Con: Needs access to manifest for time calculations
- **Recommendation:** Keep in main.js initially, move later if it grows

**Should keyboard actions access audioEngine directly or through main?**
- Option A: Pass references (current approach)
- Option B: Event-based (emit 'action:play', main handles)
- **Recommendation:** Option A for now (simpler), Option B if we add plugins

**Should we use classes or function modules?**
- Classes: More structure, easier to extend
- Functions: Simpler, more functional style
- **Recommendation:** Classes for stateful modules (UI, Renderer), functions for utilities
