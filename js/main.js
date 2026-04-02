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

        // Initialize canvas
        initializeCanvas();

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
    const stemsList = document.querySelector('.stems-list');
    stemsList.innerHTML = ''; // Clear existing items

    manifest.stems.forEach(stem => {
        const stemItem = createStemItem(stem);
        stemsList.appendChild(stemItem);
    });
}

/**
 * Create a stem item element
 * @param {Object} stem - Stem data
 * @returns {HTMLElement} Stem item element
 */
function createStemItem(stem) {
    const div = document.createElement('div');
    div.className = 'stem-item';
    div.dataset.stemId = stem.id;

    div.innerHTML = `
        <div class="stem-color" style="background-color: ${stem.color};"></div>
        <span class="stem-name">${stem.name}</span>
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
    // Metadata panel toggle
    const metadataToggle = document.getElementById('metadata-toggle');
    const metadataContent = document.getElementById('metadata-content');

    if (metadataToggle && metadataContent) {
        metadataToggle.addEventListener('click', () => {
            metadataToggle.classList.toggle('expanded');
            metadataContent.classList.toggle('expanded');
        });
    }

    // Window resize
    window.addEventListener('resize', () => {
        initializeCanvas();
    });
}

/**
 * Initialize canvas and draw placeholder waveform
 */
function initializeCanvas() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();

    // Account for section markers (40px height)
    const availableHeight = rect.height - 40;

    canvas.width = rect.width;
    canvas.height = availableHeight;

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
    const stemCount = stemColors.length;

    for (let i = 0; i < barCount; i++) {
        const stemHeight = canvas.height / stemCount;

        stemColors.forEach((color, stemIndex) => {
            const amplitude = Math.random() * 0.8 + 0.2;
            const height = stemHeight * amplitude * 0.5;
            const y = stemIndex * stemHeight + (stemHeight - height) / 2;

            ctx.fillStyle = color;
            ctx.globalAlpha = 0.7;
            ctx.fillRect(i * barWidth, y, barWidth - 1, height);
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
