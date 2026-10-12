/**
 * Gesture Progress Module
 * Remembers how often the user has zoomed and scrolled the timeline, across visits
 */

export const GESTURE_ZOOM = 'zoom';
export const GESTURE_PAN = 'pan';

const GESTURE_PROGRESS_STORAGE_KEY = 'stemviewer.gestureProgress';
const GESTURE_LEARNED_COUNT = 2;

/**
 * GestureProgress - counts zoom and pan gestures and decides when the user has learned them.
 * Counts persist in the given Storage. With a null storage, or one the browser blocks,
 * counting works for the current visit only.
 */
export class GestureProgress {
    /**
     * @param {Storage|null} storage - Persistent storage, usually window.localStorage
     */
    constructor(storage) {
        this.storage = storage;
        this.counts = this._load();
    }

    /**
     * True once both zoom and pan have been used often enough.
     * @returns {boolean}
     */
    get isLearned() {
        return this.counts[GESTURE_ZOOM] >= GESTURE_LEARNED_COUNT
            && this.counts[GESTURE_PAN] >= GESTURE_LEARNED_COUNT;
    }

    /**
     * Count one gesture.
     * @param {string} kind - GESTURE_ZOOM or GESTURE_PAN
     */
    record(kind) {
        if (this.counts[kind] >= GESTURE_LEARNED_COUNT) return;

        this.counts[kind] += 1;
        this._save();
    }

    _load() {
        const counts = { [GESTURE_ZOOM]: 0, [GESTURE_PAN]: 0 };
        const stored = this._readStoredCounts();
        if (!stored) return counts;

        [GESTURE_ZOOM, GESTURE_PAN].forEach(kind => {
            if (Number.isInteger(stored[kind]) && stored[kind] > 0) {
                counts[kind] = stored[kind];
            }
        });
        return counts;
    }

    _readStoredCounts() {
        if (!this.storage) return null;

        let raw;
        try {
            raw = this.storage.getItem(GESTURE_PROGRESS_STORAGE_KEY);
        } catch (error) {
            if (error instanceof DOMException) return null;
            throw error;
        }
        if (raw === null) return null;

        try {
            return JSON.parse(raw);
        } catch (error) {
            if (error instanceof SyntaxError) return null;
            throw error;
        }
    }

    _save() {
        if (!this.storage) return;

        try {
            this.storage.setItem(GESTURE_PROGRESS_STORAGE_KEY, JSON.stringify(this.counts));
        } catch (error) {
            if (!(error instanceof DOMException)) throw error;
        }
    }
}
