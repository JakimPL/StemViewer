/**
 * Waveform Renderer Module
 * Handles all canvas-based waveform visualization
 */

import { calculateSectionPositions } from './utils.js';

/**
 * WaveformRenderer class - Manages canvas-based waveform visualization
 */
export class WaveformRenderer {
    /**
     * Create a WaveformRenderer
     * @param {HTMLCanvasElement} canvasElement - Canvas element to render on
     * @param {Object} manifest - Song manifest with stems and sections
     * @param {number} pixelsPerBar - Waveform detail level (default: 4)
     */
    constructor(canvasElement, manifest, pixelsPerBar = 4) {
        this.canvas = canvasElement;
        this.manifest = manifest;
        this.pixelsPerBar = pixelsPerBar;
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

        const waveformContent = this.canvas.parentElement;
        const rect = waveformContent.getBoundingClientRect();

        // Get sidebar width
        const sidebar = document.querySelector('.stems-sidebar');
        const sidebarWidth = sidebar ? sidebar.offsetWidth : 0;

        // Calculate available space for canvas
        this.canvas.width = rect.width - sidebarWidth;
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
        this.ctx.fillStyle = '#1e1e1e';
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

                // Get amplitude - use real data if available, otherwise show placeholder
                let amplitude;
                if (stemBuffers && stemBuffers[stemIndex]) {
                    amplitude = this._getAmplitudeAtPosition(stemBuffers[stemIndex], i / barCount);
                    this.ctx.fillStyle = color;
                    this.ctx.globalAlpha = 0.7;
                } else {
                    // Placeholder: flat gray bars at 30% height
                    amplitude = 0.3;
                    this.ctx.fillStyle = '#444';
                    this.ctx.globalAlpha = 0.3;
                }

                const height = stemHeight * amplitude * 0.5;
                const y = currentY + (stemHeight - height) / 2;

                this.ctx.fillRect(i * barWidth, y, barWidth - 1, height);

                currentY += stemHeight;
            });
        }

        this.ctx.globalAlpha = 1;

        // If no real data, show instruction text
        if (!stemBuffers) {
            this.ctx.fillStyle = '#666';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(
                'Click Play or click anywhere on the timeline to load waveforms',
                this.canvas.width / 2,
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

        const percentage = x / this.canvas.width;
        return percentage * this.manifest.song.duration;
    }

    /**
     * Draw section dividers on waveform
     * @private
     */
    _drawSectionDividers() {
        if (!this.manifest) return;

        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 2;

        const sectionsWithPos = calculateSectionPositions(
            this.manifest.sections,
            this.manifest.song.duration
        );

        sectionsWithPos.forEach(section => {
            const x = (section.leftPercent / 100) * this.canvas.width;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        });
    }

    /**
     * Get audio buffers from audio engine
     * @returns {Array<AudioBuffer>} Array of audio buffers for each stem
     * @private
     */
    _getAudioBuffers() {
        if (!this.audioEngine) return null;

        const buffers = [];
        this.audioEngine.stems.forEach(stem => {
            if (stem.buffer) {
                buffers.push(stem.buffer);
            }
        });

        return buffers.length > 0 ? buffers : null;
    }

    /**
     * Calculate amplitude at a specific position in the audio buffer
     * @param {AudioBuffer} buffer - Audio buffer
     * @param {number} position - Position (0-1) in the buffer
     * @returns {number} Amplitude (0-1)
     * @private
     */
    _getAmplitudeAtPosition(buffer, position) {
        const channelData = buffer.getChannelData(0); // Use first channel (mono or left)
        const sampleCount = channelData.length;

        // Calculate which samples to analyze for this position
        // We want to downsample the buffer to match our bar count
        const barCount = Math.floor(this.canvas.width / this.pixelsPerBar);
        const samplesPerBar = Math.floor(sampleCount / barCount);
        const startSample = Math.floor(position * sampleCount);
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
        const normalized = Math.min(rms * 3.5, 1.0);

        return normalized;
    }
}
