/**
 * UI Controller
 * Handles all DOM updates and UI state management
 */

import { formatTime } from './utils.js';

const STEM_ITEM_MIN_HEIGHT_PX = 60;
const STEM_ITEM_MAX_HEIGHT_PX = 180;
const TIME_RULER_FALLBACK_WIDTH_PX = 800;
const TIME_RULER_MIN_MARKER_SPACING_PX = 80;
const STEM_GAIN_MIN_DB = -24;
const STEM_GAIN_MAX_DB = 12;
const STEM_GAIN_STEP_DB = 0.1;
const STEM_GAIN_DEFAULT_DB = 0;

export class UIController {
    /**
     * @param {Object} manifest - Song manifest data
     * @param {SongMetrics} songMetrics - Song metrics helper
     * @param {Function} getAudioEngine - Getter returning the current AudioEngine instance
     */
    constructor(manifest, songMetrics, getAudioEngine) {
        this.manifest = manifest;
        this.songMetrics = songMetrics;
        this.getAudioEngine = getAudioEngine;
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Run all initialization steps
     */
    initialize() {
        this.initializeHeader();
        this.initializeStems();
        this.initializeSections();
        this.initializeTimeRuler();
        this.initializeMetadata();
        this.updateTimeDisplay(0);
    }

    // ============================================================================
    // LAYOUT
    // ============================================================================

    /**
     * Adjust stem heights dynamically based on available space
     */
    adjustStemHeights() {
        const sidebar = document.querySelector('.stems-sidebar');
        const stemItems = document.querySelectorAll('.stem-control-item');

        if (!sidebar || stemItems.length === 0) return;

        const availableHeight = sidebar.clientHeight;
        const stemCount = stemItems.length;

        const minTotalHeight = stemCount * STEM_ITEM_MIN_HEIGHT_PX;

        let finalHeight;

        if (minTotalHeight > availableHeight) {
            finalHeight = STEM_ITEM_MIN_HEIGHT_PX;
        } else {
            const idealHeight = availableHeight / stemCount;
            finalHeight = Math.min(STEM_ITEM_MAX_HEIGHT_PX, idealHeight);
        }

        stemItems.forEach(item => {
            item.style.height = `${finalHeight}px`;
        });
    }

    /**
     * Update song header with title, artist, BPM, duration
     */
    initializeHeader() {
        const { song } = this.manifest;

        document.querySelector('.song-title').textContent = song.title;
        document.querySelector('.artist-name').textContent = song.artist;
        document.querySelector('.bpm').textContent = `${song.bpm} BPM`;

        const durationText = song.durationFormatted || formatTime(song.duration);
        document.querySelector('.duration').textContent = durationText;
    }

    /**
     * Update stems list dynamically from manifest
     */
    initializeStems() {
        const stemsSidebar = document.querySelector('.stems-sidebar');
        stemsSidebar.innerHTML = '';

        this.manifest.stems.forEach(stem => {
            const stemItem = this._createStemItem(stem);
            stemsSidebar.appendChild(stemItem);
        });
    }

    /**
     * Update section markers from manifest
     */
    initializeSections() {
        const sectionsContainer = document.querySelector('.section-markers');
        sectionsContainer.innerHTML = '';

        const sectionsWithPos = this.songMetrics.getSectionsWithPositions();

        sectionsWithPos.forEach(section => {
            const marker = this._createSectionMarker(section);
            sectionsContainer.appendChild(marker);
        });
    }

    /**
     * Update time ruler with bar and time markers
     */
    initializeTimeRuler() {
        const rulerContainer = document.getElementById('time-ruler');
        if (!rulerContainer) return;

        rulerContainer.innerHTML = '';

        const rulerWidth = rulerContainer.offsetWidth || TIME_RULER_FALLBACK_WIDTH_PX;
        const markers = this.songMetrics.generateBarMarkers(rulerWidth, TIME_RULER_MIN_MARKER_SPACING_PX);

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
    initializeMetadata() {
        const { song } = this.manifest;

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

    // ============================================================================
    // PLAYBACK STATE UPDATES
    // ============================================================================

    /**
     * Update time display
     * @param {number} currentTime - Current time in seconds
     */
    updateTimeDisplay(currentTime = 0) {
        const { song } = this.manifest;

        document.querySelector('.current-time').textContent = formatTime(currentTime);
        document.querySelector('.total-time').textContent =
            song.durationFormatted || formatTime(song.duration);

        const barNumber = this.songMetrics.timeToBarNumber(currentTime);
        document.querySelector('.current-bar').textContent = `Bar ${barNumber}`;
    }

    /**
     * Update playhead position based on current time
     * @param {number} currentTime - Current time in seconds
     */
    updatePlayhead(currentTime = 0) {
        const playhead = document.getElementById('playhead');
        if (!playhead) return;

        const positionPercent = this.songMetrics.timeToPercent(currentTime);
        playhead.style.left = `${positionPercent}%`;
    }

    /**
     * Update playhead visibility based on playback state
     * @param {Object} state - Playback state from audio engine
     */
    updatePlayheadVisibility(state) {
        const playhead = document.getElementById('playhead');
        if (!playhead) return;

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
    updateActiveSection(currentTime = 0) {
        const currentSection = this.songMetrics.getCurrentSection(currentTime);

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
    updatePlayButtonIcon(isPlaying) {
        const playBtn = document.getElementById('play-btn');
        const svg = playBtn.querySelector('svg');

        if (isPlaying) {
            svg.innerHTML = '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />';
            playBtn.title = 'Pause';
        } else {
            svg.innerHTML = '<path d="M8 5v14l11-7z" />';
            playBtn.title = 'Play';
        }
    }

    // ============================================================================
    // STEM BUTTON HELPERS
    // ============================================================================

    /**
     * Get stem button element
     * @param {string} stemId - Stem identifier
     * @param {string} type - Button type ('mute' or 'solo')
     * @returns {HTMLElement|null} Button element or null if not found
     */
    getStemButton(stemId, type) {
        const className = type === 'mute' ? 'mute-btn' : 'solo-btn';
        return document.querySelector(`.${className}[data-stem-id="${stemId}"]`);
    }

    /**
     * Update a single stem button state
     * @param {string} stemId - Stem identifier
     * @param {string} type - Button type ('mute' or 'solo')
     * @param {boolean} isActive - Whether button should be active
     */
    updateStemButton(stemId, type, isActive) {
        const button = this.getStemButton(stemId, type);
        if (button) {
            button.classList.toggle('active', isActive);
        }
    }

    /**
     * Update stem buttons for a single stem (both mute and solo)
     * @param {string} stemId - Stem identifier
     * @param {Object} states - Button states { mute: boolean, solo: boolean }
     */
    updateStemButtons(stemId, states) {
        if (states.mute !== undefined) {
            this.updateStemButton(stemId, 'mute', states.mute);
        }
        if (states.solo !== undefined) {
            this.updateStemButton(stemId, 'solo', states.solo);
        }
    }

    /**
     * Update all stem buttons (for mute all / unmute all operations)
     * @param {Array} stems - Array of stem objects from audioEngine.getStems()
     * @param {Object} states - Button states to apply to all { mute: boolean, solo: boolean }
     */
    updateAllStemButtons(stems, states) {
        stems.forEach(stem => {
            this.updateStemButtons(stem.id, states);
        });
    }

    /**
     * Update stem gain slider and value display
     * @param {string} stemId - Stem identifier
     * @param {number} volumeDb - Gain in decibels
     */
    updateStemGain(stemId, volumeDb) {
        const slider = document.querySelector(`.stem-gain-knob[data-stem-id="${stemId}"]`);
        const liveLabel = document.querySelector(`.stem-gain-live[data-stem-id="${stemId}"]`);

        if (slider) {
            slider.value = `${volumeDb}`;
        }

        if (liveLabel) {
            liveLabel.textContent = `${Number(volumeDb).toFixed(1)} dB`;
        }
    }

    /**
     * Clear all solo buttons except optionally one
     * @param {string} exceptStemId - Stem ID to exclude from clearing (optional)
     */
    clearAllSoloButtons(exceptStemId = null) {
        document.querySelectorAll('.solo-btn').forEach(btn => {
            if (exceptStemId && btn.dataset.stemId === exceptStemId) {
                return;
            }
            btn.classList.remove('active');
        });
    }

    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================

    /**
     * Create a stem item element for sidebar
     * @param {Object} stem - Stem data
     * @returns {HTMLElement} Stem item element
     */
    _createStemItem(stem) {
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
                <div class="stem-gain" title="Gain">
                    <input
                        class="stem-gain-knob"
                        type="range"
                        min="${STEM_GAIN_MIN_DB}"
                        max="${STEM_GAIN_MAX_DB}"
                        step="${STEM_GAIN_STEP_DB}"
                        value="${STEM_GAIN_DEFAULT_DB}"
                        data-stem-id="${stem.id}"
                    />
                    <span class="stem-gain-live" data-stem-id="${stem.id}">0.0 dB</span>
                </div>
            </div>
        `;

        return div;
    }

    /**
     * Create a section marker element
     * @param {Object} section - Section data with position percentages
     * @returns {HTMLElement} Section marker element
     */
    _createSectionMarker(section) {
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

        div.addEventListener('click', async () => {
            const audioEngine = this.getAudioEngine();
            if (!audioEngine) return;

            const wasPlaying = audioEngine.getState().isPlaying;

            await audioEngine.seek(section.startTime);

            if (!wasPlaying) {
                await audioEngine.play();
            }

            this.updatePlayButtonIcon(true);
            document.getElementById('stop-btn').disabled = false;
        });

        return div;
    }
}
