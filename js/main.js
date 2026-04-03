/**
 * Main Application Entry Point
 * Coordinates all modules and initializes the application
 */

import { loadManifest, resolveAudioPath } from './dataLoader.js';
import { formatTime, calculateSectionPositions } from './utils.js';
import { AudioEngine } from './audioEngine.js';

// Application state
let manifest = null;
let audioEngine = null;

// Waveform rendering configuration
// Adjust this value to change waveform detail level:
// - Lower values (1-2) = more detail, more bars, denser waveform
// - Higher values (4-8) = less detail, fewer bars, sparser waveform
const WAVEFORM_PIXELS_PER_BAR = 4;

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load manifest data
        manifest = await loadManifest();
        console.log('Manifest loaded:', manifest);

        // Initialize UI with manifest data
        initializeUI();

        // Setup event listeners
        setupEventListeners();

        // Initialize canvas
        initializeCanvas();

        // Initialize audio engine
        await initializeAudio();

    } catch (error) {
        console.error('Failed to initialize application:', error);
        showError('Failed to load song data. Please check the console for details.');
    }
});

/**
 * Initialize UI elements with manifest data
 */
function initializeUI() {
    // Update song header
    updateSongHeader();

    // Update stems list
    updateStemsList();

    // Update section markers
    updateSectionMarkers();

    // Update time ruler
    updateTimeRuler();

    // Update metadata panel
    updateMetadataPanel();

    // Update time display
    updateTimeDisplay(0); // Start at 0:00

    // Adjust stem heights after layout is complete
    requestAnimationFrame(() => {
        adjustStemHeights();
    });

    // Disable transport controls until audio is loaded
    document.getElementById('play-btn').disabled = true;
    document.getElementById('stop-btn').disabled = true;
}

/**
 * Adjust stem heights dynamically based on available space
 */
function adjustStemHeights() {
    const sidebar = document.querySelector('.stems-sidebar');
    const stemItems = document.querySelectorAll('.stem-control-item');

    if (!sidebar || stemItems.length === 0) return;

    const availableHeight = sidebar.clientHeight;
    const stemCount = stemItems.length;

    const MIN_HEIGHT = 60;
    const MAX_HEIGHT = 180;

    // Calculate minimum total height needed
    const minTotalHeight = stemCount * MIN_HEIGHT;

    let finalHeight;

    if (minTotalHeight > availableHeight) {
        // Not enough space - keep stems at minimum and let sidebar scroll
        finalHeight = MIN_HEIGHT;
    } else {
        // Enough space - distribute evenly with max constraint
        const idealHeight = availableHeight / stemCount;
        finalHeight = Math.min(MAX_HEIGHT, idealHeight);
    }

    // Apply height to all stems
    stemItems.forEach(item => {
        item.style.height = `${finalHeight}px`;
    });

    // Redraw canvas after heights are applied
    requestAnimationFrame(() => {
        const canvas = document.getElementById('waveform-canvas');
        if (canvas) {
            drawPlaceholderWaveform(canvas);
        }
    });
}

/**
 * Update song header with title, artist, BPM, duration
 */
function updateSongHeader() {
    const { song } = manifest;

    document.querySelector('.song-title').textContent = song.title;
    document.querySelector('.artist-name').textContent = song.artist;
    document.querySelector('.bpm').textContent = `${song.bpm} BPM`;

    const durationText = song.durationFormatted || formatTime(song.duration);
    document.querySelector('.duration').textContent = durationText;
}

/**
 * Update stems list dynamically from manifest
 */
function updateStemsList() {
    const stemsSidebar = document.querySelector('.stems-sidebar');
    stemsSidebar.innerHTML = ''; // Clear existing items

    manifest.stems.forEach(stem => {
        const stemItem = createStemItem(stem);
        stemsSidebar.appendChild(stemItem);
    });
}

/**
 * Create a stem item element for sidebar
 * @param {Object} stem - Stem data
 * @returns {HTMLElement} Stem item element
 */
