/**
 * Main Application Entry Point
 * Coordinates all modules and initializes the application
 */

import { loadManifest, resolveAudioPath } from './dataLoader.js';
import { formatTime } from './utils.js';
import { AudioEngine } from './audioEngine.js';
import { WaveformRenderer } from './waveformRenderer.js';
import { SongMetrics } from './songMetrics.js';
import {
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
} from './uiController.js';

// Application state
let manifest = null;
let audioEngine = null;
let waveformRenderer = null;
let songMetrics = null;

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load manifest data
        manifest = await loadManifest();
        console.log('Manifest loaded:', manifest);

        // Create song metrics helper
        songMetrics = new SongMetrics(manifest);

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
        showError('Failed to load song data. Please check the console for details.');
    }
});

/**
 * Initialize UI elements with manifest data
 */
function initializeUI() {
    // Update song header
    updateSongHeader(manifest);

    // Update stems list
    updateStemsList(manifest);

    // Update section markers
    updateSectionMarkers(manifest, songMetrics, () => audioEngine, updatePlayButtonIcon);

    // Update time ruler
    updateTimeRuler(manifest, songMetrics);

    // Update metadata panel
    updateMetadataPanel(manifest);

    // Update time display
    updateTimeDisplay(manifest, songMetrics, 0); // Start at 0:00

    // Adjust stem heights after layout is complete
    requestAnimationFrame(() => {
        adjustStemHeights();
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
        adjustStemHeights();
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
        updatePlayhead(songMetrics, 0); // Reset playhead to beginning
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
            updatePlayButtonIcon(true);
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
        updateTimeDisplay(manifest, songMetrics, time);
        updatePlayhead(songMetrics, time);
        updateActiveSection(songMetrics, time);
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
