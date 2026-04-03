/**
 * Song Metrics Module
 * Provides efficient, cached calculations for time/position/bar conversions
 */

/**
 * SongMetrics class - wraps manifest data and provides conversion utilities
 */
export class SongMetrics {
    /**
     * Create a new SongMetrics instance
     * @param {Object} manifest - The song manifest containing song and section data
     */
    constructor(manifest) {
        this.manifest = manifest;
        const { song } = manifest;

        // Cache core properties
        this._duration = song.duration;
        this._bpm = song.bpm;
        this._timeSignature = song.timeSignature || '4/4';

        // Parse time signature
        const [numerator, denominator] = this._timeSignature.split('/').map(Number);
        this._beatsPerBar = numerator;
        this._beatUnit = denominator;

        // Calculate derived timing values (cache these)
        this._secondsPerBeat = 60 / this._bpm;
        this._secondsPerBar = this._secondsPerBeat * this._beatsPerBar;
        this._totalBars = Math.ceil(this._duration / this._secondsPerBar);
    }

    // ========================================================================
    // GETTERS - Direct property access
    // ========================================================================

    /**
     * Get song duration in seconds
     * @returns {number}
     */
    get duration() {
        return this._duration;
    }

    /**
     * Get song BPM
     * @returns {number}
     */
    get bpm() {
        return this._bpm;
    }

    /**
     * Get time signature (e.g., "4/4")
     * @returns {string}
     */
    get timeSignature() {
        return this._timeSignature;
    }

    /**
     * Get beats per bar (numerator of time signature)
     * @returns {number}
     */
    get beatsPerBar() {
        return this._beatsPerBar;
    }

    /**
     * Get beat unit (denominator of time signature)
     * @returns {number}
     */
    get beatUnit() {
        return this._beatUnit;
    }

    /**
     * Get seconds per beat
     * @returns {number}
     */
    get secondsPerBeat() {
        return this._secondsPerBeat;
    }

    /**
     * Get seconds per bar
     * @returns {number}
     */
    get secondsPerBar() {
        return this._secondsPerBar;
    }

    /**
     * Get total number of bars in song
     * @returns {number}
     */
    get totalBars() {
        return this._totalBars;
    }

    // ========================================================================
    // TIME ↔ POSITION CONVERSIONS (percent-based)
    // ========================================================================

    /**
     * Convert time in seconds to position percentage (0-100)
     * @param {number} timeInSeconds - Time in seconds
     * @returns {number} Position percentage (0-100)
     */
    timeToPercent(timeInSeconds) {
        if (this._duration === 0) return 0;
        return (timeInSeconds / this._duration) * 100;
    }

    /**
     * Convert position percentage to time in seconds
     * @param {number} percent - Position percentage (0-100)
     * @returns {number} Time in seconds
     */
    percentToTime(percent) {
        return (percent / 100) * this._duration;
    }

    // ========================================================================
    // TIME ↔ BAR CONVERSIONS
    // ========================================================================

    /**
     * Convert time to bar number (0-indexed, fractional)
     * @param {number} timeInSeconds - Time in seconds
     * @returns {number} Bar number (0-indexed, can be fractional like 2.5)
     */
    timeToBar(timeInSeconds) {
        return timeInSeconds / this._secondsPerBar;
    }

    /**
     * Convert time to bar number (1-indexed, whole number)
     * @param {number} timeInSeconds - Time in seconds
     * @returns {number} Bar number (1-indexed, e.g., 1, 2, 3...)
     */
    timeToBarNumber(timeInSeconds) {
        return Math.floor(timeInSeconds / this._secondsPerBar) + 1;
    }

    /**
     * Convert time to bar and beat (1-indexed)
     * @param {number} timeInSeconds - Time in seconds
     * @returns {Object} { bar, beat } - 1-indexed bar and beat numbers
     */
    timeToBarBeat(timeInSeconds) {
        const totalBeats = timeInSeconds / this._secondsPerBeat;
        const bar = Math.floor(totalBeats / this._beatsPerBar) + 1;
        const beat = Math.floor(totalBeats % this._beatsPerBar) + 1;
        return { bar, beat };
    }

    /**
     * Convert bar number to time in seconds
     * @param {number} barNumber - Bar number (0-indexed, can be fractional)
     * @returns {number} Time in seconds
     */
    barToTime(barNumber) {
        return barNumber * this._secondsPerBar;
    }

    /**
     * Convert 1-indexed bar number to time in seconds
     * @param {number} barNumber - Bar number (1-indexed)
     * @returns {number} Time in seconds at start of that bar
     */
    barNumberToTime(barNumber) {
        return (barNumber - 1) * this._secondsPerBar;
    }

    // ========================================================================
    // SECTION HELPERS
    // ========================================================================

    /**
     * Get the section currently playing at given time
     * @param {number} timeInSeconds - Current time in seconds
     * @returns {Object|null} Section object or null if not found
     */
    getCurrentSection(timeInSeconds) {
        const sections = this.manifest.sections;
        if (!sections || sections.length === 0) return null;

        return sections.find(section =>
            timeInSeconds >= section.startTime && timeInSeconds < section.endTime
        ) || null;
    }

    /**
     * Alias for getCurrentSection
     * @param {number} timeInSeconds - Current time in seconds
     * @returns {Object|null} Section object or null if not found
     */
    getSectionAtTime(timeInSeconds) {
        return this.getCurrentSection(timeInSeconds);
    }

    /**
     * Get all sections with calculated position percentages
     * @returns {Array} Sections with added leftPercent and widthPercent properties
     */
    getSectionsWithPositions() {
        const sections = this.manifest.sections;
        if (!sections || sections.length === 0) return [];

        return sections.map(section => ({
            ...section,
            leftPercent: this.timeToPercent(section.startTime),
            widthPercent: this.timeToPercent(section.endTime - section.startTime)
        }));
    }

    // ========================================================================
    // BEAT/BAR INTERVAL CALCULATIONS
    // ========================================================================

    /**
     * Calculate appropriate bar interval for visual markers
     * Given a width in pixels, determine a power-of-2 interval that
     * provides good spacing between bar markers
     * @param {number} containerWidth - Width of container in pixels
     * @param {number} minSpacing - Minimum spacing between markers in pixels (default 80)
     * @returns {number} Bar interval (power of 2: 1, 2, 4, 8, 16...)
     */
    calculateBarInterval(containerWidth, minSpacing = 80) {
        const maxMarkers = Math.floor(containerWidth / minSpacing);

        // Find smallest power of 2 that gives us maxMarkers or fewer
        let barInterval = 1;
        while (this._totalBars / barInterval > maxMarkers && barInterval < this._totalBars) {
            barInterval *= 2;
        }

        return barInterval;
    }

    /**
     * Generate bar marker positions for rendering
     * @param {number} containerWidth - Width of container in pixels
     * @param {number} minSpacing - Minimum spacing between markers in pixels
     * @returns {Array} Array of { barNumber, timeInSeconds, positionPercent }
     */
    generateBarMarkers(containerWidth, minSpacing = 80) {
        const barInterval = this.calculateBarInterval(containerWidth, minSpacing);
        const markers = [];

        for (let bar = 0; bar <= this._totalBars; bar += barInterval) {
            const timeInSeconds = bar * this._secondsPerBar;
            if (timeInSeconds > this._duration) break;

            markers.push({
                barNumber: bar + 1, // 1-indexed for display
                timeInSeconds,
                positionPercent: this.timeToPercent(timeInSeconds)
            });
        }

        return markers;
    }
}
