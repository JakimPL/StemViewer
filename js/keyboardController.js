/**
 * Keyboard Controller Module
 * Keyboard shortcut handling and action dispatching
 */

/**
 * Setup all keyboard shortcuts
 * @param {Function} getAudioEngine - Getter returning the current AudioEngine instance
 * @param {UIController} uiController - UI controller instance
 * @param {Object} manifest - Song manifest data
 * @param {Function} showNotification - Notification display function
 */
export function setupKeyboardShortcuts(getAudioEngine, uiController, manifest, showNotification) {

    // ============================================================================
    // ACTIONS
    // ============================================================================

    function actionTogglePlayPause() {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        const state = audioEngine.getState();
        if (state.isPlaying) {
            audioEngine.pause();
            uiController.updatePlayButtonIcon(false);
        } else {
            audioEngine.play();
            uiController.updatePlayButtonIcon(true);
            document.getElementById('stop-btn').disabled = false;
        }
    }

    function actionStop() {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        audioEngine.stop();
        uiController.updatePlayButtonIcon(false);
        document.getElementById('stop-btn').disabled = true;
        uiController.updatePlayhead(0);
    }

    function actionSeekBackward(seconds = 5) {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        const currentTime = audioEngine.getCurrentTime();
        const newTime = Math.max(0, currentTime - seconds);
        audioEngine.seek(newTime);
    }

    function actionSeekForward(seconds = 5) {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        const currentTime = audioEngine.getCurrentTime();
        const duration = audioEngine.getDuration();
        const newTime = Math.min(duration, currentTime + seconds);
        audioEngine.seek(newTime);
    }

    function actionToggleStemMute(stemIndex) {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        const stems = audioEngine.getStems();
        if (stemIndex >= stems.length) return;

        const stem = stems[stemIndex];
        const isMuted = audioEngine.toggleMute(stem.id);

        uiController.updateStemButtons(stem.id, { mute: isMuted, solo: isMuted ? false : undefined });
    }

    function actionToggleStemSolo(stemIndex) {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        const stems = audioEngine.getStems();
        if (stemIndex >= stems.length) return;

        const stem = stems[stemIndex];
        const isSoloed = audioEngine.toggleSolo(stem.id, true); // Exclusive

        uiController.updateStemButtons(stem.id, { solo: isSoloed, mute: isSoloed ? false : undefined });

        if (isSoloed) {
            uiController.clearAllSoloButtons(stem.id);
        }
    }

    function actionMuteAll() {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        const stems = audioEngine.getStems();
        stems.forEach(stem => {
            audioEngine.setMute(stem.id, true);
        });
        uiController.updateAllStemButtons(stems, { mute: true });

        showNotification('All tracks muted. Press U to unmute all.');
    }

    function actionUnmuteAll() {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        const stems = audioEngine.getStems();
        stems.forEach(stem => {
            audioEngine.setMute(stem.id, false);
            audioEngine.setSolo(stem.id, false);
        });
        uiController.updateAllStemButtons(stems, { mute: false, solo: false });

        showNotification('All tracks unmuted. Press M to mute all.');
    }

    function actionNextSection() {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        const currentTime = audioEngine.getCurrentTime();
        const sections = manifest.sections;

        const nextSection = sections.find(section => section.startTime > currentTime);

        if (nextSection) {
            const wasPlaying = audioEngine.getState().isPlaying;
            audioEngine.seek(nextSection.startTime);

            if (!wasPlaying) {
                audioEngine.play();
                uiController.updatePlayButtonIcon(true);
                document.getElementById('stop-btn').disabled = false;
            }
        }
    }

    function actionPreviousSection() {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        const currentTime = audioEngine.getCurrentTime();
        const sections = manifest.sections;

        // If we're within 2 seconds of the section start, go to the previous one
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
                uiController.updatePlayButtonIcon(true);
                document.getElementById('stop-btn').disabled = false;
            }
        }
    }

    function actionJumpToStart() {
        const audioEngine = getAudioEngine();
        if (!audioEngine) return;

        audioEngine.seek(0);
    }

    // ============================================================================
    // KEY MAPS & LISTENER
    // ============================================================================

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
