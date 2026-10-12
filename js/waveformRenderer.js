/**
 * Waveform Renderer Module
 * Handles all canvas-based waveform visualization
 */

import { WaveformEnvelope } from './waveformEnvelope.js';

const WAVEFORM_COLUMN_WIDTH_PX = 4;
const WAVEFORM_COLUMN_GAP_PX = 1;
const WAVEFORM_BACKGROUND_COLOR = '#1e1e1e';
const WAVEFORM_STEM_ALPHA = 0.7;
const WAVEFORM_MUTED_STEM_ALPHA = 0.3;
const WAVEFORM_MUTED_STEM_COLOR = '#6d6d6d';
const WAVEFORM_PLACEHOLDER_COLOR = '#444';
const WAVEFORM_PLACEHOLDER_ALPHA = 0.3;
const WAVEFORM_PLACEHOLDER_AMPLITUDE = 0.3;
const WAVEFORM_HEIGHT_SCALE = 0.5;
const WAVEFORM_TEXT_COLOR = '#666';
const WAVEFORM_TEXT_FONT = '14px Arial';
const WAVEFORM_RMS_SCALE = 3.5;
const WAVEFORM_DEFAULT_OVERLAY_TEXT = 'Click Play or click anywhere on the timeline to load waveforms';

const GRID_RULER_MIN_SPACING_PX = 80;
const GRID_DENSITY_MULTIPLIER = 4;
const GRID_MIN_SPACING_PX = GRID_RULER_MIN_SPACING_PX / GRID_DENSITY_MULTIPLIER;
const GRID_MAJOR_LINE_COLOR = 'rgba(160, 170, 180, 0.30)';
const GRID_MINOR_LINE_COLOR = 'rgba(110, 120, 130, 0.16)';
const GRID_MAJOR_LINE_WIDTH = 1.2;
const GRID_MINOR_LINE_WIDTH = 1;

const SECTION_DIVIDER_UNDERLAY_COLOR = 'rgba(0, 0, 0, 0.55)';
const SECTION_DIVIDER_UNDERLAY_WIDTH = 5;
const SECTION_DIVIDER_COLOR = '#8fa1ad';
const SECTION_DIVIDER_WIDTH = 2.5;

/**
 * WaveformRenderer class - Manages canvas-based waveform visualization of the visible timeline window
 */
export class WaveformRenderer {
    /**
     * Create a WaveformRenderer
     * @param {HTMLCanvasElement} canvasElement - Canvas element to render on
     * @param {Object} manifest - Song manifest with stems and sections
     * @param {SongMetrics} songMetrics - Song metrics helper
     * @param {TimelineViewport} viewport - Visible timeline window
     */
    constructor(canvasElement, manifest, songMetrics, viewport) {
        this.canvas = canvasElement;
        this.manifest = manifest;
        this.songMetrics = songMetrics;
        this.viewport = viewport;
        this.audioEngine = null;
        this.envelopes = new Map();
        this.ctx = canvasElement ? canvasElement.getContext('2d') : null;
        this.overlayText = WAVEFORM_DEFAULT_OVERLAY_TEXT;
    }

    /**
     * Set audio engine reference
     * @param {AudioEngine} audioEngine - Audio engine instance
     */
    setAudioEngine(audioEngine) {
        this.audioEngine = audioEngine;
        this.refreshEnvelopes();
    }

    /**
     * Build loudness envelopes for stems decoded since the last call.
     */
    refreshEnvelopes() {
        if (!this.audioEngine) return;

        this.manifest.stems.forEach(manifestStem => {
            const stem = this.audioEngine.stems.get(manifestStem.id);
            if (stem?.buffer && !this.envelopes.has(manifestStem.id)) {
                this.envelopes.set(manifestStem.id, WaveformEnvelope.fromAudioBuffer(stem.buffer));
            }
        });
    }

    /**
     * Set overlay text shown while waveform uses placeholder bars.
     * @param {string} text - Overlay status/instruction text
     */
    setOverlayText(text) {
        this.overlayText = text || WAVEFORM_DEFAULT_OVERLAY_TEXT;
        this.render();
    }

    /**
     * Initialize canvas dimensions and render
     */
    resize() {
        if (!this.canvas) return;

        const canvasWrapper = this.canvas.parentElement;
        const rect = canvasWrapper.getBoundingClientRect();

        // Wrapper already excludes sidebar width.
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        this.render();
    }

    /**
     * Render the waveform
     */
    render() {
        if (!this.canvas || !this.ctx || !this.manifest) return;

        this.ctx.fillStyle = WAVEFORM_BACKGROUND_COLOR;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const useRealData = Boolean(this.audioEngine?.isAudioReady) && this.envelopes.size > 0;

        this._drawColumns(useRealData);
        this._drawBarGrid();

        if (!useRealData) {
            this._drawOverlayText();
        }

        this._drawSectionDividers();
    }

    /**
     * Get time position from X coordinate on canvas
     * @param {number} x - X coordinate on canvas
     * @returns {number} Time in seconds
     */
    getTimeAtPosition(x) {
        if (!this.canvas) return 0;
        return this.viewport.pixelToTime(x, this.canvas.width);
    }