function createStemItem(stem) {
    const div = document.createElement('div');
    div.className = 'stem-control-item';
    div.dataset.stemId = stem.id;

    div.innerHTML = `
        <div class="stem-control-header">
            <div class="stem-color" style="background-color: ${stem.color};"></div>
            <span class="stem-name" title="${stem.name}">${stem.name}</span>
        </div>
        <div class="stem-controls">
            <button class="stem-btn solo-btn" data-stem-id="${stem.id}" title="Solo">S</button>
            <button class="stem-btn mute-btn" data-stem-id="${stem.id}" title="Mute">M</button>
        </div>
    `;

    return div;
}

/**
 * Update section markers from manifest
 */
function updateSectionMarkers() {
    const sectionsContainer = document.querySelector('.section-markers');
    sectionsContainer.innerHTML = ''; // Clear existing markers

    const sectionsWithPos = calculateSectionPositions(manifest.sections, manifest.song.duration);

    sectionsWithPos.forEach(section => {
        const marker = createSectionMarker(section);
        sectionsContainer.appendChild(marker);
    });
}

/**
 * Create a section marker element
 * @param {Object} section - Section data with position percentages
 * @returns {HTMLElement} Section marker element
 */
function createSectionMarker(section) {
    const div = document.createElement('div');
    div.className = 'section-marker';
    div.style.left = `${section.leftPercent}%`;
    div.style.width = `${section.widthPercent}%`;
    div.dataset.sectionName = section.name;
    div.dataset.startTime = section.startTime;

    const label = document.createElement('span');
    label.className = 'section-label';
    label.textContent = section.name;

    div.appendChild(label);

    // Add click handler to seek to section and start playing
    div.addEventListener('click', async () => {
        if (!audioEngine) return;

        const wasPlaying = audioEngine.getState().isPlaying;

        await audioEngine.seek(section.startTime);

        // Always start playing (even if was already playing)
        if (!wasPlaying) {
            await audioEngine.play();
        }

        updatePlayButtonIcon(true);
        document.getElementById('stop-btn').disabled = false;
    });

    return div;
}

/**
 * Update time ruler with bar and time markers
 */
function updateTimeRuler() {
    const rulerContainer = document.getElementById('time-ruler');
    if (!rulerContainer) return;

    rulerContainer.innerHTML = ''; // Clear existing markers

    const duration = manifest.song.duration;
    const bpm = manifest.song.bpm;
    const beatsPerBar = manifest.song.timeSignature.split('/')[0];

    // Calculate bar duration (in seconds)
    const beatDuration = 60 / bpm; // Duration of one beat
    const barDuration = beatDuration * beatsPerBar; // Duration of one bar

    // Number of bars in the song
    const totalBars = Math.ceil(duration / barDuration);

    // Calculate appropriate bar interval (power of 2)
    const rulerWidth = rulerContainer.offsetWidth || 800; // Fallback to 800 if not rendered
    const minSpacing = 80; // Minimum pixels between markers
    const maxMarkers = Math.floor(rulerWidth / minSpacing);

    // Find smallest power of 2 that gives us maxMarkers or fewer
    let barInterval = 1;
    while (totalBars / barInterval > maxMarkers && barInterval < totalBars) {
        barInterval *= 2;
    }

    // Draw bar markers at intervals
    for (let bar = 0; bar <= totalBars; bar += barInterval) {
        const timeInSeconds = bar * barDuration;
        if (timeInSeconds > duration) break;

        const positionPercent = (timeInSeconds / duration) * 100;

        const marker = document.createElement('div');
        marker.className = 'time-marker bar-marker';
        marker.style.left = `${positionPercent}%`;

        const label = document.createElement('span');
        label.className = 'time-label';
        label.textContent = `Bar ${bar + 1}`;

        marker.appendChild(label);
        rulerContainer.appendChild(marker);
    }
}

/**
 * Update metadata panel with song details
 */
