/**
 * Main Application Entry Point
 * Coordinates all modules and initializes the application
 */

import { loadManifest, resolveAudioPath } from './dataLoader.js';
import { formatTime, calculateSectionPositions } from './utils.js';

// Application state
let manifest = null;

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

    // Update metadata panel
    updateMetadataPanel();

    // Update time display
    updateTimeDisplay(0); // Start at 0:00

    // Adjust stem heights after layout is complete
    requestAnimationFrame(() => {
        adjustStemHeights();
    });
}

/**
 * Adjust stem heights dynamically based on available space
 */
function adjustStemHeights() {
    const waveformContent = document.querySelector('.waveform-content');
    const stemItems = document.querySelectorAll('.stem-control-item');

    if (!waveformContent || stemItems.length === 0) return;

    const availableHeight = waveformContent.clientHeight;
    const stemCount = stemItems.length;

    const MIN_HEIGHT = 60;
    const MAX_HEIGHT = 180;

    // Calculate minimum total height needed
    const minTotalHeight = stemCount * MIN_HEIGHT;

    let finalHeight;

    if (minTotalHeight > availableHeight) {
        // Not enough space - keep stems at minimum, content will scroll
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

    // Update canvas to match total stem heights
    requestAnimationFrame(() => {
        initializeCanvas();
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
 * Setup event listeners
 */
function setupEventListeners() {
    // Window resize
    window.addEventListener('resize', () => {
        adjustStemHeights();
        initializeCanvas();
    });
}

/**
 * Initialize canvas and draw placeholder waveform
 */
function initializeCanvas() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;

    const waveformContent = canvas.parentElement;
    const rect = waveformContent.getBoundingClientRect();

    // Get sidebar width and total stem heights
    const sidebar = document.querySelector('.stems-sidebar');
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 0;

    // Calculate total height from all stems
    const stemItems = document.querySelectorAll('.stem-control-item');
    const totalStemHeight = Array.from(stemItems).reduce((sum, item) => sum + item.offsetHeight, 0);

    // Calculate available space for canvas
    canvas.width = rect.width - sidebarWidth;
    canvas.height = totalStemHeight || rect.height; // Use total stem height, fallback to container height

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

    // Draw playhead at start
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, canvas.height);
    ctx.stroke();
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
