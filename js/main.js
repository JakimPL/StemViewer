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

    const label = document.createElement('span');
    label.className = 'section-label';
    label.textContent = section.name;

    div.appendChild(label);
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
 * Draw placeholder waveform on canvas
 * @param {HTMLCanvasElement} canvas - Canvas element
 */
function drawPlaceholderWaveform(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!manifest) return;

    const barCount = 200;
    const barWidth = canvas.width / barCount;
    const stemColors = manifest.stems.map(s => s.color);

    // Get actual heights from DOM
    const stemItems = document.querySelectorAll('.stem-control-item');
    const stemHeights = Array.from(stemItems).map(item => item.offsetHeight);

    for (let i = 0; i < barCount; i++) {
        let currentY = 0;

        stemColors.forEach((color, stemIndex) => {
            const stemHeight = stemHeights[stemIndex] || 0;
            const amplitude = Math.random() * 0.8 + 0.2;
            const height = stemHeight * amplitude * 0.5;
            const y = currentY + (stemHeight - height) / 2;

            ctx.fillStyle = color;
            ctx.globalAlpha = 0.7;
            ctx.fillRect(i * barWidth, y, barWidth - 1, height);

            currentY += stemHeight;
        });
    }

    ctx.globalAlpha = 1;

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
    // Create error overlay (simple implementation)
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #ff6b6b;
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 1000;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
}