function updateMetadataPanel() {
    const { song } = manifest;

    const metadataGrid = document.querySelector('.metadata-grid');
    metadataGrid.innerHTML = '';

    const metadata = [
        { label: 'Format', value: `${song.format.toUpperCase()}${song.bitrate ? ', ' + song.bitrate : ''}` },
        { label: 'Sample Rate', value: song.sampleRate ? `${song.sampleRate / 1000} kHz` : 'N/A' },
        { label: 'Time Signature', value: song.timeSignature || 'N/A' },
        { label: 'Key', value: song.key || 'N/A' }
    ];

    metadata.forEach(item => {
        const metadataItem = document.createElement('div');
        metadataItem.className = 'metadata-item';
        metadataItem.innerHTML = `
            <span class="metadata-label">${item.label}</span>
            <span class="metadata-value">${item.value}</span>
        `;
        metadataGrid.appendChild(metadataItem);
    });
}

/**
 * Update time display
 * @param {number} currentTime - Current time in seconds
 */
function updateTimeDisplay(currentTime = 0) {
    const { song } = manifest;

    document.querySelector('.current-time').textContent = formatTime(currentTime);
    document.querySelector('.total-time').textContent =
        song.durationFormatted || formatTime(song.duration);

    // Calculate bar number (simplified, will be more accurate with bpm later)
    const barNumber = Math.floor(currentTime / (60 / song.bpm * 4)) + 1;
    document.querySelector('.current-bar').textContent = `Bar ${barNumber}`;
}

/**
 * Update playhead position based on current time
 * @param {number} currentTime - Current time in seconds
 */
function updatePlayhead(currentTime = 0) {
    const playhead = document.getElementById('playhead');
    if (!playhead) return;

    const duration = manifest.song.duration;
    const positionPercent = (currentTime / duration) * 100;

    playhead.style.left = `${positionPercent}%`;
}

/**
 * Update playhead visibility based on playback state
 * @param {Object} state - Playback state from audio engine
 */
function updatePlayheadVisibility(state) {
    const playhead = document.getElementById('playhead');
    if (!playhead) return;

    // Show playhead when playing or paused, hide when stopped
    if (state.isPlaying || state.isPaused) {
        playhead.classList.add('visible');
    } else {
        playhead.classList.remove('visible');
    }
}

/**
 * Update active section highlighting based on current time
 * @param {number} currentTime - Current time in seconds
 */
