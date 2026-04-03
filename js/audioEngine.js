/**
 * Audio Engine Module
 * Handles synchronized multi-stem audio playback with mute/solo controls
 */

/**
 * AudioEngine class - manages Web Audio API for multi-stem playback
 */
export class AudioEngine {
    constructor() {
        // Web Audio API context
        this.audioContext = null;

        // Stem storage: Map<stemId, StemNode>
        this.stems = new Map();

        // Mix mode (single file fallback)
        this.mixNode = null;
        this.isMixMode = false;

        // Playback state
        this.state = {
            isPlaying: false,
            isPaused: false,
            currentTime: 0,
            duration: 0
        };

        // Time tracking
        this.startTime = 0;      // audioContext.currentTime when play started
        this.pausedAt = 0;       // position when paused

        // Event listeners
        this.eventListeners = new Map();
    }

    /**
     * Initialize audio context (required for user interaction on some browsers)
     */
    async initialize() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Resume context if suspended (required by autoplay policy)
        // This needs to be called from a user gesture (like clicking play button)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * Load a single stem from URL
     * @param {string} stemId - Unique identifier for the stem
     * @param {string} url - URL to audio file
     * @param {Object} metadata - Additional stem metadata (name, color)
     * @returns {Promise<void>}
     */
    async loadStem(stemId, url, metadata = {}) {
        try {
            // Fetch audio file
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            // Store raw buffer - will decode on first play (requires AudioContext)
            this.stems.set(stemId, {
                id: stemId,
                name: metadata.name || stemId,
                color: metadata.color || '#ffffff',
                arrayBuffer: arrayBuffer,  // Raw data
                buffer: null,              // Will be decoded later
                source: null,
                gainNode: null,            // Created when AudioContext exists
                isMuted: false,
                isSoloed: false
            });

            this._emit('loadprogress', {
                stemId,
                loaded: this.stems.size,
                total: this.stems.size
            });

        } catch (error) {
            throw new Error(`Failed to load stem ${stemId}: ${error.message}`);
        }
    }

