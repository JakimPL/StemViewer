/**
 * Playhead Follower Module
 * Keeps the playhead in view while the timeline is zoomed in
 */

const FOLLOW_MARGIN_RATIO = 0.05;
const FOLLOW_INPUT_GRACE_MS = 1000;

/**
 * PlayheadFollower - moves the visible window after the playhead.
 *   Seek: reveals the target time when it lies off-screen.
 *   Playback: pages forward when the playhead crosses the right edge.
 *   User stop: reveals the start of the song.
 * Paging pauses for a moment after zoom/scroll input, so it leaves gestures in progress alone.
 * When the user scrolls away so that the playhead is past the right edge, following resumes at the next seek.
 */
export class PlayheadFollower {
    /**
     * @param {TimelineViewport} viewport - Visible timeline window
     * @param {Function} getLastInputTime - Returns the timestamp (ms) of the last zoom/scroll input
     * @param {Function} getNow - Returns the current timestamp (ms) on the same clock
     */
    constructor(viewport, getLastInputTime, getNow) {
        this.viewport = viewport;
        this.getLastInputTime = getLastInputTime;
        this.getNow = getNow;
        this._previousTime = 0;
    }

    /**
     * @param {number} time - Seek target in seconds
     */
    onSeek(time) {
        this._previousTime = time;
        this.viewport.reveal(time, FOLLOW_MARGIN_RATIO);
    }

    /**
     * @param {number} time - Current playback time in seconds
     */
    onTimeUpdate(time) {
        if (this.getNow() - this.getLastInputTime() < FOLLOW_INPUT_GRACE_MS) return;

        const previousTime = this._previousTime;
        this._previousTime = time;

        const windowEnd = this.viewport.endTime;
        if (previousTime < windowEnd && time >= windowEnd) {
            this.viewport.showAt(time, FOLLOW_MARGIN_RATIO);
        }
    }

    onStop() {
        this.onSeek(0);
    }
}