    /**
     * Draw one row of waveform columns per stem. Columns are anchored to absolute time,
     * so panning keeps each column's content stable.
     * @param {boolean} useRealData - Draw loudness from envelopes, or placeholder bars
     * @private
     */
    _drawColumns(useRealData) {
        const width = this.canvas.width;
        const columnCount = width / WAVEFORM_COLUMN_WIDTH_PX;
        if (columnCount <= 0 || this.viewport.visibleDuration <= 0) return;

        const secondsPerColumn = this.viewport.visibleDuration / columnCount;
        const firstColumn = Math.floor(this.viewport.startTime / secondsPerColumn);
        const endTime = Math.min(this.viewport.endTime, this.songMetrics.duration);
        const endColumn = Math.ceil(endTime / secondsPerColumn);

        const stemHeights = Array.from(document.querySelectorAll('.stem-control-item'))
            .map(item => item.offsetHeight);

        let rowTop = 0;
        this.manifest.stems.forEach((manifestStem, stemIndex) => {
            const rowHeight = stemHeights[stemIndex] || 0;
            const envelope = useRealData ? this.envelopes.get(manifestStem.id) : null;
            this._applyStemStyle(manifestStem, Boolean(envelope));

            for (let column = firstColumn; column < endColumn; column++) {
                const columnStart = column * secondsPerColumn;
                const columnEnd = Math.min(columnStart + secondsPerColumn, this.songMetrics.duration);
                const amplitude = envelope
                    ? Math.min(envelope.rmsBetween(columnStart, columnEnd) * WAVEFORM_RMS_SCALE, 1.0)
                    : WAVEFORM_PLACEHOLDER_AMPLITUDE;

                const x = this.viewport.timeToPixel(columnStart, width);
                const columnWidth = this.viewport.timeToPixel(columnEnd, width) - x;
                const height = rowHeight * amplitude * WAVEFORM_HEIGHT_SCALE;
                const y = rowTop + (rowHeight - height) / 2;

                this.ctx.fillRect(x, y, Math.max(columnWidth - WAVEFORM_COLUMN_GAP_PX, 1), height);
            }

            rowTop += rowHeight;
        });

        this.ctx.globalAlpha = 1;
    }

    _applyStemStyle(manifestStem, hasEnvelope) {
        if (!hasEnvelope) {
            this.ctx.fillStyle = WAVEFORM_PLACEHOLDER_COLOR;
            this.ctx.globalAlpha = WAVEFORM_PLACEHOLDER_ALPHA;
            return;
        }

        const isStemMuted = Boolean(this.audioEngine?.stems.get(manifestStem.id)?.isMuted);
        this.ctx.fillStyle = isStemMuted ? WAVEFORM_MUTED_STEM_COLOR : manifestStem.color;
        this.ctx.globalAlpha = isStemMuted ? WAVEFORM_MUTED_STEM_ALPHA : WAVEFORM_STEM_ALPHA;
    }

    _drawOverlayText() {
        this.ctx.fillStyle = WAVEFORM_TEXT_COLOR;
        this.ctx.font = WAVEFORM_TEXT_FONT;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.overlayText, this.canvas.width / 2, this.canvas.height / 2);
    }

    /**
     * Draw section dividers on waveform
     * @private
     */
    _drawSectionDividers() {
        if (!this.manifest.sections) return;

        this.manifest.sections.forEach(section => {
            if (!this.viewport.isVisible(section.startTime)) return;

            const x = this.viewport.timeToPixel(section.startTime, this.canvas.width);
            this._drawVerticalLine(x, SECTION_DIVIDER_UNDERLAY_COLOR, SECTION_DIVIDER_UNDERLAY_WIDTH);
            this._drawVerticalLine(x, SECTION_DIVIDER_COLOR, SECTION_DIVIDER_WIDTH);
        });
    }

    /**
     * Draw vertical grid lines on waveform area, about 4x denser than the bottom ruler.
     * Lines that coincide with ruler markers are drawn stronger.
     * @private
     */
    _drawBarGrid() {
        const width = this.canvas.width;
        const { startTime, endTime, visibleDuration } = this.viewport;
        const rulerInterval = this.songMetrics.calculateBeatInterval(visibleDuration, width, GRID_RULER_MIN_SPACING_PX);
        const { markers } = this.songMetrics.generateBeatMarkers(startTime, endTime, width, GRID_MIN_SPACING_PX);

        markers.forEach(marker => {
            const x = this.viewport.timeToPixel(marker.timeInSeconds, width);
            const isRulerLine = marker.beatIndex % rulerInterval === 0;
            this._drawVerticalLine(
                x,
                isRulerLine ? GRID_MAJOR_LINE_COLOR : GRID_MINOR_LINE_COLOR,
                isRulerLine ? GRID_MAJOR_LINE_WIDTH : GRID_MINOR_LINE_WIDTH
            );
        });
    }

    _drawVerticalLine(x, color, lineWidth) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.canvas.height);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.stroke();
    }
}