function updateActiveSection(currentTime = 0) {
    const sections = manifest.sections;

    // Find which section we're currently in
    const currentSection = sections.find(section =>
        currentTime >= section.startTime && currentTime < section.endTime
    );

    // Update visual state of all section markers
    document.querySelectorAll('.section-marker').forEach(marker => {
        const sectionName = marker.dataset.sectionName;
        if (currentSection && sectionName === currentSection.name) {
            marker.classList.add('active');
        } else {
            marker.classList.remove('active');
        }
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Window resize
    window.addEventListener('resize', () => {
        adjustStemHeights();
        initializeCanvas();
    });

    // Transport controls
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');

    // Play/Pause toggle button
    playBtn.addEventListener('click', async () => {
        if (!audioEngine) return;

        try {
            const state = audioEngine.getState();

            if (state.isPlaying) {
                // Currently playing → pause
                audioEngine.pause();
                updatePlayButtonIcon(false); // Show play icon
            } else {
                // Currently paused or stopped → play
                await audioEngine.play();
                updatePlayButtonIcon(true); // Show pause icon
                stopBtn.disabled = false;
            }
        } catch (error) {
            console.error('Play/Pause failed:', error);
            showError('Failed to play audio: ' + error.message);
        }
    });

    stopBtn.addEventListener('click', () => {
        if (!audioEngine) return;

        audioEngine.stop();
        updatePlayButtonIcon(false); // Show play icon
        stopBtn.disabled = true;
        updatePlayhead(0); // Reset playhead to beginning
    });

    // Stem controls (using event delegation since they're dynamically created)
    const stemsSidebar = document.querySelector('.stems-sidebar');

    stemsSidebar.addEventListener('click', (e) => {
        if (!audioEngine) return;

        const muteBtn = e.target.closest('.mute-btn');
        const soloBtn = e.target.closest('.solo-btn');

        if (muteBtn) {
            const stemId = muteBtn.dataset.stemId;
            const isMuted = audioEngine.toggleMute(stemId);
            muteBtn.classList.toggle('active', isMuted);

            // If muted, also clear solo button visual state
            if (isMuted) {
                const soloBtn = muteBtn.parentElement.querySelector('.solo-btn');
                if (soloBtn) {
                    soloBtn.classList.remove('active');
                }
            }
        } else if (soloBtn) {
            const stemId = soloBtn.dataset.stemId;
            const exclusive = !e.shiftKey; // Exclusive solo unless Shift is pressed
            const isSoloed = audioEngine.toggleSolo(stemId, exclusive);

            // Update button state
            soloBtn.classList.toggle('active', isSoloed);

            // If soloed, also clear mute button visual state
            if (isSoloed) {
                const muteBtn = soloBtn.parentElement.querySelector('.mute-btn');
                if (muteBtn) {
                    muteBtn.classList.remove('active');
                }
            }

            // If exclusive solo, update all other solo buttons
            if (exclusive && isSoloed) {
                document.querySelectorAll('.solo-btn').forEach(btn => {
                    if (btn.dataset.stemId !== stemId) {
                        btn.classList.remove('active');
                    }
                });
            }
        }
    });

    // Waveform hover tooltip
    setupWaveformTooltip();

    // Keyboard shortcuts
    setupKeyboardShortcuts();
}

// ============================================================================
// KEYBOARD SHORTCUT ACTIONS
// ============================================================================

/**
 * Toggle play/pause
 */
function actionTogglePlayPause() {
    if (!audioEngine) return;

    const state = audioEngine.getState();
    if (state.isPlaying) {
        audioEngine.pause();
        updatePlayButtonIcon(false);
    } else {
        audioEngine.play();
        updatePlayButtonIcon(true);
        document.getElementById('stop-btn').disabled = false;
    }
}

/**
 * Stop playback
 */
function actionStop() {
    if (!audioEngine) return;

    audioEngine.stop();
    updatePlayButtonIcon(false);
    document.getElementById('stop-btn').disabled = true;
    updatePlayhead(0);
}

/**
 * Seek backward by specified seconds
 * @param {number} seconds - Number of seconds to seek backward
 */
function actionSeekBackward(seconds = 5) {
    if (!audioEngine) return;

    const currentTime = audioEngine.getCurrentTime();
    const newTime = Math.max(0, currentTime - seconds);
    audioEngine.seek(newTime);
}

/**
 * Seek forward by specified seconds
 * @param {number} seconds - Number of seconds to seek forward
 */
function actionSeekForward(seconds = 5) {
    if (!audioEngine) return;

    const currentTime = audioEngine.getCurrentTime();
    const duration = audioEngine.getDuration();
    const newTime = Math.min(duration, currentTime + seconds);
    audioEngine.seek(newTime);
}

/**
 * Toggle mute for a specific stem by index (0-based)
 * @param {number} stemIndex - Zero-based stem index
 */
function actionToggleStemMute(stemIndex) {
    if (!audioEngine) return;

    const stems = audioEngine.getStems();
    if (stemIndex >= stems.length) return;

    const stem = stems[stemIndex];
    const isMuted = audioEngine.toggleMute(stem.id);

    // Update UI
    const muteBtn = document.querySelector(`.mute-btn[data-stem-id="${stem.id}"]`);
    const soloBtn = document.querySelector(`.solo-btn[data-stem-id="${stem.id}"]`);

    if (muteBtn) {
        muteBtn.classList.toggle('active', isMuted);
    }
    if (soloBtn && isMuted) {
        soloBtn.classList.remove('active');
    }
}

/**
 * Toggle solo for a specific stem by index (0-based), exclusive mode
 * @param {number} stemIndex - Zero-based stem index
 */
function actionToggleStemSolo(stemIndex) {
    if (!audioEngine) return;

    const stems = audioEngine.getStems();
    if (stemIndex >= stems.length) return;

    const stem = stems[stemIndex];
    const isSoloed = audioEngine.toggleSolo(stem.id, true); // Exclusive

    // Update UI
    const soloBtn = document.querySelector(`.solo-btn[data-stem-id="${stem.id}"]`);
    const muteBtn = document.querySelector(`.mute-btn[data-stem-id="${stem.id}"]`);

    if (soloBtn) {
        soloBtn.classList.toggle('active', isSoloed);
    }
    if (muteBtn && isSoloed) {
        muteBtn.classList.remove('active');
    }

    // Clear all other solo buttons if soloed
    if (isSoloed) {
        document.querySelectorAll('.solo-btn').forEach(btn => {
            if (btn.dataset.stemId !== stem.id) {
                btn.classList.remove('active');
            }
        });
    }
}

/**
 * Mute all stems
 */
function actionMuteAll() {
    if (!audioEngine) return;

    const stems = audioEngine.getStems();
    stems.forEach((stem, index) => {
        audioEngine.setMute(stem.id, true);
        const muteBtn = document.querySelector(`.mute-btn[data-stem-id="${stem.id}"]`);
        if (muteBtn) {
            muteBtn.classList.add('active');
        }
    });

    showNotification('All tracks muted. Press U to unmute all.');
}

/**
 * Unmute all stems
 */
function actionUnmuteAll() {
    if (!audioEngine) return;

    const stems = audioEngine.getStems();
    stems.forEach((stem, index) => {
        audioEngine.setMute(stem.id, false);
        audioEngine.setSolo(stem.id, false);
        const muteBtn = document.querySelector(`.mute-btn[data-stem-id="${stem.id}"]`);
        const soloBtn = document.querySelector(`.solo-btn[data-stem-id="${stem.id}"]`);
        if (muteBtn) {
            muteBtn.classList.remove('active');
        }
        if (soloBtn) {
            soloBtn.classList.remove('active');
        }
    });

    showNotification('All tracks unmuted. Press M to mute all.');
}

/**
 * Jump to next section
 */
function actionNextSection() {
    if (!audioEngine || !manifest) return;

    const currentTime = audioEngine.getCurrentTime();
    const sections = manifest.sections;

    // Find next section after current time
    const nextSection = sections.find(section => section.startTime > currentTime);

    if (nextSection) {
        const wasPlaying = audioEngine.getState().isPlaying;
        audioEngine.seek(nextSection.startTime);

        if (!wasPlaying) {
            audioEngine.play();
            updatePlayButtonIcon(true);
            document.getElementById('stop-btn').disabled = false;
        }
    }
}

/**
 * Jump to previous section
 */
function actionPreviousSection() {
    if (!audioEngine || !manifest) return;

    const currentTime = audioEngine.getCurrentTime();
    const sections = manifest.sections;

    // Find previous section before current time
    // If we're near the start of current section (within 2 seconds), go to previous
    const threshold = 2.0;
    let targetSection = null;

    for (let i = sections.length - 1; i >= 0; i--) {
        if (sections[i].startTime < currentTime - threshold) {
            targetSection = sections[i];
            break;
        }
    }

    if (targetSection) {
        const wasPlaying = audioEngine.getState().isPlaying;
        audioEngine.seek(targetSection.startTime);

        if (!wasPlaying) {
            audioEngine.play();
            updatePlayButtonIcon(true);
            document.getElementById('stop-btn').disabled = false;
        }
    }
}

/**
 * Jump to beginning (time 0)
 */
function actionJumpToStart() {
    if (!audioEngine) return;

    audioEngine.seek(0);
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    // Key binding map: key -> action function
    const keyMap = {
        ' ': actionTogglePlayPause,
        'Escape': actionStop,
        'ArrowLeft': () => actionSeekBackward(5),
        'ArrowRight': () => actionSeekForward(5),
        '1': () => actionToggleStemMute(0),
        '2': () => actionToggleStemMute(1),
        '3': () => actionToggleStemMute(2),
        '4': () => actionToggleStemMute(3),
        '5': () => actionToggleStemMute(4),
        '6': () => actionToggleStemMute(5),
        '7': () => actionToggleStemMute(6),
        '8': () => actionToggleStemMute(7),
        '9': () => actionToggleStemMute(8),
        'm': actionMuteAll,
        'M': actionMuteAll,
        'u': actionUnmuteAll,
        'U': actionUnmuteAll,
        'Tab': actionNextSection,
        'Home': actionJumpToStart
    };

    // Shift + number keys for solo
    const shiftKeyMap = {
        '1': () => actionToggleStemSolo(0),
        '2': () => actionToggleStemSolo(1),
        '3': () => actionToggleStemSolo(2),
        '4': () => actionToggleStemSolo(3),
        '5': () => actionToggleStemSolo(4),
        '6': () => actionToggleStemSolo(5),
        '7': () => actionToggleStemSolo(6),
        '8': () => actionToggleStemSolo(7),
        '9': () => actionToggleStemSolo(8),
        'Tab': actionPreviousSection
    };

    // Global keydown listener
    document.addEventListener('keydown', (e) => {
        // Ignore if user is typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        const key = e.key;

        // Handle Shift + key combinations
        if (e.shiftKey && shiftKeyMap[key]) {
            e.preventDefault();
            shiftKeyMap[key]();
            return;
        }

        // Handle regular key presses
        if (keyMap[key]) {
            e.preventDefault();
            keyMap[key]();
        }
    });
}

/**
 * Update play button icon based on playback state
 * @param {boolean} isPlaying - True to show pause icon, false to show play icon
 */
function updatePlayButtonIcon(isPlaying) {
    const playBtn = document.getElementById('play-btn');
    const svg = playBtn.querySelector('svg');

    if (isPlaying) {
        // Show pause icon (two vertical bars)
        svg.innerHTML = '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />';
        playBtn.title = 'Pause';
    } else {
        // Show play icon (triangle)
        svg.innerHTML = '<path d="M8 5v14l11-7z" />';
        playBtn.title = 'Play';
    }
}

/**
 * Setup waveform hover tooltip
 */
function setupWaveformTooltip() {
    const canvas = document.getElementById('waveform-canvas');
    const tooltip = document.getElementById('waveform-tooltip');
    const hoverLine = document.getElementById('hover-line');

    if (!canvas || !tooltip || !hoverLine) return;

    const TOOLTIP_OFFSET_Y = -60; // Position above cursor

    // Show tooltip and hover line on mouse enter
    canvas.addEventListener('mouseenter', () => {
        tooltip.classList.add('visible');
        hoverLine.classList.add('visible');
    });

    // Hide tooltip and hover line on mouse leave
    canvas.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
        hoverLine.classList.remove('visible');
    });

    // Update tooltip position and content on mouse move
    canvas.addEventListener('mousemove', (e) => {
        if (!manifest) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate time from mouse X position
        const percentage = mouseX / rect.width;
        const time = percentage * manifest.song.duration;

        // Calculate bar and beat from time
        const { bar, beat } = calculateBarBeat(time, manifest.song.bpm, manifest.song.timeSignature);

        // Update tooltip content
        tooltip.querySelector('.tooltip-time').textContent = formatTime(time);
        tooltip.querySelector('.tooltip-bar').textContent = `Bar ${bar}.${beat}`;

        // Position tooltip near cursor
        let tooltipX = mouseX;
        let tooltipY = mouseY + TOOLTIP_OFFSET_Y;

        // Keep tooltip within canvas bounds
        const tooltipRect = tooltip.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width;
        const tooltipHeight = tooltipRect.height;

        // Horizontal bounds
        if (tooltipX + tooltipWidth > rect.width) {
            tooltipX = rect.width - tooltipWidth;
        }
        if (tooltipX < 0) {
            tooltipX = 0;
        }

        // Vertical bounds - flip to below cursor if too close to top
        if (tooltipY < 0) {
            tooltipY = mouseY + 20; // Position below cursor instead
        }

        tooltip.style.left = `${tooltipX}px`;
        tooltip.style.top = `${tooltipY}px`;

        // Position hover line at mouse X
        hoverLine.style.left = `${mouseX}px`;
    });

    // Click to seek
    canvas.addEventListener('click', async (e) => {
        if (!manifest || !audioEngine) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;

        // Calculate time from mouse X position
        const percentage = mouseX / rect.width;
        const time = percentage * manifest.song.duration;

        // Seek to the clicked time
        const wasPlaying = audioEngine.getState().isPlaying;
        await audioEngine.seek(time);

        // Start playing if not already playing
        if (!wasPlaying) {
            await audioEngine.play();
            updatePlayButtonIcon(true);
            document.getElementById('stop-btn').disabled = false;
        }
    });
}

