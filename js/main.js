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

const TOOLTIP_OFFSET_Y = -60;
const WAVEFORM_TEXT_LOADING = 'Loading audio files...';
const WAVEFORM_TEXT_DECODING = 'Decoding audio...';
const WAVEFORM_TEXT_READY_HINT = 'Click Play or click anywhere on the timeline to load waveforms';

let manifest = null;
let audioEngine = null;
let waveformRenderer = null;
let songMetrics = null;
let uiController = null;
let keyboardController = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        manifest = await loadManifest();
        console.log('Manifest loaded:', manifest);

        songMetrics = new SongMetrics(manifest);

        uiController = new UIController(manifest, songMetrics, () => audioEngine);

        keyboardController = new KeyboardController(
            () => audioEngine,
            uiController,
            manifest,
            NotificationManager.show
        );

        initializeUI();

        setupUIEventListeners();

        const canvas = document.getElementById('waveform-canvas');
        waveformRenderer = new WaveformRenderer(canvas, manifest, songMetrics);
        waveformRenderer.resize();

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

    requestAnimationFrame(() => {
        uiController.adjustStemHeights();
        if (waveformRenderer) {
            waveformRenderer.render();
        }
    });

    document.getElementById('play-btn').disabled = true;
    document.getElementById('stop-btn').disabled = true;
}

/**
 * Setup UI event listeners
 */
function setupUIEventListeners() {
    setupWindowResizeListener();
    setupTransportControls();
    setupStemControls();
    setupWaveformInteractions();
    setupKeyboardControls();
}

/**
 * Setup window resize listener
 */
function setupWindowResizeListener() {
    window.addEventListener('resize', () => {
        uiController.adjustStemHeights();
        if (waveformRenderer) {
            waveformRenderer.resize();
            waveformRenderer.render();
        }
    });
}

/**
 * Setup transport controls
 */
function setupTransportControls() {
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');

    playBtn.addEventListener('click', async () => {
        await handlePlayPauseClick(stopBtn);
    });

    stopBtn.addEventListener('click', () => {
        if (!audioEngine) return;

        audioEngine.stop();
        uiController.updatePlayButtonIcon(false);
        stopBtn.disabled = true;
        uiController.updatePlayhead(0);
    });
}

/**
 * Toggle playback and keep transport UI in sync with engine state.
 */
async function handlePlayPauseClick(stopBtn) {
    if (!audioEngine) return;

    try {
        const { isPlaying } = audioEngine.getState();

        if (isPlaying) {
            audioEngine.pause();
            uiController.updatePlayButtonIcon(false);
            return;
        }

        await audioEngine.play();
        uiController.updatePlayButtonIcon(true);
        stopBtn.disabled = false;
    } catch (error) {
        console.error('Play/Pause failed:', error);
        NotificationManager.error('Failed to play audio: ' + error.message);
    }
}

/**
 * Setup stem controls (using event delegation since they're dynamically created)
 */
function setupStemControls() {
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
            const exclusive = !e.shiftKey;
            const isSoloed = audioEngine.toggleSolo(stemId, exclusive);

            uiController.updateStemButtons(stemId, { solo: isSoloed, mute: isSoloed ? false : undefined });

            if (exclusive && isSoloed) {
                uiController.clearAllSoloButtons(stemId);
            }
        }
    });

    stemsSidebar.addEventListener('input', (e) => {
        if (!audioEngine) return;

        const gainKnob = e.target.closest('.stem-gain-knob');
        if (!gainKnob) return;

        const stemId = gainKnob.dataset.stemId;
        const volumeDb = parseFloat(gainKnob.value);

        audioEngine.setVolumeDb(stemId, volumeDb);
        uiController.updateStemGain(stemId, volumeDb);
    });
}

/**
 * Setup waveform interactions
 */
function setupWaveformInteractions() {
    setupWaveformTooltip();
}

/**
 * Setup keyboard controls
 */
function setupKeyboardControls() {
    keyboardController.enable();
}

/**
 * Setup audio engine event listeners
 */
function setupAudioEventListeners() {
    if (!audioEngine) return;

    audioEngine.on('loadprogress', (data) => {
        console.log('Audio load progress:', data);
        updateLoadingUiState('loading', getLoadProgressMessage(data));
    });

    audioEngine.on('timeupdate', (time) => {
        uiController.updateTimeDisplay(time);
        uiController.updatePlayhead(time);
        uiController.updateActiveSection(time);
    });

    audioEngine.on('ended', () => {
        console.log('Playback ended');
        uiController.updatePlayButtonIcon(false);
        document.getElementById('stop-btn').disabled = true;
    });

    audioEngine.on('statechange', (state) => {
        uiController.updatePlayheadVisibility(state);
        if (waveformRenderer) {
            waveformRenderer.render();
        }
    });

    audioEngine.on('decodestart', () => {
        updateLoadingUiState('decoding', WAVEFORM_TEXT_DECODING);
    });

    audioEngine.on('decodeend', () => {
        updateLoadingUiState('idle', WAVEFORM_TEXT_READY_HINT);
        if (waveformRenderer) {
            waveformRenderer.render();
        }
    });
}

function updateLoadingUiState(state, waveformText) {
    const playBtn = document.getElementById('play-btn');
    const wrapper = document.querySelector('.waveform-canvas-wrapper');

    if (playBtn) {
        playBtn.classList.toggle('loading', state === 'loading');
        playBtn.classList.toggle('decoding', state === 'decoding');
    }

    if (wrapper) {
        wrapper.classList.toggle('loading', state === 'loading');
        wrapper.classList.toggle('decoding', state === 'decoding');
    }

    waveformRenderer?.setOverlayText(waveformText);
}

