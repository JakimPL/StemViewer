/**
 * Timeline Viewport Module
 * Tracks the visible time window of the timeline and converts between time and screen position
 */

/**
 * TimelineViewport - visible window { startTime, visibleDuration } inside [0, duration].
 * Stores seconds, so the window survives canvas resizes unchanged.
 */
export class TimelineViewport {
    /**
     * @param {number} duration - Timeline duration in seconds
     * @param {number} minVisibleDuration - Narrowest allowed window in seconds (deepest zoom)
     */
    constructor(duration, minVisibleDuration) {
        this._duration = Math.max(0, duration);
        this._minVisibleDuration = Math.min(Math.max(0, minVisibleDuration), this._duration);
        this._startTime = 0;
        this._visibleDuration = this._duration;
        this._listeners = new Set();
    }

    get duration() {
        return this._duration;
    }

    get startTime() {
        return this._startTime;
    }

    get endTime() {
        return this._startTime + this._visibleDuration;
    }

    get visibleDuration() {
        return this._visibleDuration;
    }

    get minVisibleDuration() {
        return this._minVisibleDuration;
    }

    /**
     * True when the whole timeline is visible.
     * @returns {boolean}
     */
    get isFitted() {
        return this._visibleDuration >= this._duration;
    }

    // ========================================================================
    // CONVERSIONS
    // ========================================================================

    /**
     * Convert time to a position ratio of the visible window (0 = left edge, 1 = right edge).
     * Times outside the window map outside [0, 1].
     * @param {number} timeInSeconds - Time in seconds
     * @returns {number} Position ratio
     */
    timeToRatio(timeInSeconds) {
        if (this._visibleDuration <= 0) return 0;
        return (timeInSeconds - this._startTime) / this._visibleDuration;
    }

    /**
     * Convert a position ratio of the visible window to time.
     * @param {number} ratio - Position ratio (0 = left edge, 1 = right edge)
     * @returns {number} Time in seconds
     */
    ratioToTime(ratio) {
        return this._startTime + ratio * this._visibleDuration;
    }

    /**
     * Convert time to an x coordinate inside an element of the given width.
     * @param {number} timeInSeconds - Time in seconds
     * @param {number} width - Element width in pixels
     * @returns {number} X coordinate in pixels
     */
    timeToPixel(timeInSeconds, width) {
        return this.timeToRatio(timeInSeconds) * width;
    }

    /**
     * Convert an x coordinate inside an element of the given width to time,
     * clamped to the visible window.
     * @param {number} x - X coordinate in pixels
     * @param {number} width - Element width in pixels
     * @returns {number} Time in seconds
     */
    pixelToTime(x, width) {
        if (width <= 0) return this._startTime;
        return this.ratioToTime(clamp(x / width, 0, 1));
    }

    // ========================================================================
    // QUERIES
    // ========================================================================

    /**
     * @param {number} timeInSeconds - Time in seconds
     * @returns {boolean} True when the time lies inside the visible window
     */
    isVisible(timeInSeconds) {
        return timeInSeconds >= this._startTime && timeInSeconds <= this.endTime;
    }

    /**
     * Visible part of a time span.
     * @param {number} startTime - Span start in seconds
     * @param {number} endTime - Span end in seconds
     * @returns {{start: number, end: number}|null} Clipped span, or null when the span is off-screen
     */
    clipRange(startTime, endTime) {
        const start = Math.max(startTime, this._startTime);
        const end = Math.min(endTime, this.endTime);
        return end > start ? { start, end } : null;
    }

    // ========================================================================
    // MOVEMENT
    // ========================================================================

    /**
     * Move the window by a time offset.
     * @param {number} seconds - Offset in seconds (positive moves later in the song)
     */
    panBy(seconds) {
        this._setWindow(this._startTime + seconds, this._visibleDuration);
    }

    /**
     * Zoom so that anchorTime stays at anchorRatio of the window.
     * @param {number} anchorTime - Time kept under the anchor, in seconds
     * @param {number} anchorRatio - Anchor position ratio within the window (0..1)
     * @param {number} factor - Zoom factor (above 1 zooms in, below 1 zooms out)
     */
    zoomAt(anchorTime, anchorRatio, factor) {
        if (factor <= 0) return;

        const visibleDuration = this._clampVisibleDuration(this._visibleDuration / factor);
        const ratio = clamp(anchorRatio, 0, 1);
        this._setWindow(anchorTime - ratio * visibleDuration, visibleDuration);
    }

    /**
     * Zoom around a time, keeping it at its current screen position when visible,
     * and around the window centre otherwise.
     * @param {number} anchorTime - Preferred anchor time in seconds
     * @param {number} factor - Zoom factor (above 1 zooms in, below 1 zooms out)
     */
    zoomAround(anchorTime, factor) {
        if (this.isVisible(anchorTime)) {
            this.zoomAt(anchorTime, this.timeToRatio(anchorTime), factor);
        } else {
            this.zoomAt(this.ratioToTime(0.5), 0.5, factor);
        }
    }

    /**
     * Show the whole timeline.
     */
    fit() {
        this._setWindow(0, this._duration);
    }

    /**
     * Place a time at the given ratio of the window, keeping the zoom level.
     * @param {number} timeInSeconds - Time in seconds
     * @param {number} marginRatio - Target position ratio within the window
     */
    showAt(timeInSeconds, marginRatio) {
        this._setWindow(timeInSeconds - marginRatio * this._visibleDuration, this._visibleDuration);
    }

    /**
     * Bring a time into view when it lies outside the window.
     * @param {number} timeInSeconds - Time in seconds
     * @param {number} marginRatio - Position ratio given to the time when the window moves
     */
    reveal(timeInSeconds, marginRatio) {
        if (this.isVisible(timeInSeconds)) return;
        this.showAt(timeInSeconds, marginRatio);
    }

    // ========================================================================
    // CHANGE NOTIFICATION
    // ========================================================================

    /**
     * Register a listener called after every window change.
     * @param {Function} listener - Callback receiving the viewport
     * @returns {Function} Unsubscribe function
     */
    onChange(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _clampVisibleDuration(visibleDuration) {
        return clamp(visibleDuration, this._minVisibleDuration, this._duration);
    }

    _setWindow(startTime, visibleDuration) {
        const clampedDuration = this._clampVisibleDuration(visibleDuration);
        const clampedStart = clamp(startTime, 0, this._duration - clampedDuration);

        if (clampedStart === this._startTime && clampedDuration === this._visibleDuration) return;

        this._startTime = clampedStart;
        this._visibleDuration = clampedDuration;
        this._listeners.forEach(listener => listener(this));
    }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