    /**
     * Load mix file (single audio file containing all stems)
     * @param {string} url - URL to mix file
     * @returns {Promise<void>}
     */
    async loadMix(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch mix: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            // Store raw buffer - will decode on first play
            this.mixNode = {
                arrayBuffer: arrayBuffer,
                buffer: null,
                source: null,
                gainNode: null
            };

            this._emit('loadprogress', { type: 'mix', loaded: true });

        } catch (error) {
            throw new Error(`Failed to load mix: ${error.message}`);
        }
    }

    /**
     * Load all audio from manifest
     * @param {Object} manifest - Song manifest with stems/mix info
     * @returns {Promise<void>}
     */
    async loadFromManifest(manifest) {
        const promises = [];

        // Load all stems in parallel
        if (manifest.stems && manifest.stems.length > 0) {
            for (const stem of manifest.stems) {
                const stemPromise = this.loadStem(
                    stem.id,
                    stem.file,
                    { name: stem.name, color: stem.color }
                );
                promises.push(stemPromise);
            }
        }

        // Load mix if available
        if (manifest.files && manifest.files.mix) {
            promises.push(this.loadMix(manifest.files.mix));
        }

        await Promise.all(promises);
    }

    /**
     * Get current playback time
     * @returns {number} Current time in seconds
     */
    getCurrentTime() {
        if (this.state.isPlaying) {
            return this.audioContext.currentTime - this.startTime;
        }
        return this.pausedAt;
    }

    /**
     * Get total duration
     * @returns {number} Duration in seconds
     */
    getDuration() {
        return this.state.duration;
    }

    /**
     * Get current state
     * @returns {Object} State object
     */
    getState() {
        return {
            ...this.state,
            currentTime: this.getCurrentTime()
        };
    }

    /**
     * Get all stems info (for UI)
     * @returns {Array} Array of stem info objects
     */
    getStems() {
        return Array.from(this.stems.values()).map(stem => ({
            id: stem.id,
            name: stem.name,
            color: stem.color,
            isMuted: stem.isMuted,
            isSoloed: stem.isSoloed
        }));
    }

    // Event system

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    off(event, callback) {
        if (!this.eventListeners.has(event)) return;

        const listeners = this.eventListeners.get(event);
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }

    // Playback control methods

    /**
     * Decode all loaded audio (called on first play - requires user gesture)
     * @private
     */
    async _decodeAudio() {
        await this.initialize();

        // Decode stems
        for (const [stemId, stem] of this.stems.entries()) {
            if (!stem.buffer && stem.arrayBuffer) {
                console.log(`Decoding stem: ${stemId}`);
                stem.buffer = await this.audioContext.decodeAudioData(stem.arrayBuffer.slice(0));

                // Create gain node
                stem.gainNode = this.audioContext.createGain();
                stem.gainNode.connect(this.audioContext.destination);

                // Update duration from first decoded stem
                if (this.state.duration === 0) {
                    this.state.duration = stem.buffer.duration;
                }
            }
        }

        // Decode mix
        if (this.mixNode && !this.mixNode.buffer && this.mixNode.arrayBuffer) {
            console.log('Decoding mix');
            this.mixNode.buffer = await this.audioContext.decodeAudioData(this.mixNode.arrayBuffer.slice(0));
            this.mixNode.gainNode = this.audioContext.createGain();
            this.mixNode.gainNode.connect(this.audioContext.destination);

            if (this.state.duration === 0) {
                this.state.duration = this.mixNode.buffer.duration;
            }
        }

        console.log('Audio decoding complete. Duration:', this.state.duration);
    }

    /**
     * Play audio (from beginning or resume from pause)
     */
    async play() {
        // Decode audio on first play (requires user gesture for AudioContext)
        if (!this.audioContext || this.stems.size > 0 && !Array.from(this.stems.values())[0].buffer) {
            await this._decodeAudio();
        }

        if (this.state.isPlaying) return;

        const offset = this.pausedAt;
        const mode = this.isMixMode ? 'mix' : 'stems';

        if (mode === 'mix' && this.mixNode) {
            this._playMix(offset);
        } else if (mode === 'stems' && this.stems.size > 0) {
            this._playStems(offset);
        } else {
            throw new Error('No audio loaded to play');
        }

        this.startTime = this.audioContext.currentTime - offset;
        this.pausedAt = 0; // Reset pausedAt since we've incorporated it into startTime
        this.state.isPlaying = true;
        this.state.isPaused = false;

        this._emit('statechange', this.getState());
        this._startTimeUpdates();
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.state.isPlaying) return;

        // Calculate current position
        this.pausedAt = this.getCurrentTime();

        // Stop all sources
        this._stopAllSources();

        this.state.isPlaying = false;
        this.state.isPaused = true;

        this._stopTimeUpdates();
        this._emit('statechange', this.getState());
    }

    /**
     * Stop playback and reset to beginning
     */
    stop() {
        this._stopAllSources();

        this.pausedAt = 0;
        this.state.isPlaying = false;
        this.state.isPaused = false;
        this.state.currentTime = 0;

        this._stopTimeUpdates();
        this._emit('statechange', this.getState());
    }

    /**
     * Seek to specific time
     * @param {number} time - Time in seconds
     */
    async seek(time) {
        const wasPlaying = this.state.isPlaying;

        // Clamp time to valid range
        time = Math.max(0, Math.min(time, this.state.duration));

        if (wasPlaying) {
            this._stopAllSources();
        }

        this.pausedAt = time;

        if (wasPlaying) {
            await this.play();
        } else {
            this.state.currentTime = time;
            this._emit('timeupdate', time);
        }
    }

    /**
     * Toggle mute state for a stem
     * @param {string} stemId - Stem identifier
     * @returns {boolean} New mute state
     */
    toggleMute(stemId) {
        const stem = this.stems.get(stemId);
        if (!stem) {
            console.warn(`Stem not found: ${stemId}`);
            return false;
        }

        stem.isMuted = !stem.isMuted;

        // If muting, also clear solo state
        if (stem.isMuted && stem.isSoloed) {
            stem.isSoloed = false;
        }

        this._recalculateGains();
        this._emit('statechange', this.getState());

        return stem.isMuted;
    }

    /**
     * Toggle solo state for a stem
     * @param {string} stemId - Stem identifier
     * @param {boolean} exclusive - If true, un-solo all other stems first
     * @returns {boolean} New solo state
     */
    toggleSolo(stemId, exclusive = false) {
        const stem = this.stems.get(stemId);
        if (!stem) {
            console.warn(`Stem not found: ${stemId}`);
            return false;
        }

        // If exclusive and we're about to solo (not un-solo), clear all other solos first
        if (exclusive && !stem.isSoloed) {
            this.stems.forEach((s, id) => {
                if (id !== stemId) {
                    s.isSoloed = false;
                }
            });
        }

        stem.isSoloed = !stem.isSoloed;

        // If soloing, also clear mute state
        if (stem.isSoloed && stem.isMuted) {
            stem.isMuted = false;
        }

        this._recalculateGains();
        this._emit('statechange', this.getState());

        return stem.isSoloed;
    }

    /**
     * Set mute state for a stem
     * @param {string} stemId - Stem identifier
     * @param {boolean} muted - Mute state
     */
    setMute(stemId, muted) {
        const stem = this.stems.get(stemId);
        if (!stem) {
            console.warn(`Stem not found: ${stemId}`);
            return;
        }

        stem.isMuted = muted;
        this._recalculateGains();
        this._emit('statechange', this.getState());
    }

    /**
     * Set solo state for a stem
     * @param {string} stemId - Stem identifier
     * @param {boolean} soloed - Solo state
     */
    setSolo(stemId, soloed) {
        const stem = this.stems.get(stemId);
        if (!stem) {
            console.warn(`Stem not found: ${stemId}`);
            return;
        }

        stem.isSoloed = soloed;
        this._recalculateGains();
        this._emit('statechange', this.getState());
    }

    // Private playback helpers

    /**
     * Play all stems with synchronized start
     * @private
     */
    _playStems(offset) {
        this.stems.forEach(stem => {
            // Create new source node (sources are one-shot)
            stem.source = this.audioContext.createBufferSource();
            stem.source.buffer = stem.buffer;
            stem.source.connect(stem.gainNode);

            // Handle ended event
            stem.source.onended = () => {
                if (this.state.isPlaying) {
                    this._handlePlaybackEnded();
                }
            };

            // Start with synchronized offset
            stem.source.start(0, offset);
        });

        // Recalculate gains based on current mute/solo state
        this._recalculateGains();
    }

    /**
     * Play mix file
     * @private
     */
    _playMix(offset) {
        const mix = this.mixNode;

        mix.source = this.audioContext.createBufferSource();
        mix.source.buffer = mix.buffer;
        mix.source.connect(mix.gainNode);

        mix.source.onended = () => {
            if (this.state.isPlaying) {
                this._handlePlaybackEnded();
            }
        };

        mix.source.start(0, offset);
    }

    /**
     * Stop all active audio sources
     * @private
     */
    _stopAllSources() {
        // Stop stems
        this.stems.forEach(stem => {
            if (stem.source) {
                try {
                    stem.source.stop();
                } catch (e) {
                    // Source may already be stopped
                }
                stem.source = null;
            }
        });

        // Stop mix
        if (this.mixNode && this.mixNode.source) {
            try {
                this.mixNode.source.stop();
            } catch (e) {
                // Source may already be stopped
            }
            this.mixNode.source = null;
        }
    }

    /**
     * Handle playback reaching the end
     * @private
     */
    _handlePlaybackEnded() {
        this.stop();
        this._emit('ended');
    }

    /**
     * Start time update loop
     * @private
     */
    _startTimeUpdates() {
        if (this.timeUpdateInterval) return;

        const updateTime = () => {
            if (this.state.isPlaying) {
                const currentTime = this.getCurrentTime();
                this.state.currentTime = currentTime;
                this._emit('timeupdate', currentTime);

                this.timeUpdateInterval = requestAnimationFrame(updateTime);
            }
        };

        this.timeUpdateInterval = requestAnimationFrame(updateTime);
    }

    /**
     * Stop time update loop
     * @private
     */
    _stopTimeUpdates() {
        if (this.timeUpdateInterval) {
            cancelAnimationFrame(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    /**
     * Recalculate gain values based on mute/solo state
     * Solo takes precedence: if any stem is soloed, only soloed stems are audible
     * @private
     */
    _recalculateGains() {
        // Check if any stem is soloed
        const anySoloed = Array.from(this.stems.values()).some(stem => stem.isSoloed);

        this.stems.forEach(stem => {
            // Calculate if stem should be audible
            const shouldBeAudible = stem.isSoloed || (!anySoloed && !stem.isMuted);

            // Set gain instantly
            stem.gainNode.gain.setValueAtTime(
                shouldBeAudible ? 1.0 : 0.0,
                this.audioContext.currentTime
            );
        });
    }

    /**
     * Emit event to listeners
     * @private
     */
    _emit(event, data) {
        if (!this.eventListeners.has(event)) return;

        const listeners = this.eventListeners.get(event);
        listeners.forEach(callback => callback(data));
    }
}
