/**
 * Main Application Entry Point
 * Coordinates all modules and initializes the application
 */

import { loadManifest } from './dataLoader.js';
import { formatTime } from './utils.js';
import { AudioEngine } from './audioEngine.js';
import { WaveformRenderer } from './waveformRenderer.js';
import { SongMetrics } from './songMetrics.js';
import { UIController } from './uiController.js';
import { KeyboardController } from './keyboardController.js';
import { NotificationManager } from './notifications.js';

// Application state
let manifest = null;
let audioEngine = null;
let waveformRenderer = null;
let songMetrics = null;
let uiController = null;
let keyboardController = null;

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load manifest data
        manifest = await loadManifest();
        console.log('Manifest loaded:', manifest);

        // Create song metrics helper
        songMetrics = new SongMetrics(manifest);

        // Create UI controller
        uiController = new UIController(manifest, songMetrics, () => audioEngine);

        // Create keyboard controller
        keyboardController = new KeyboardController(
            () => audioEngine,
            uiController,
            manifest,
            NotificationManager.show
        );

        // Initialize UI with manifest data
        initializeUI();

        // Setup event listeners
        setupEventListeners();

        // Initialize waveform renderer
        const canvas = document.getElementById('waveform-canvas');
        waveformRenderer = new WaveformRenderer(canvas, manifest, songMetrics);
        waveformRenderer.resize();

        // Initialize audio engine
        await initializeAudio();

    } catch (error) {
        console.error('Failed to initialize application:', error);
        NotificationManager.error('Failed to load song data. Please check the console for details.');
    }
});

/**
 * Initialize UI elements with manifest data
 */
function initializeUI() {
    uiController.initialize();

    // Adjust stem heights after layout is complete
    requestAnimationFrame(() => {
        uiController.adjustStemHeights();
        if (waveformRenderer) {
            waveformRenderer.render();
        }
    });

    // Disable transport controls until audio is loaded
    document.getElementById('play-btn').disabled = true;
    document.getElementById('stop-btn').disabled = true;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Window resize
    window.addEventListener('resize', () => {
        uiController.adjustStemHeights();
        if (waveformRenderer) {
            waveformRenderer.resize();
            waveformRenderer.render();
        }
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
                uiController.updatePlayButtonIcon(false); // Show play icon
            } else {
                // Currently paused or stopped → play
                await audioEngine.play();
                uiController.updatePlayButtonIcon(true); // Show pause icon
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
        uiController.updatePlayButtonIcon(false); // Show play icon
        stopBtn.disabled = true;
        uiController.updatePlayhead(0); // Reset playhead to beginning
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
            uiController.updateStemButtons(stemId, { mute: isMuted, solo: isMuted ? false : undefined });
        } else if (soloBtn) {
            const stemId = soloBtn.dataset.stemId;
            const exclusive = !e.shiftKey; // Exclusive solo unless Shift is pressed
            const isSoloed = audioEngine.toggleSolo(stemId, exclusive);

            // Update button states
            uiController.updateStemButtons(stemId, { solo: isSoloed, mute: isSoloed ? false : undefined });

            // If exclusive solo, clear all other solo buttons
            if (exclusive && isSoloed) {
                uiController.clearAllSoloButtons(stemId);
            }
        }
    });

    // Waveform hover tooltip
    setupWaveformTooltip();

    // Keyboard shortcuts
    keyboardController.enable();
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
        const { bar, beat } = songMetrics.timeToBarBeat(time);

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
        const percentage = (mouseX / rect.width) * 100;
        const time = songMetrics.percentToTime(percentage);

        // Seek to the clicked time
        const wasPlaying = audioEngine.getState().isPlaying;
        await audioEngine.seek(time);

        // Start playing if not already playing
        if (!wasPlaying) {
            await audioEngine.play();
            uiController.updatePlayButtonIcon(true);
            document.getElementById('stop-btn').disabled = false;
        }
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
        uiController.updateTimeDisplay(time);
        uiController.updatePlayhead(time);
        uiController.updateActiveSection(time);
    });

    audioEngine.on('ended', () => {
        console.log('Playback ended');
        // Reset UI to stopped state
        uiController.updatePlayButtonIcon(false); // Show play icon
        document.getElementById('stop-btn').disabled = true;
    });

    audioEngine.on('statechange', (state) => {
        uiController.updatePlayheadVisibility(state);
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
        if (waveformRenderer) {
            waveformRenderer.render();
        }
    });

    // Load audio from manifest
    try {
        console.log('Loading audio from manifest...', manifest);
        await audioEngine.loadFromManifest(manifest);
        console.log('Audio loaded successfully!');
        console.log('Stems:', audioEngine.getStems());
        console.log('Duration:', audioEngine.getDuration());

        // Set audio engine reference in waveform renderer
        if (waveformRenderer) {
            waveformRenderer.setAudioEngine(audioEngine);
        }

        // Enable play button
        document.getElementById('play-btn').disabled = false;
        console.log('Play button enabled');
    } catch (error) {
        console.error('Failed to load audio:', error);
        console.error('Error stack:', error.stack);
        NotificationManager.error('Failed to load audio files. Check console for details.');
        // Re-enable play button even on error so user can try again
        document.getElementById('play-btn').disabled = false;
    }
}

