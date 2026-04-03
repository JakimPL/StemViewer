/**
 * UI Controller Module
 * Handles all DOM updates and UI state management
 */

import { formatTime, calculateSectionPositions } from './utils.js';

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
}

/**
 * Update song header with title, artist, BPM, duration
 */
function updateSongHeader(manifest) {
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
function updateStemsList(manifest) {
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
function updateSectionMarkers(manifest, getAudioEngine, updatePlayButtonIcon) {
    const sectionsContainer = document.querySelector('.section-markers');
    sectionsContainer.innerHTML = ''; // Clear existing markers

    const sectionsWithPos = calculateSectionPositions(manifest.sections, manifest.song.duration);

    sectionsWithPos.forEach(section => {
        const marker = createSectionMarker(section, getAudioEngine, updatePlayButtonIcon);
        sectionsContainer.appendChild(marker);
    });
}

/**
 * Create a section marker element
 * @param {Object} section - Section data with position percentages
 * @returns {HTMLElement} Section marker element
 */
function createSectionMarker(section, getAudioEngine, updatePlayButtonIcon) {
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
        const audioEngine = getAudioEngine(); // Get current audioEngine reference
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
function updateTimeRuler(manifest, songMetrics) {
    const rulerContainer = document.getElementById('time-ruler');
    if (!rulerContainer) return;

    rulerContainer.innerHTML = ''; // Clear existing markers

    // Calculate appropriate bar interval and get markers
    const rulerWidth = rulerContainer.offsetWidth || 800; // Fallback to 800 if not rendered
    const markers = songMetrics.generateBarMarkers(rulerWidth, 80);

    // Draw bar markers
    markers.forEach(({ barNumber, positionPercent }) => {
        const marker = document.createElement('div');
        marker.className = 'time-marker bar-marker';
        marker.style.left = `${positionPercent}%`;

        const label = document.createElement('span');
        label.className = 'time-label';
        label.textContent = `Bar ${barNumber}`;

        marker.appendChild(label);
        rulerContainer.appendChild(marker);
    });
}

/**
 * Update metadata panel with song details
 */
function updateMetadataPanel(manifest) {
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
function updateTimeDisplay(manifest, songMetrics, currentTime = 0) {
    const { song } = manifest;

    document.querySelector('.current-time').textContent = formatTime(currentTime);
    document.querySelector('.total-time').textContent =
        song.durationFormatted || formatTime(song.duration);

    // Calculate bar number using songMetrics
    const barNumber = songMetrics.timeToBarNumber(currentTime);
    document.querySelector('.current-bar').textContent = `Bar ${barNumber}`;
}

/**
 * Update playhead position based on current time
 * @param {number} currentTime - Current time in seconds
 */
function updatePlayhead(songMetrics, currentTime = 0) {
    const playhead = document.getElementById('playhead');
    if (!playhead) return;

    const positionPercent = songMetrics.timeToPercent(currentTime);
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
function updateActiveSection(songMetrics, currentTime = 0) {
    const currentSection = songMetrics.getCurrentSection(currentTime);

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

export {
    adjustStemHeights,
    updateSongHeader,
    updateStemsList,
    updateSectionMarkers,
    updateTimeRuler,
    updateMetadataPanel,
    updateTimeDisplay,
    updatePlayhead,
    updatePlayheadVisibility,
    updateActiveSection,
    updatePlayButtonIcon
};
