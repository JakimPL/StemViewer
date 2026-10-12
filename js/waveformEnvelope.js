/**
 * Waveform Envelope Module
 * Precomputed loudness data for fast RMS queries over arbitrary time windows
 */

const ENVELOPE_BLOCK_SAMPLES = 256;

/**
 * WaveformEnvelope - cumulative sums of squared samples per block.
 * Answers rmsBetween() in constant time: whole blocks come from the cumulative sums,
 * and the partial blocks at both window edges are summed sample by sample.
 */
export class WaveformEnvelope {
    /**
     * @param {Float32Array} samples - Channel samples
     * @param {number} sampleRate - Sample rate in Hz
     */
    constructor(samples, sampleRate) {
        this._samples = samples;
        this._sampleRate = sampleRate;
        this._blockPrefixSums = buildBlockPrefixSums(samples);
    }

    /**
     * Build an envelope from the first channel of a decoded audio buffer.
     * @param {AudioBuffer} buffer - Decoded audio buffer
     * @returns {WaveformEnvelope}
     */
    static fromAudioBuffer(buffer) {
        return new WaveformEnvelope(buffer.getChannelData(0), buffer.sampleRate);
    }

    /**
     * Root mean square of the samples between two times.
     * @param {number} startTime - Window start in seconds
     * @param {number} endTime - Window end in seconds
     * @returns {number} RMS amplitude, 0 for an empty window
     */
    rmsBetween(startTime, endTime) {
        const sampleCount = this._samples.length;
        const firstSample = clampIndex(Math.floor(startTime * this._sampleRate), sampleCount);
        const endSample = clampIndex(Math.floor(endTime * this._sampleRate), sampleCount);
        if (endSample <= firstSample) return 0;

        return Math.sqrt(this._sumOfSquares(firstSample, endSample) / (endSample - firstSample));
    }

    _sumOfSquares(firstSample, endSample) {
        const firstFullBlock = Math.ceil(firstSample / ENVELOPE_BLOCK_SAMPLES);
        const endFullBlock = Math.floor(endSample / ENVELOPE_BLOCK_SAMPLES);

        if (firstFullBlock >= endFullBlock) {
            return sumSquaresDirect(this._samples, firstSample, endSample);
        }

        return this._blockPrefixSums[endFullBlock] - this._blockPrefixSums[firstFullBlock]
            + sumSquaresDirect(this._samples, firstSample, firstFullBlock * ENVELOPE_BLOCK_SAMPLES)
            + sumSquaresDirect(this._samples, endFullBlock * ENVELOPE_BLOCK_SAMPLES, endSample);
    }
}

function buildBlockPrefixSums(samples) {
    const fullBlockCount = Math.floor(samples.length / ENVELOPE_BLOCK_SAMPLES);
    const prefixSums = new Float64Array(fullBlockCount + 1);

    for (let block = 0; block < fullBlockCount; block++) {
        const blockStart = block * ENVELOPE_BLOCK_SAMPLES;
        prefixSums[block + 1] = prefixSums[block]
            + sumSquaresDirect(samples, blockStart, blockStart + ENVELOPE_BLOCK_SAMPLES);
    }

    return prefixSums;
}

function sumSquaresDirect(samples, firstSample, endSample) {
    let sum = 0;
    for (let index = firstSample; index < endSample; index++) {
        sum += samples[index] * samples[index];
    }
    return sum;
}

function clampIndex(index, length) {
    return Math.min(Math.max(index, 0), length);
}
