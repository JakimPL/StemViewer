/**
 * Keyboard Controller Module
 * Keyboard shortcut handling and action dispatching
 */

/**
 * Keyboard controller for shortcut handling and action dispatching
 */
export class KeyboardController {
    /**
     * @param {Function} getAudioEngine - Getter returning the current AudioEngine instance
     * @param {UIController} uiController - UI controller instance
     * @param {Object} manifest - Song manifest data
     * @param {Function} showNotification - Notification display function
     */
    constructor(getAudioEngine, uiController, manifest, showNotification) {
        this.getAudioEngine = getAudioEngine;
        this.uiController = uiController;
        this.manifest = manifest;
        this.showNotification = showNotification;
        this.isEnabled = false;

        this.handleKeyDown = this.handleKeyDown.bind(this);

        this.actions = {
            togglePlayPause: () => this.togglePlayPause(),
            stop: () => this.stop(),
            seekBackward: (seconds = 5) => this.seekBackward(seconds),
            seekForward: (seconds = 5) => this.seekForward(seconds),
            toggleStemMute: (stemIndex) => this.toggleStemMute(stemIndex),
            toggleStemSolo: (stemIndex) => this.toggleStemSolo(stemIndex),
            muteAll: () => this.muteAll(),
            unmuteAll: () => this.unmuteAll(),
            nextSection: () => this.nextSection(),
            previousSection: () => this.previousSection(),
            jumpToStart: () => this.jumpToStart()
        };
    }

    enable() {
        if (this.isEnabled) return;

        document.addEventListener('keydown', this.handleKeyDown);
        this.isEnabled = true;
    }

    disable() {
        if (!this.isEnabled) return;

        document.removeEventListener('keydown', this.handleKeyDown);
        this.isEnabled = false;
    }

    togglePlayPause() {
        this.withAudioEngine((audioEngine) => {
            const state = audioEngine.getState();

            if (state.isPlaying) {
                audioEngine.pause();
                this.uiController.updatePlayButtonIcon(false);
            } else {
                audioEngine.play();
                this.uiController.updatePlayButtonIcon(true);
                document.getElementById('stop-btn').disabled = false;
            }
        });
    }

    stop() {
        this.withAudioEngine((audioEngine) => {
            audioEngine.stop();
            this.uiController.updatePlayButtonIcon(false);
            document.getElementById('stop-btn').disabled = true;
            this.uiController.updatePlayhead(0);
        });
    }

    seekBackward(seconds = 5) {
        this.withAudioEngine((audioEngine) => {
            const currentTime = audioEngine.getCurrentTime();
            const newTime = Math.max(0, currentTime - seconds);
            audioEngine.seek(newTime);
        });
    }

    seekForward(seconds = 5) {
        this.withAudioEngine((audioEngine) => {
            const currentTime = audioEngine.getCurrentTime();
            const duration = audioEngine.getDuration();
            const newTime = Math.min(duration, currentTime + seconds);
            audioEngine.seek(newTime);
        });
    }

    toggleStemMute(stemIndex) {
        this.withAudioEngine((audioEngine) => {
            const stems = audioEngine.getStems();
            if (stemIndex >= stems.length) return;

            const stem = stems[stemIndex];
            const isMuted = audioEngine.toggleMute(stem.id);

            this.uiController.updateStemButtons(stem.id, { mute: isMuted, solo: isMuted ? false : undefined });
        });
    }

    toggleStemSolo(stemIndex) {
        this.withAudioEngine((audioEngine) => {
            const stems = audioEngine.getStems();
            if (stemIndex >= stems.length) return;

            const stem = stems[stemIndex];
            const isSoloed = audioEngine.toggleSolo(stem.id, true);

            this.uiController.updateStemButtons(stem.id, { solo: isSoloed, mute: isSoloed ? false : undefined });

            if (isSoloed) {
                this.uiController.clearAllSoloButtons(stem.id);
            }
        });
    }

    muteAll() {
        this.withAudioEngine((audioEngine) => {
            const stems = audioEngine.getStems();
            stems.forEach(stem => {
                audioEngine.setMute(stem.id, true);
            });

            this.uiController.updateAllStemButtons(stems, { mute: true });
            this.showNotification('All tracks muted. Press U to unmute all.');
        });
    }

