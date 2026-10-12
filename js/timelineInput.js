/**
 * Timeline Input Module
 * Translates wheel, trackpad and pinch gestures over the waveform area into timeline zoom and scroll
 */

const WHEEL_LINE_HEIGHT_PX = 16;
const WHEEL_ZOOM_SENSITIVITY = 0.004;
const WHEEL_ZOOM_MAX_DELTA_PX = 50;
const WHEEL_AXIS_LOCK_TIMEOUT_MS = 150;

const DELTA_MODE_LINE = 1;
const DELTA_MODE_PAGE = 2;

const AXIS_HORIZONTAL = 'horizontal';
const AXIS_VERTICAL = 'vertical';

/**
 * TimelineInput - gesture handling for the waveform area.
 *   Ctrl/⌘ + wheel and trackpad pinch: zoom around the pointer (browser page zoom is suppressed)
 *   Shift + wheel: scroll the timeline sideways
 *   Horizontal trackpad swipe: scroll the timeline sideways
 *   Plain vertical wheel: native vertical scrolling of the stem list
 */
export class TimelineInput {
    /**
     * @param {HTMLElement} container - Element receiving gestures (the whole waveform area)
     * @param {HTMLCanvasElement} canvas - Waveform canvas defining the timeline's screen extent
     * @param {TimelineViewport} viewport - Visible timeline window to drive
     */
    constructor(container, canvas, viewport) {
        this.container = container;
        this.canvas = canvas;
        this.viewport = viewport;
        this.lastInputTime = -Infinity;

        this._wheelAxis = null;
        this._lastWheelTime = -Infinity;
        this._gestureScale = 1;

        this._handleWheel = this._handleWheel.bind(this);
        this._handleGestureStart = this._handleGestureStart.bind(this);
        this._handleGestureChange = this._handleGestureChange.bind(this);
        this._preventDefault = (event) => event.preventDefault();
    }

    enable() {
        this.container.addEventListener('wheel', this._handleWheel, { passive: false });
        // Safari reports trackpad pinch as non-standard gesture events instead of ctrl + wheel.
        this.container.addEventListener('gesturestart', this._handleGestureStart);
        this.container.addEventListener('gesturechange', this._handleGestureChange);
        this.container.addEventListener('gestureend', this._preventDefault);
    }

    _handleWheel(event) {
        // deltaMode must be read before the deltas, or Firefox converts them to pixels on its own terms.
        const scale = this._deltaScale(event.deltaMode);
        const deltaX = event.deltaX * scale;
        const deltaY = event.deltaY * scale;

        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            this._zoomAtClientX(event.clientX, Math.exp(-WHEEL_ZOOM_SENSITIVITY * clampDelta(deltaY)));
            return;
        }

        if (event.shiftKey) {
            event.preventDefault();
            this._panByPixels(deltaX || deltaY);
            return;
        }

        if (this._lockWheelAxis(event.timeStamp, deltaX, deltaY) === AXIS_HORIZONTAL) {
            event.preventDefault();
            this._panByPixels(deltaX);
        }
    }

    _handleGestureStart(event) {
        event.preventDefault();
        this._gestureScale = 1;
    }

    _handleGestureChange(event) {
        event.preventDefault();
        if (event.scale <= 0) return;

        this._zoomAtClientX(event.clientX, event.scale / this._gestureScale);
        this._gestureScale = event.scale;
    }

    _deltaScale(deltaMode) {
        if (deltaMode === DELTA_MODE_LINE) return WHEEL_LINE_HEIGHT_PX;
        if (deltaMode === DELTA_MODE_PAGE) return this.container.clientWidth;
        return 1;
    }

    /**
     * Keep one axis for the whole wheel gesture, so a trackpad swipe that wobbles
     * between axes keeps scrolling the same way.
     */
    _lockWheelAxis(timeStamp, deltaX, deltaY) {
        if (this._wheelAxis === null || timeStamp - this._lastWheelTime > WHEEL_AXIS_LOCK_TIMEOUT_MS) {
            this._wheelAxis = Math.abs(deltaX) > Math.abs(deltaY) ? AXIS_HORIZONTAL : AXIS_VERTICAL;
        }
        this._lastWheelTime = timeStamp;
        return this._wheelAxis;
    }

    _panByPixels(deltaPixels) {
        const width = this.canvas.clientWidth;
        if (width <= 0 || deltaPixels === 0) return;

        this._markInput();
        this.viewport.panBy((deltaPixels / width) * this.viewport.visibleDuration);
    }

    _zoomAtClientX(clientX, factor) {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width <= 0) return;

        this._markInput();
        const anchorRatio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
        this.viewport.zoomAt(this.viewport.ratioToTime(anchorRatio), anchorRatio, factor);
    }

    _markInput() {
        this.lastInputTime = performance.now();
    }
}

function clampDelta(delta) {
    return Math.min(Math.max(delta, -WHEEL_ZOOM_MAX_DELTA_PX), WHEEL_ZOOM_MAX_DELTA_PX);
}
