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
        this.audioContext = null;
        this.stems = new Map();  // Map<stemId, StemNode>

        this.mixNode = null;
        this.isMixMode = false;

        this.state = {
            isPlaying: false,
            isPaused: false,
            currentTime: 0,
            duration: 0
        };

        this.startTime = 0;   // audioContext.currentTime at the moment play() was called
        this.pausedAt = 0;    // track position across pause/resume

        this.isAudioReady = false;
        this.decodePromise = null;  // deduplicate concurrent decode calls

        this.eventListeners = new Map();
    }

    /**
     * Create or resume the AudioContext.
     * Must be triggered from a user gesture; browsers suspend AudioContext
     * automatically until the user interacts with the page.
     */
    async initialize() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * Fetch and store raw audio data for a single stem.
     * A placeholder entry is inserted into the Map before the fetch starts so that
     * Map insertion order matches the manifest, regardless of which fetch completes first.
     * On any failure the placeholder is removed so callers see a clean state.
     * @param {string} stemId - Unique identifier for the stem
     * @param {string} url - URL to audio file
     * @param {Object} metadata - Additional stem metadata (name, color)
     * @returns {Promise<void>}
     */
    async loadStem(stemId, url, metadata = {}) {
        try {
            this.stems.set(stemId, {
                id: stemId,
                name: metadata.name || stemId,
                color: metadata.color || '#ffffff',
                order: metadata.order ?? Number.MAX_SAFE_INTEGER,
                arrayBuffer: null,
                buffer: null,
                source: null,
                gainNode: null,
                isMuted: metadata.mute === true,
                isSoloed: metadata.solo === true,
                volumeDb: metadata.volume ?? STEM_GAIN_DEFAULT_DB
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
            this.stems.delete(stemId);
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
     * Load all stems and optional mix file from the manifest in parallel.
     * Duration is read from manifest metadata immediately, before any decoding.
     * @param {Object} manifest - Song manifest with stems/mix info
     * @returns {Promise<void>}
     */
    async loadFromManifest(manifest) {
        if (manifest.song && manifest.song.duration) {
            this.state.duration = manifest.song.duration;
        }

        const promises = [];

        if (manifest.stems && manifest.stems.length > 0) {
            for (const stem of manifest.stems) {
                const solo = stem.solo === true;
                const mute = stem.mute === true;
                const resolvedMute = solo ? false : mute;
                const volume = stem.volume ?? STEM_GAIN_DEFAULT_DB;

                const stemPromise = this.loadStem(
                    stem.id,
                    stem.file,
                    {
                        name: stem.name,
                        color: stem.color,
                        order: stem.order,
                        mute: resolvedMute,
                        solo,
                        volume
                    }
                );
                promises.push(stemPromise);
            }
        }

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
     * Decode all loaded audio buffers. Safe to call concurrently: any
     * overlapping calls join the same in-flight promise rather than
     * starting a second decode pass.
     * Must be triggered from a user gesture so AudioContext can be resumed.
     * @private
     */
    async _decodeAudio() {
        if (this.decodePromise) {
            console.log('Decoding already in progress, waiting...');
            return this.decodePromise;
        }

        this._emit('decodestart');
        this.decodePromise = this._performDecode();

        try {
            await this.decodePromise;
        } finally {
            this.decodePromise = null;
            this._emit('decodeend');
        }
    }

    /**
     * Decode all pending arrayBuffers and wire their gain nodes.
     * Falls back to reading duration from a decoded buffer if the manifest
     * did not provide one.
     * @private
     */
    async _performDecode() {
        await this.initialize();

        await this._decodePendingStemsConcurrently();

        if (this.mixNode && !this.mixNode.buffer && this.mixNode.arrayBuffer) {
            console.log('Decoding mix');
            await this._decodeMixBuffer();
        }

        this._setDurationFromDecodedAudio();

        console.log('Audio decoding complete. Duration:', this.state.duration);
        this.isAudioReady = true;
    }

    /**
     * Decode all stems that have loaded arrayBuffers but no decoded AudioBuffer yet.
     * @private
     */
    async _decodePendingStemsConcurrently() {
        const pendingStems = Array.from(this.stems.entries())
            .filter(([, stem]) => !stem.buffer && stem.arrayBuffer);

        await Promise.all(pendingStems.map(async ([stemId, stem]) => {
            console.log(`Decoding stem: ${stemId}`);
            await this._decodeStemBuffer(stem);
        }));
    }

    /**
     * Fill duration from decoded audio only when manifest duration was absent.
     * Prefers first decoded stem by map order, then falls back to decoded mix.
     * @private
     */
    _setDurationFromDecodedAudio() {
        if (this.state.duration > 0) return;

        const firstDecodedStem = Array.from(this.stems.values()).find(stem => stem.buffer);
        if (firstDecodedStem) {
            this.state.duration = firstDecodedStem.buffer.duration;
            return;
        }

        if (this.mixNode?.buffer) {
            this.state.duration = this.mixNode.buffer.duration;
        }
    }

    /**
     * Decode a stem's raw arrayBuffer and wire a new GainNode to the destination.
     * @private
     */
    async _decodeStemBuffer(stem) {
        stem.buffer = await this.audioContext.decodeAudioData(stem.arrayBuffer.slice(0));
        stem.gainNode = this.audioContext.createGain();
        stem.gainNode.connect(this.audioContext.destination);
    }

    /**
     * Decode the mix arrayBuffer and wire a new GainNode to the destination.
     * @private
     */
    async _decodeMixBuffer() {
        this.mixNode.buffer = await this.audioContext.decodeAudioData(this.mixNode.arrayBuffer.slice(0));
        this.mixNode.gainNode = this.audioContext.createGain();
        this.mixNode.gainNode.connect(this.audioContext.destination);
    }

    /**
     * Start or resume playback.
     * Decodes audio on the first call (requires prior user gesture for AudioContext).
     * Sets isPlaying immediately to prevent re-entrant calls; restores it on error.
     */
    async play() {
        if (!this.isAudioReady) {
            await this._decodeAudio();
        }

        if (this.state.isPlaying) return;

        this.state.isPlaying = true;

        const offset = this.pausedAt;
        this.pausedAt = 0;
        const mode = this.isMixMode ? 'mix' : 'stems';

        try {
            if (mode === 'mix' && this.mixNode) {
                this._playMix(offset);
            } else if (mode === 'stems' && this.stems.size > 0) {
                this._playStems(offset);
            } else {
                throw new Error('No audio loaded to play');
            }
        } catch (error) {
            this.state.isPlaying = false;
            throw error;
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

        this.pausedAt = this.getCurrentTime();
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
     * Toggle mute for a stem. Muting also clears any active solo on that stem.
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

        if (stem.isMuted && stem.isSoloed) {
            stem.isSoloed = false;
        }

        this._recalculateGains();
        this._emit('statechange', this.getState());

        return stem.isMuted;
    }

    /**
     * Toggle solo for a stem. Soloing also clears the stem's mute state.
     * When exclusive=true and the stem is being soloed (not un-soloed),
     * all other stems are un-soloed first, producing a single-stem solo.
     * @param {string} stemId - Stem identifier
     * @param {boolean} exclusive - Un-solo all other stems before soloing
     * @returns {boolean} New solo state
     */
    toggleSolo(stemId, exclusive = false) {
        const stem = this.stems.get(stemId);
        if (!stem) {
            console.warn(`Stem not found: ${stemId}`);
            return false;
        }

        if (exclusive && !stem.isSoloed) {
            this.stems.forEach((s, id) => {
                if (id !== stemId) s.isSoloed = false;
            });
        }

        stem.isSoloed = !stem.isSoloed;

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
     * Start all decoded stems simultaneously at the given offset.
     * @private
     */
    _playStems(offset) {
        const playableStems = Array.from(this.stems.values()).filter(stem => stem.buffer && stem.gainNode);

        if (playableStems.length === 0) {
            throw new Error('No decoded stems are available to play. Check audio file loading errors.');
        }

        playableStems.forEach(stem => this._startStemSource(stem, offset));
        this._recalculateGains();
    }

    /**
     * Create and start a one-shot BufferSource for a single stem.
     * Web Audio source nodes cannot be restarted; a new one is created on each play.
     * The onended handler is guarded against stale references from seek/stop cycles.
     * @private
     */
    _startStemSource(stem, offset) {
        const source = this.audioContext.createBufferSource();
        source.buffer = stem.buffer;
        source.connect(stem.gainNode);
        source.onended = () => {
            if (this.state.isPlaying && stem.source === source) {
                this._handlePlaybackEnded();
            }
        };
        stem.source = source;
        source.start(0, offset);
    }

    /**
     * Start the mix file at the given offset.
     * @private
     */
    _playMix(offset) {
        const mix = this.mixNode;

        if (!mix?.buffer || !mix?.gainNode) {
            throw new Error('Mix is not decoded and ready for playback.');
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = mix.buffer;
        source.connect(mix.gainNode);
        source.onended = () => {
            if (this.state.isPlaying && mix.source === source) {
                this._handlePlaybackEnded();
            }
        };
        mix.source = source;
        source.start(0, offset);
    }

    _stopAllSources() {
        this.stems.forEach(stem => {
            if (stem.source) {
                this._stopSource(stem.source);
                stem.source = null;
            }
        });

        if (this.mixNode?.source) {
            this._stopSource(this.mixNode.source);
            this.mixNode.source = null;
        }
    }

    /**
     * Stop a Web Audio source node, ignoring errors for sources that have
     * already played to completion (calling stop() on them throws).
     * @private
     */
    _stopSource(source) {
        try {
            source.stop();
        } catch (_) { }
    }

    /**
     * Called by onended on each stem source when it finishes playing.
     * All stems end simultaneously, so this fires multiple times per song end.
     * The isPlaying guard ensures only the first call triggers the stop/ended sequence.
     * @private
     */
    _handlePlaybackEnded() {
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
     * Apply gain to all decoded stems based on current mute/solo state.
     * Solo takes precedence: if any stem is soloed, only soloed stems are audible.
     * @private
     */
    _recalculateGains() {
        const anySoloed = Array.from(this.stems.values()).some(stem => stem.isSoloed);

        this.stems.forEach(stem => {
            if (!stem.gainNode) return;

            const gain = this._isStemAudible(stem, anySoloed)
                ? this._dbToLinear(stem.volumeDb ?? STEM_GAIN_DEFAULT_DB)
                : 0.0;

            stem.gainNode.gain.setValueAtTime(gain, this.audioContext.currentTime);
        });
    }

    /** @private */
    _isStemAudible(stem, anySoloed) {
        return stem.isSoloed || (!anySoloed && !stem.isMuted);
    }

    /** @private */
    _dbToLinear(db) {
        return Math.pow(10, db / 20);
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
