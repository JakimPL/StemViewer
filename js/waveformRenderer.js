/**
 * Waveform Renderer Module
 * Handles all canvas-based waveform visualization
 */

const CANVAS_HORIZONTAL_OFFSET_PX = 1;
const WAVEFORM_BACKGROUND_COLOR = '#1e1e1e';
const WAVEFORM_STEM_ALPHA = 0.7;
const WAVEFORM_MUTED_STEM_ALPHA = 0.3;
const WAVEFORM_MUTED_STEM_COLOR = '#6d6d6d';
const WAVEFORM_PLACEHOLDER_ALPHA = 0.3;
const WAVEFORM_PLACEHOLDER_AMPLITUDE = 0.3;
const WAVEFORM_HEIGHT_SCALE = 0.5;
const WAVEFORM_TEXT_COLOR = '#666';
const WAVEFORM_TEXT_FONT = '14px Arial';
const WAVEFORM_RMS_SCALE = 3.5;

const GRID_RULER_MIN_SPACING_PX = 80;
const GRID_DENSITY_MULTIPLIER = 4;
const GRID_MAJOR_LINE_COLOR = 'rgba(160, 170, 180, 0.30)';
const GRID_MINOR_LINE_COLOR = 'rgba(110, 120, 130, 0.16)';
const GRID_MAJOR_LINE_WIDTH = 1.2;
const GRID_MINOR_LINE_WIDTH = 1;

const SECTION_DIVIDER_UNDERLAY_COLOR = 'rgba(0, 0, 0, 0.55)';
const SECTION_DIVIDER_UNDERLAY_WIDTH = 5;
const SECTION_DIVIDER_COLOR = '#8fa1ad';
const SECTION_DIVIDER_WIDTH = 2.5;

/**
 * WaveformRenderer class - Manages canvas-based waveform visualization
 */
export class WaveformRenderer {
    /**
     * Create a WaveformRenderer
     * @param {HTMLCanvasElement} canvasElement - Canvas element to render on
     * @param {Object} manifest - Song manifest with stems and sections
     * @param {SongMetrics} songMetrics - Song metrics helper
     * @param {number} pixelsPerBar - Waveform detail level (default: 4)
     */
    constructor(canvasElement, manifest, songMetrics, pixelsPerBar = 4) {
        this.canvas = canvasElement;
        this.manifest = manifest;
        this.songMetrics = songMetrics;
        this.pixelsPerBar = pixelsPerBar;
        this.canvasOffsetX = CANVAS_HORIZONTAL_OFFSET_PX;
        this.audioEngine = null;
        this.ctx = canvasElement ? canvasElement.getContext('2d') : null;
    }

    /**
     * Set audio engine reference
     * @param {AudioEngine} audioEngine - Audio engine instance
     */
    setAudioEngine(audioEngine) {
        this.audioEngine = audioEngine;
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

        // Render after resize
        this.render();
    }

    /**
     * Render the waveform
     */
    render() {
        if (!this.canvas || !this.ctx || !this.manifest) return;

        // Clear canvas
        this.ctx.fillStyle = WAVEFORM_BACKGROUND_COLOR;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Calculate bar count based on canvas width and granularity
        const barCount = Math.floor(this.canvas.width / this.pixelsPerBar);
        const barWidth = this.canvas.width / barCount;
        const stemColors = this.manifest.stems.map(s => s.color);

        // Get actual heights from DOM
        const stemItems = document.querySelectorAll('.stem-control-item');
        const stemHeights = Array.from(stemItems).map(item => item.offsetHeight);

        // Check if audio is decoded and we can use real waveform data
        const useRealData = this.audioEngine && this.audioEngine.isAudioReady;
        const stemBuffers = useRealData ? this._getAudioBuffers() : null;

        // Render waveform bars
        for (let i = 0; i < barCount; i++) {
            let currentY = 0;

            stemColors.forEach((color, stemIndex) => {
                const stemHeight = stemHeights[stemIndex] || 0;
                const stemId = this.manifest.stems[stemIndex]?.id;
                const isStemMuted = Boolean(stemId && this.audioEngine?.stems.get(stemId)?.isMuted);

                // Get amplitude - use real data if available, otherwise show placeholder
                let amplitude;
                if (stemBuffers && stemBuffers[stemIndex]) {
                    amplitude = this._getAmplitudeAtPosition(
                        stemBuffers[stemIndex],
                        i / barCount,
                        this.manifest.song.duration,
                        barCount
                    );
                    this.ctx.fillStyle = isStemMuted ? WAVEFORM_MUTED_STEM_COLOR : color;
                    this.ctx.globalAlpha = isStemMuted ? WAVEFORM_MUTED_STEM_ALPHA : WAVEFORM_STEM_ALPHA;
                } else {
                    // Placeholder: flat gray bars at 30% height
                    amplitude = WAVEFORM_PLACEHOLDER_AMPLITUDE;
                    this.ctx.fillStyle = '#444';
                    this.ctx.globalAlpha = WAVEFORM_PLACEHOLDER_ALPHA;
                }

                const height = stemHeight * amplitude * WAVEFORM_HEIGHT_SCALE;
                const y = currentY + (stemHeight - height) / 2;

                this.ctx.fillRect(i * barWidth + this.canvasOffsetX, y, barWidth - 1, height);

                currentY += stemHeight;
            });
        }

        this.ctx.globalAlpha = 1;

        // Draw adaptive bar grid (4x denser than bottom ruler where possible)
        this._drawBarGrid();

        // If no real data, show instruction text
        if (!stemBuffers) {
            this.ctx.fillStyle = WAVEFORM_TEXT_COLOR;
            this.ctx.font = WAVEFORM_TEXT_FONT;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(
                'Click Play or click anywhere on the timeline to load waveforms',
                this.canvas.width / 2 + this.canvasOffsetX,
                this.canvas.height / 2
            );
        }

        // Draw section dividers
        this._drawSectionDividers();
    }