function getLoadProgressMessage(data) {
    if (data?.type === 'mix') {
        return 'Loading audio files...';
    }

    if (Number.isFinite(data?.loaded) && Number.isFinite(data?.total) && data.total > 0) {
        return `Loading audio files... (${data.loaded}/${data.total})`;
    }

    return WAVEFORM_TEXT_LOADING;
}

/**
 * Setup waveform hover tooltip
 */
function setupWaveformTooltip() {
    const canvas = document.getElementById('waveform-canvas');
    const tooltip = document.getElementById('waveform-tooltip');
    const hoverLine = document.getElementById('hover-line');

    if (!canvas || !tooltip || !hoverLine) return;

    canvas.addEventListener('mouseenter', () => {
        tooltip.classList.add('visible');
        hoverLine.classList.add('visible');
    });

    canvas.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
        hoverLine.classList.remove('visible');
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!manifest) return;

        const rect = canvas.getBoundingClientRect();
        const { mouseX, mouseY } = getCanvasMousePosition(e, rect);
        const time = getTimeFromCanvasX(mouseX, rect.width, manifest.song.duration);

        const { bar, beat } = songMetrics.timeToBarBeat(time);

        updateWaveformTooltipContent(tooltip, time, bar, beat);
        positionTooltip(tooltip, rect, mouseX, mouseY, TOOLTIP_OFFSET_Y);
        hoverLine.style.left = `${mouseX}px`;
    });

    canvas.addEventListener('click', async (e) => {
        if (!manifest || !audioEngine) return;

        const rect = canvas.getBoundingClientRect();
        const { mouseX } = getCanvasMousePosition(e, rect);
        await seekFromCanvasClick(mouseX, rect.width);
    });
}

/**
 * Convert a browser mouse event into canvas-local coordinates.
 */
function getCanvasMousePosition(event, canvasRect) {
    return {
        mouseX: event.clientX - canvasRect.left,
        mouseY: event.clientY - canvasRect.top
    };
}

/**
 * Map horizontal canvas position to timeline seconds.
 */
function getTimeFromCanvasX(mouseX, canvasWidth, songDuration) {
    return (mouseX / canvasWidth) * songDuration;
}

/**
 * Update tooltip text for the current time position.
 */
function updateWaveformTooltipContent(tooltip, time, bar, beat) {
    tooltip.querySelector('.tooltip-time').textContent = formatTime(time);
    tooltip.querySelector('.tooltip-bar').textContent = `Bar ${bar}.${beat}`;
}

/**
 * Keep tooltip visible inside the waveform area while following cursor intent.
 */
function positionTooltip(tooltip, canvasRect, mouseX, mouseY, offsetY) {
    let tooltipX = mouseX;
    let tooltipY = mouseY + offsetY;

    const tooltipWidth = tooltip.getBoundingClientRect().width;

    if (tooltipX + tooltipWidth > canvasRect.width) {
        tooltipX = canvasRect.width - tooltipWidth;
    }

    if (tooltipX < 0) {
        tooltipX = 0;
    }

    if (tooltipY < 0) {
        tooltipY = mouseY + 20;
    }

    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;
}

/**
 * Seek to clicked canvas position and optionally resume playback.
 */
async function seekFromCanvasClick(mouseX, canvasWidth) {
    const percentage = (mouseX / canvasWidth) * 100;
    const time = songMetrics.percentToTime(percentage);
    const wasPlaying = audioEngine.getState().isPlaying;

    await audioEngine.seek(time);

    if (!wasPlaying) {
        await audioEngine.play();
        uiController.updatePlayButtonIcon(true);
        document.getElementById('stop-btn').disabled = false;
    }
}

/**
 * Create the AudioEngine, wire its events, then load all stems from the manifest.
 * On success: syncs initial mute/solo/gain state to the UI, registers the engine
 * with the waveform renderer, and enables the play button.
 * On failure: shows an error notification but still re-enables play so the user can retry.
 */
async function initializeAudio() {
    console.log('Initializing audio engine...');

    audioEngine = new AudioEngine();
    updateLoadingUiState('loading', WAVEFORM_TEXT_LOADING);

    setupAudioEventListeners();

    try {
        console.log('Loading audio from manifest...', manifest);
        await audioEngine.loadFromManifest(manifest);
        console.log('Audio loaded successfully!');
        console.log('Stems:', audioEngine.getStems());
        console.log('Duration:', audioEngine.getDuration());

        audioEngine.getStems().forEach(stem => {
            uiController.updateStemButtons(stem.id, {
                mute: stem.isMuted,
                solo: stem.isSoloed
            });
            uiController.updateStemGain(stem.id, stem.volumeDb ?? 0.0);
        });

        if (waveformRenderer) {
            waveformRenderer.setAudioEngine(audioEngine);
        }

        document.getElementById('play-btn').disabled = false;
        updateLoadingUiState('idle', WAVEFORM_TEXT_READY_HINT);
        console.log('Play button enabled');
    } catch (error) {
        console.error('Failed to load audio:', error);
        console.error('Error stack:', error.stack);
        NotificationManager.error('Failed to load audio files. Check console for details.');
        document.getElementById('play-btn').disabled = false;
        updateLoadingUiState('idle', WAVEFORM_TEXT_READY_HINT);
    }
}