    unmuteAll() {
        this.withAudioEngine((audioEngine) => {
            const stems = audioEngine.getStems();
            stems.forEach(stem => {
                audioEngine.setMute(stem.id, false);
                audioEngine.setSolo(stem.id, false);
            });

            this.uiController.updateAllStemButtons(stems, { mute: false, solo: false });
            this.showNotification('All tracks unmuted. Press M to mute all.');
        });
    }

    nextSection() {
        this.withAudioEngine((audioEngine) => {
            const currentTime = audioEngine.getCurrentTime();
            const nextSection = this.manifest.sections.find(section => section.startTime > currentTime);

            if (!nextSection) return;

            const wasPlaying = audioEngine.getState().isPlaying;
            audioEngine.seek(nextSection.startTime);

            if (!wasPlaying) {
                audioEngine.play();
                this.uiController.updatePlayButtonIcon(true);
                document.getElementById('stop-btn').disabled = false;
            }
        });
    }

    previousSection() {
        this.withAudioEngine((audioEngine) => {
            const currentTime = audioEngine.getCurrentTime();
            const sections = this.manifest.sections;
            const threshold = 2.0;
            let targetSection = null;

            for (let i = sections.length - 1; i >= 0; i--) {
                if (sections[i].startTime < currentTime - threshold) {
                    targetSection = sections[i];
                    break;
                }
            }

            if (!targetSection) return;

            const wasPlaying = audioEngine.getState().isPlaying;
            audioEngine.seek(targetSection.startTime);

            if (!wasPlaying) {
                audioEngine.play();
                this.uiController.updatePlayButtonIcon(true);
                document.getElementById('stop-btn').disabled = false;
            }
        });
    }

    jumpToStart() {
        this.withAudioEngine((audioEngine) => {
            audioEngine.seek(0);
        });
    }

    handleKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        const key = e.key;
        const keyMap = this.getKeyMap();
        const shiftKeyMap = this.getShiftKeyMap();

        if (e.shiftKey && shiftKeyMap[key]) {
            e.preventDefault();
            shiftKeyMap[key]();
            return;
        }

        if (keyMap[key]) {
            e.preventDefault();
            keyMap[key]();
        }
    }

    getKeyMap() {
        return {
            ' ': this.actions.togglePlayPause,
            'Escape': this.actions.stop,
            'ArrowLeft': () => this.actions.seekBackward(5),
            'ArrowRight': () => this.actions.seekForward(5),
            '1': () => this.actions.toggleStemMute(0),
            '2': () => this.actions.toggleStemMute(1),
            '3': () => this.actions.toggleStemMute(2),
            '4': () => this.actions.toggleStemMute(3),
            '5': () => this.actions.toggleStemMute(4),
            '6': () => this.actions.toggleStemMute(5),
            '7': () => this.actions.toggleStemMute(6),
            '8': () => this.actions.toggleStemMute(7),
            '9': () => this.actions.toggleStemMute(8),
            'm': this.actions.muteAll,
            'M': this.actions.muteAll,
            'u': this.actions.unmuteAll,
            'U': this.actions.unmuteAll,
            'Tab': this.actions.nextSection,
            'Home': this.actions.jumpToStart
        };
    }

    getShiftKeyMap() {
        return {
            '1': () => this.actions.toggleStemSolo(0),
            '2': () => this.actions.toggleStemSolo(1),
            '3': () => this.actions.toggleStemSolo(2),
            '4': () => this.actions.toggleStemSolo(3),
            '5': () => this.actions.toggleStemSolo(4),
            '6': () => this.actions.toggleStemSolo(5),
            '7': () => this.actions.toggleStemSolo(6),
            '8': () => this.actions.toggleStemSolo(7),
            '9': () => this.actions.toggleStemSolo(8),
            'Tab': this.actions.previousSection
        };
    }

    withAudioEngine(callback) {
        const audioEngine = this.getAudioEngine();
        if (!audioEngine) return;

        return callback(audioEngine);
    }
}