/**
 * Calculate bar and beat from time
 * @param {number} time - Time in seconds
 * @param {number} bpm - Beats per minute
 * @param {string} timeSignature - Time signature (e.g., "4/4")
 * @returns {Object} { bar, beat } - 1-indexed bar and beat numbers
 */
function calculateBarBeat(time, bpm, timeSignature) {
    const [beatsPerBar] = timeSignature.split('/').map(Number);

    // Calculate total beats elapsed
    const secondsPerBeat = 60 / bpm;
    const totalBeats = time / secondsPerBeat;

    // Calculate bar (1-indexed) and beat within bar (1-indexed)
    const bar = Math.floor(totalBeats / beatsPerBar) + 1;
    const beat = Math.floor(totalBeats % beatsPerBar) + 1;

    return { bar, beat };
}

/**
 * Initialize canvas and draw placeholder waveform
 */
function initializeCanvas() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;

    const waveformContent = canvas.parentElement;
    const rect = waveformContent.getBoundingClientRect();

    // Get sidebar width
    const sidebar = document.querySelector('.stems-sidebar');
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 0;

    // Calculate available space for canvas
    canvas.width = rect.width - sidebarWidth;
    canvas.height = rect.height;

    // Draw placeholder waveform using stem colors from manifest
    drawPlaceholderWaveform(canvas);
}