    /**
     * Get time position from X coordinate on canvas
     * @param {number} x - X coordinate on canvas
     * @returns {number} Time in seconds
     */
    getTimeAtPosition(x) {
        if (!this.canvas || !this.manifest) return 0;

        const adjustedX = Math.max(0, Math.min(this.canvas.width, x - this.canvasOffsetX));
        const percentage = adjustedX / this.canvas.width;
        return percentage * this.manifest.song.duration;
    }

    /**
     * Draw section dividers on waveform
     * @private
     */
    _drawSectionDividers() {
        if (!this.manifest || !this.songMetrics) return;

        const sectionsWithPos = this.songMetrics.getSectionsWithPositions();

        sectionsWithPos.forEach(section => {
            const x = (section.leftPercent / 100) * this.canvas.width + this.canvasOffsetX;

            // Underlay for contrast against bright waveform areas
            this.ctx.strokeStyle = SECTION_DIVIDER_UNDERLAY_COLOR;
            this.ctx.lineWidth = SECTION_DIVIDER_UNDERLAY_WIDTH;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();

            // Foreground section divider
            this.ctx.strokeStyle = SECTION_DIVIDER_COLOR;
            this.ctx.lineWidth = SECTION_DIVIDER_WIDTH;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        });
    }

    /**
     * Draw vertical bar grid lines on waveform area
     * Grid targets 4x more lines than bottom ruler while staying adaptive.
     * @private
     */
    _drawBarGrid() {
        if (!this.songMetrics) return;

        const rulerMarkers = this.songMetrics.generateBarMarkers(this.canvas.width, GRID_RULER_MIN_SPACING_PX);
        if (rulerMarkers.length === 0) return;

        const rulerInterval = rulerMarkers.length > 1
            ? Math.max(1, rulerMarkers[1].barNumber - rulerMarkers[0].barNumber)
            : 1;

        // 4x denser than ruler, but keep whole-bar spacing and minimum 1 bar.
        const gridInterval = Math.max(1, Math.floor(rulerInterval / GRID_DENSITY_MULTIPLIER));

        for (let bar = 0; bar <= this.songMetrics.totalBars; bar += gridInterval) {
            const timeInSeconds = this.songMetrics.barToTime(bar);
            if (timeInSeconds > this.songMetrics.duration) break;

            const x = (this.songMetrics.timeToPercent(timeInSeconds) / 100) * this.canvas.width + this.canvasOffsetX;
            const isRulerLine = bar % rulerInterval === 0;

            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.strokeStyle = isRulerLine ? GRID_MAJOR_LINE_COLOR : GRID_MINOR_LINE_COLOR;
            this.ctx.lineWidth = isRulerLine ? GRID_MAJOR_LINE_WIDTH : GRID_MINOR_LINE_WIDTH;
            this.ctx.stroke();
        }
    }

    /**
     * Get audio buffers from audio engine
     * @returns {Array<AudioBuffer>} Array of audio buffers for each stem
     * @private
     */
    _getAudioBuffers() {
        if (!this.audioEngine) return null;

        const buffers = [];
        this.manifest.stems.forEach(manifestStem => {
            const stem = this.audioEngine.stems.get(manifestStem.id);
            if (stem && stem.buffer) {
                buffers.push(stem.buffer);
            }
        });

        return buffers.length > 0 ? buffers : null;
    }

    /**
     * Calculate amplitude at a specific position in the audio buffer
     * @param {AudioBuffer} buffer - Audio buffer
     * @param {number} position - Position (0-1) in the buffer
     * @param {number} timelineDurationSeconds - Manifest timeline duration in seconds
     * @param {number} barCount - Number of rendered bars across the timeline
     * @returns {number} Amplitude (0-1)
     * @private
     */
    _getAmplitudeAtPosition(buffer, position, timelineDurationSeconds, barCount) {
        const channelData = buffer.getChannelData(0); // Use first channel (mono or left)
        const sampleCount = channelData.length;
        const sampleRate = buffer.sampleRate;

        // Map visualization position to absolute manifest timeline time.
        // Playback seeks by absolute seconds, so waveform sampling must do the same.
        if (!timelineDurationSeconds || timelineDurationSeconds <= 0 || !barCount || barCount <= 0) {
            return 0;
        }

        const timelineTimeSeconds = position * timelineDurationSeconds;
        const secondsPerVisualBar = timelineDurationSeconds / barCount;

        const startSample = Math.floor(timelineTimeSeconds * sampleRate);
        const samplesPerBar = Math.max(1, Math.floor(secondsPerVisualBar * sampleRate));

        if (startSample >= sampleCount) {
            return 0;
        }

        const endSample = Math.min(startSample + samplesPerBar, sampleCount);

        // Calculate RMS (root mean square) amplitude for this window
        let sum = 0;
        let count = 0;
        for (let i = startSample; i < endSample; i++) {
            const sample = channelData[i];
            sum += sample * sample;
            count++;
        }

        if (count === 0) return 0;

        const rms = Math.sqrt(sum / count);

        // Normalize and apply scaling for better visibility
        // RMS values are typically 0-0.3 for normal audio, so we scale up
        const normalized = Math.min(rms * WAVEFORM_RMS_SCALE, 1.0);

        return normalized;
    }
}
