/**
 * Waveform Renderer Module
 * Handles all canvas-based waveform visualization
 */

import { calculateSectionPositions } from './utils.js';

// Waveform rendering configuration
// Adjust this value to change waveform detail level:
// - Lower values (1-2) = more detail, more bars, denser waveform
// - Higher values (4-8) = less detail, fewer bars, sparser waveform
const WAVEFORM_PIXELS_PER_BAR = 4;

/**
 * Initialize canvas and draw placeholder waveform
 */
function initializeCanvas(manifest, audioEngine) {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;

    const waveformContent = canvas.parentElement;
    const rect = waveformContent.getBoundingClientRect();

    // Get sidebar width
    const sidebar = document.querySelector('.stems-sidebar');
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 0;

    // Calculate available space for canvas
    canvas.width = rect.width - sidebarWidth;
    canvas.height = rect.height;

    // Draw placeholder waveform using stem colors from manifest
    drawPlaceholderWaveform(canvas, manifest, audioEngine);
}

/**
 * Draw waveform on canvas (uses real audio data if available)
 * @param {HTMLCanvasElement} canvas - Canvas element
 */
function drawPlaceholderWaveform(canvas, manifest, audioEngine) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!manifest) return;

    // Calculate bar count based on canvas width and granularity
    const barCount = Math.floor(canvas.width / WAVEFORM_PIXELS_PER_BAR);
    const barWidth = canvas.width / barCount;
    const stemColors = manifest.stems.map(s => s.color);

    // Get actual heights from DOM
    const stemItems = document.querySelectorAll('.stem-control-item');
    const stemHeights = Array.from(stemItems).map(item => item.offsetHeight);

    // Check if audio is decoded and we can use real waveform data
    const useRealData = audioEngine && audioEngine.isAudioReady;
    const stemBuffers = useRealData ? getAudioBuffers(audioEngine) : null;

    for (let i = 0; i < barCount; i++) {
        let currentY = 0;

        stemColors.forEach((color, stemIndex) => {
            const stemHeight = stemHeights[stemIndex] || 0;

            // Get amplitude - use real data if available, otherwise show placeholder
            let amplitude;
            if (stemBuffers && stemBuffers[stemIndex]) {
                amplitude = getAmplitudeAtPosition(stemBuffers[stemIndex], i / barCount);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.7;
            } else {
                // Placeholder: flat gray bars at 30% height
                amplitude = 0.3;
                ctx.fillStyle = '#444';
                ctx.globalAlpha = 0.3;
            }

            const height = stemHeight * amplitude * 0.5;
            const y = currentY + (stemHeight - height) / 2;

            ctx.fillRect(i * barWidth, y, barWidth - 1, height);

            currentY += stemHeight;
        });
    }

    ctx.globalAlpha = 1;

    // If no real data, show instruction text
    if (!stemBuffers) {
        ctx.fillStyle = '#666';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Click Play or click anywhere on the timeline to load waveforms', canvas.width / 2, canvas.height / 2);
    }

    // Draw section dividers based on manifest sections
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;

    const sectionsWithPos = calculateSectionPositions(manifest.sections, manifest.song.duration);
    sectionsWithPos.forEach(section => {
        const x = (section.leftPercent / 100) * canvas.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    });
}

/**
 * Get audio buffers from audio engine
 * @returns {Array<AudioBuffer>} Array of audio buffers for each stem
 */
function getAudioBuffers(audioEngine) {
    if (!audioEngine) return null;

    const buffers = [];
    audioEngine.stems.forEach(stem => {
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
 */
function getAmplitudeAtPosition(buffer, position) {
    const channelData = buffer.getChannelData(0); // Use first channel (mono or left)
    const sampleCount = channelData.length;

    // Calculate which samples to analyze for this position
    // We want to downsample the buffer to match our bar count
    const canvas = document.getElementById('waveform-canvas');
    const barCount = Math.floor(canvas.width / WAVEFORM_PIXELS_PER_BAR);
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

export { initializeCanvas, drawPlaceholderWaveform, WAVEFORM_PIXELS_PER_BAR };
