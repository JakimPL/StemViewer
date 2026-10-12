import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SongMetrics } from '../js/songMetrics.js';

const WIDTH = 1000;
const MIN_SPACING = 80;

function createMetrics(timeSignature) {
    return new SongMetrics({
        song: { duration: 240, bpm: 138, timeSignature },
        sections: []
    });
}

test('whole-song view picks a bar interval with enough spacing', () => {
    const metrics = createMetrics('4/4');

    const { intervalBeats, markers } = metrics.generateBeatMarkers(0, 240, WIDTH, MIN_SPACING);

    assert.equal(intervalBeats % 4, 0);
    const pixelsPerMarker = WIDTH / (240 / (intervalBeats * metrics.secondsPerBeat));
    assert.ok(pixelsPerMarker >= MIN_SPACING);
    assert.equal(markers[0].beatIndex, 0);
    assert.equal(markers[0].bar, 1);
});

test('one-bar view steps down to single beats', () => {
    const metrics = createMetrics('4/4');
    const start = metrics.barToTime(10);

    const { intervalBeats, markers } = metrics.generateBeatMarkers(start, start + metrics.secondsPerBar, WIDTH, MIN_SPACING);

    assert.equal(intervalBeats, 1);
    assert.deepEqual(markers.map(marker => [marker.bar, marker.beat]), [[11, 1], [11, 2], [11, 3], [11, 4], [12, 1]]);
});

test('half-bar interval is offered in even meters only', () => {
    const fourFour = createMetrics('4/4');
    const threeFour = createMetrics('3/4');
    const pixelsForTwoBeatsAt80 = (seconds) => (MIN_SPACING / 2) * (seconds / fourFour.secondsPerBeat) * 1.01;

    assert.equal(fourFour.calculateBeatInterval(10, pixelsForTwoBeatsAt80(10), MIN_SPACING), 2);
    assert.equal(threeFour.calculateBeatInterval(10, pixelsForTwoBeatsAt80(10), MIN_SPACING), 3);
});

test('markers start at the first interval boundary inside the window', () => {
    const metrics = createMetrics('4/4');
    const start = metrics.barToTime(9.5);
    const end = metrics.barToTime(17.5);

    const { intervalBeats, markers } = metrics.generateBeatMarkers(start, end, WIDTH, MIN_SPACING);

    assert.ok(markers[0].timeInSeconds >= start);
    assert.ok(markers[0].timeInSeconds - start < intervalBeats * metrics.secondsPerBeat);
    markers.forEach(marker => assert.equal(marker.beatIndex % intervalBeats, 0));
    assert.ok(markers.at(-1).timeInSeconds <= end);
});

test('markers stop at the end of the song', () => {
    const metrics = createMetrics('4/4');

    const { markers } = metrics.generateBeatMarkers(230, 260, WIDTH, MIN_SPACING);

    assert.ok(markers.at(-1).timeInSeconds <= 240);
});