/**
 * Draw waveform on canvas (uses real audio data if available)
 * @param {HTMLCanvasElement} canvas - Canvas element
 */
function drawPlaceholderWaveform(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!manifest) return;

    // Calculate bar count based on canvas width and granularity
    const barCount = Math.floor(canvas.width / WAVEFORM_PIXELS_PER_BAR);
    const barWidth = canvas.width / barCount;
    const stemColors = manifest.stems.map(s => s.color);

    // Get actual heights from DOM
    const stemItems = document.querySelectorAll('.stem-control-item');
    const stemHeights = Array.from(stemItems).map(item => item.offsetHeight);

    // Check if audio is decoded and we can use real waveform data
    const useRealData = audioEngine && audioEngine.isAudioReady;
    const stemBuffers = useRealData ? getAudioBuffers() : null;

    for (let i = 0; i < barCount; i++) {
        let currentY = 0;

        stemColors.forEach((color, stemIndex) => {
            const stemHeight = stemHeights[stemIndex] || 0;

            // Get amplitude - use real data if available, otherwise show placeholder
            let amplitude;
            if (stemBuffers && stemBuffers[stemIndex]) {
                amplitude = getAmplitudeAtPosition(stemBuffers[stemIndex], i / barCount);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.7;
            } else {
                // Placeholder: flat gray bars at 30% height
                amplitude = 0.3;
                ctx.fillStyle = '#444';
                ctx.globalAlpha = 0.3;
            }

            const height = stemHeight * amplitude * 0.5;
            const y = currentY + (stemHeight - height) / 2;

            ctx.fillRect(i * barWidth, y, barWidth - 1, height);

            currentY += stemHeight;
        });
    }

    ctx.globalAlpha = 1;

    // If no real data, show instruction text
    if (!stemBuffers) {
        ctx.fillStyle = '#666';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Click Play or click anywhere on the timeline to load waveforms', canvas.width / 2, canvas.height / 2);
    }

    // Draw section dividers based on manifest sections
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;

    const sectionsWithPos = calculateSectionPositions(manifest.sections, manifest.song.duration);
    sectionsWithPos.forEach(section => {
        const x = (section.leftPercent / 100) * canvas.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    });
}

