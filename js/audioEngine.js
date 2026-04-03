/**
 * Audio Engine Module
 * Handles synchronized multi-stem audio playback with mute/solo controls
 */

import { fetchArrayBufferWithCache } from './cacheManager.js';

const STEM_GAIN_DEFAULT_DB = 0.0;
const STEM_GAIN_MIN_DB = -24.0;
const STEM_GAIN_MAX_DB = 12.0;

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

        // Decoding state
        this.isAudioReady = false;  // true when all audio is decoded and ready
        this.decodePromise = null;  // shared promise for concurrent decode attempts

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
            // Insert placeholder immediately so map order follows manifest order, not fetch completion order.
            this.stems.set(stemId, {
                id: stemId,
                name: metadata.name || stemId,
                color: metadata.color || '#ffffff',
                order: metadata.order ?? Number.MAX_SAFE_INTEGER,
                arrayBuffer: null,
                buffer: null,
                source: null,
                gainNode: null,
                isMuted: metadata.defaultMuted === true,
                isSoloed: metadata.defaultSolo === true,
                volumeDb: metadata.defaultVolumeDb ?? STEM_GAIN_DEFAULT_DB
            });

            const arrayBuffer = await fetchArrayBufferWithCache(url);

            const stem = this.stems.get(stemId);
            if (!stem) {
                throw new Error(`Stem not found after initialization: ${stemId}`);
            }
            stem.arrayBuffer = arrayBuffer;

            const loadedCount = Array.from(this.stems.values()).filter(s => s.arrayBuffer).length;

            this._emit('loadprogress', {
                stemId,
                loaded: loadedCount,
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
            const arrayBuffer = await fetchArrayBufferWithCache(url);

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
        // Set duration from manifest (before decoding)
        if (manifest.song && manifest.song.duration) {
            this.state.duration = manifest.song.duration;
        }

        const promises = [];

        // Load all stems in parallel
        if (manifest.stems && manifest.stems.length > 0) {
            for (const stem of manifest.stems) {
                const defaultSolo = manifest.defaultSoloStems?.[stem.id] === true;
                const defaultMuted = manifest.defaultMutedStems?.[stem.id] === true;
                const resolvedDefaultMuted = defaultSolo ? false : defaultMuted;
                const defaultVolumeDb = manifest.defaultStemVolumesDb?.[stem.id] ?? STEM_GAIN_DEFAULT_DB;

                const stemPromise = this.loadStem(
                    stem.id,
                    stem.file,
                    {
                        name: stem.name,
                        color: stem.color,
                        order: stem.order,
                        defaultMuted: resolvedDefaultMuted,
                        defaultSolo,
                        defaultVolumeDb
                    }
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
        return Array.from(this.stems.values())
            .sort((a, b) => a.order - b.order)
            .map(stem => ({
                id: stem.id,
                name: stem.name,
                color: stem.color,
                order: stem.order,
                isMuted: stem.isMuted,
                isSoloed: stem.isSoloed,
                volumeDb: stem.volumeDb ?? STEM_GAIN_DEFAULT_DB
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
        // If already decoding, return the existing promise
        if (this.decodePromise) {
            console.log('Decoding already in progress, waiting...');
            return this.decodePromise;
        }

        // Emit decoding start event
        this._emit('decodestart');

        // Create a new decode promise
        this.decodePromise = this._performDecode();

        try {
            await this.decodePromise;
        } finally {
            // Clear the promise once complete
            this.decodePromise = null;
            // Emit decoding end event
            this._emit('decodeend');
        }
    }

    /**
     * Perform the actual decoding work
     * @private
     */
    async _performDecode() {
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

        // Mark audio as ready
        this.isAudioReady = true;
    }

    /**
     * Play audio (from beginning or resume from pause)
     */
    async play() {
        // Decode audio on first play (requires user gesture for AudioContext)
        if (!this.isAudioReady) {
            await this._decodeAudio();
        }

        if (this.state.isPlaying) return;

        // Set playing state immediately to prevent concurrent play() calls
        this.state.isPlaying = true;

        const offset = this.pausedAt;
        this.pausedAt = 0; // Reset pausedAt since we've incorporated it into startTime
        const mode = this.isMixMode ? 'mix' : 'stems';

        if (mode === 'mix' && this.mixNode) {
            this._playMix(offset);
        } else if (mode === 'stems' && this.stems.size > 0) {
            this._playStems(offset);
        } else {
            this.state.isPlaying = false; // Reset if we can't play
            throw new Error('No audio loaded to play');
        }

        this.startTime = this.audioContext.currentTime - offset;
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
            this.state.isPlaying = false;
            this._stopTimeUpdates();
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

    /**
     * Set per-stem gain in decibels
     * @param {string} stemId - Stem identifier
     * @param {number} volumeDb - Gain in dB
     */
    setVolumeDb(stemId, volumeDb) {
        const stem = this.stems.get(stemId);
        if (!stem) {
            console.warn(`Stem not found: ${stemId}`);
            return;
        }

        const numericDb = Number(volumeDb);
        if (!Number.isFinite(numericDb)) {
            console.warn(`Invalid volume dB value for stem ${stemId}:`, volumeDb);
            return;
        }

        stem.volumeDb = Math.min(STEM_GAIN_MAX_DB, Math.max(STEM_GAIN_MIN_DB, numericDb));
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
            const source = this.audioContext.createBufferSource();
            source.buffer = stem.buffer;
            source.connect(stem.gainNode);

            // Handle ended event - capture source to verify it's still current
            source.onended = () => {
                // Only handle if this source is still the current one and we're playing
                if (this.state.isPlaying && stem.source === source) {
                    this._handlePlaybackEnded();
                }
            };

            stem.source = source;

            // Start with synchronized offset
            source.start(0, offset);
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

        const source = this.audioContext.createBufferSource();
        source.buffer = mix.buffer;
        source.connect(mix.gainNode);

        // Handle ended event - capture source to verify it's still current
        source.onended = () => {
            // Only handle if this source is still the current one and we're playing
            if (this.state.isPlaying && mix.source === source) {
                this._handlePlaybackEnded();
            }
        };

        mix.source = source;

        source.start(0, offset);
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
        // Only handle if we're actually in a playing state
        // WARNING: multiple stems trigger this event when they end as of now
        // TODO: needs to be fixed
        if (!this.state.isPlaying) return;
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
            // Skip if gainNode doesn't exist yet (audio not decoded)
            if (!stem.gainNode) return;

            // Calculate if stem should be audible
            const shouldBeAudible = stem.isSoloed || (!anySoloed && !stem.isMuted);
            const stemGainLinear = Math.pow(10, (stem.volumeDb ?? STEM_GAIN_DEFAULT_DB) / 20);

            // Set gain instantly
            stem.gainNode.gain.setValueAtTime(
                shouldBeAudible ? stemGainLinear : 0.0,
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
