import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WaveformEnvelope } from '../js/waveformEnvelope.js';

const SAMPLE_RATE = 1000;
const TOLERANCE = 1e-9;

function createSamples(length) {
    const samples = new Float32Array(length);
    for (let index = 0; index < length; index++) {
        samples[index] = Math.sin(index * 0.37) * (0.2 + (index % 97) / 200);
    }
    return samples;
}

function bruteForceRms(samples, startTime, endTime) {
    const first = Math.min(Math.max(Math.floor(startTime * SAMPLE_RATE), 0), samples.length);
    const end = Math.min(Math.max(Math.floor(endTime * SAMPLE_RATE), 0), samples.length);
    if (end <= first) return 0;

    let sum = 0;
    for (let index = first; index < end; index++) {
        sum += samples[index] * samples[index];
    }
    return Math.sqrt(sum / (end - first));
}

test('rmsBetween matches a brute-force RMS for many windows', () => {
    const samples = createSamples(10_000);
    const envelope = new WaveformEnvelope(samples, SAMPLE_RATE);
    const windows = [
        [0, 10], [0, 0.1], [0.1, 0.2], [0.255, 0.257], [0.256, 0.512],
        [1.234, 7.891], [3, 3.3], [9.9, 10], [0.5, 9.5]
    ];

    windows.forEach(([startTime, endTime]) => {
        const expected = bruteForceRms(samples, startTime, endTime);
        const actual = envelope.rmsBetween(startTime, endTime);
        assert.ok(Math.abs(actual - expected) < TOLERANCE, `${startTime}-${endTime}: ${actual} vs ${expected}`);
    });
});

test('rmsBetween clamps windows that extend past the audio', () => {
    const samples = createSamples(2_000);
    const envelope = new WaveformEnvelope(samples, SAMPLE_RATE);

    const actual = envelope.rmsBetween(-1, 5);

    assert.ok(Math.abs(actual - bruteForceRms(samples, 0, 2)) < TOLERANCE);
});

test('rmsBetween returns 0 for empty or out-of-range windows', () => {
    const envelope = new WaveformEnvelope(createSamples(2_000), SAMPLE_RATE);

    assert.equal(envelope.rmsBetween(1, 1), 0);
    assert.equal(envelope.rmsBetween(1.5, 1.2), 0);
    assert.equal(envelope.rmsBetween(3, 4), 0);
});

test('rmsBetween handles audio shorter than one block', () => {
    const samples = createSamples(100);
    const envelope = new WaveformEnvelope(samples, SAMPLE_RATE);

    const actual = envelope.rmsBetween(0.01, 0.09);

    assert.ok(Math.abs(actual - bruteForceRms(samples, 0.01, 0.09)) < TOLERANCE);
});