/**
 * Get audio buffers from audio engine
 * @returns {Array<AudioBuffer>} Array of audio buffers for each stem
 */
function getAudioBuffers() {
    if (!audioEngine) return null;

    const buffers = [];
    audioEngine.stems.forEach(stem => {
        if (stem.buffer) {
            buffers.push(stem.buffer);
        }
    });

    return buffers.length > 0 ? buffers : null;
}

/**
 * Calculate amplitude at a specific position in the audio buffer
 * @param {AudioBuffer} buffer - Audio buffer
 * @param {number} position - Position (0-1) in the buffer
 * @returns {number} Amplitude (0-1)
 */
function getAmplitudeAtPosition(buffer, position) {
    const channelData = buffer.getChannelData(0); // Use first channel (mono or left)
    const sampleCount = channelData.length;

    // Calculate which samples to analyze for this position
    // We want to downsample the buffer to match our bar count
    const canvas = document.getElementById('waveform-canvas');
    const barCount = Math.floor(canvas.width / WAVEFORM_PIXELS_PER_BAR);
    const samplesPerBar = Math.floor(sampleCount / barCount);
    const startSample = Math.floor(position * sampleCount);
    const endSample = Math.min(startSample + samplesPerBar, sampleCount);

    // Calculate RMS (root mean square) amplitude for this window
    let sum = 0;
    let count = 0;
    for (let i = startSample; i < endSample; i++) {
        const sample = channelData[i];
        sum += sample * sample;
        count++;
    }

    if (count === 0) return 0;

    const rms = Math.sqrt(sum / count);

    // Normalize and apply scaling for better visibility
    // RMS values are typically 0-0.3 for normal audio, so we scale up
    const normalized = Math.min(rms * 3.5, 1.0);

    return normalized;
}

/**
 * Initialize audio engine and load audio files
 */
async function initializeAudio() {
    console.log('Initializing audio engine...');

    // Create audio engine instance
    audioEngine = new AudioEngine();

    // Set up event listeners
    audioEngine.on('loadprogress', (data) => {
        console.log('Audio load progress:', data);
    });

    audioEngine.on('timeupdate', (time) => {
        updateTimeDisplay(time);
        updatePlayhead(time);
        updateActiveSection(time);
    });

    audioEngine.on('ended', () => {
        console.log('Playback ended');
        // Reset UI to stopped state
        updatePlayButtonIcon(false); // Show play icon
        document.getElementById('stop-btn').disabled = true;
    });

    audioEngine.on('statechange', (state) => {
        updatePlayheadVisibility(state);
    });

    // Handle decode start/end for visual feedback
    audioEngine.on('decodestart', () => {
        const playBtn = document.getElementById('play-btn');
        const canvas = document.getElementById('waveform-canvas');
        const wrapper = canvas?.parentElement;

        playBtn?.classList.add('decoding');
        wrapper?.classList.add('decoding');
    });

    audioEngine.on('decodeend', () => {
        const playBtn = document.getElementById('play-btn');
        const canvas = document.getElementById('waveform-canvas');
        const wrapper = canvas?.parentElement;

        playBtn?.classList.remove('decoding');
        wrapper?.classList.remove('decoding');

        // Redraw waveform with real audio data
        if (canvas) {
            drawPlaceholderWaveform(canvas);
        }
    });

    // Load audio from manifest
    try {
        console.log('Loading audio from manifest...', manifest);
        await audioEngine.loadFromManifest(manifest);
        console.log('Audio loaded successfully!');
        console.log('Stems:', audioEngine.getStems());
        console.log('Duration:', audioEngine.getDuration());

        // Enable play button
        document.getElementById('play-btn').disabled = false;
        console.log('Play button enabled');
    } catch (error) {
        console.error('Failed to load audio:', error);
        console.error('Error stack:', error.stack);
        showError('Failed to load audio files. Check console for details.');
        // Re-enable play button even on error so user can try again
        document.getElementById('play-btn').disabled = false;
    }
}

/**
 * Show error message to user
 * @param {string} message - Error message
 */
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-overlay';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
}

/**
 * Show temporary notification message to user
 * @param {string} message - Notification message
 * @param {number} duration - Duration in milliseconds (default 3000)
 */
function showNotification(message, duration = 3000) {
    // Remove any existing notification first
    const existingNotification = document.querySelector('.notification-overlay');
    if (existingNotification) {
        document.body.removeChild(existingNotification);
    }

    const notificationDiv = document.createElement('div');
    notificationDiv.className = 'notification-overlay';
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);

    // Fade out and remove after duration
    setTimeout(() => {
        notificationDiv.style.opacity = '0';
        setTimeout(() => {
            if (notificationDiv.parentNode) {
                document.body.removeChild(notificationDiv);
            }
        }, 300); // Wait for fade transition to complete
    }, duration);
}
