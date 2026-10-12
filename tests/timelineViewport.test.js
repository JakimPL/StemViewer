import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TimelineViewport } from '../js/timelineViewport.js';

const DURATION = 240;
const SECONDS_PER_BAR = 240 / 138;
const EPSILON = 1e-9;

function createViewport() {
    return new TimelineViewport(DURATION, SECONDS_PER_BAR);
}

function assertClose(actual, expected) {
    assert.ok(Math.abs(actual - expected) < EPSILON, `expected ${expected}, got ${actual}`);
}

test('starts fitted to the whole timeline', () => {
    const viewport = createViewport();

    assert.equal(viewport.startTime, 0);
    assert.equal(viewport.endTime, DURATION);
    assert.ok(viewport.isFitted);
});

test('zoomAt keeps the anchor time under the anchor ratio', () => {
    const viewport = createViewport();

    viewport.zoomAt(100, 0.25, 4);

    assertClose(viewport.visibleDuration, 60);
    assertClose(viewport.timeToRatio(100), 0.25);
    assert.ok(!viewport.isFitted);
});

test('zoomAt clamps the window inside the timeline at both edges', () => {
    const viewport = createViewport();

    viewport.zoomAt(5, 0.9, 4);
    assert.equal(viewport.startTime, 0);
    assertClose(viewport.visibleDuration, 60);

    viewport.zoomAt(235, 0.1, 1);
    assertClose(viewport.endTime, DURATION);
    assertClose(viewport.visibleDuration, 60);
});

test('zoom stops at one bar and at the whole timeline', () => {
    const viewport = createViewport();

    viewport.zoomAt(120, 0.5, 1e6);
    assertClose(viewport.visibleDuration, SECONDS_PER_BAR);
    assertClose(viewport.timeToRatio(120), 0.5);

    viewport.zoomAt(120, 0.5, 1e-6);
    assert.equal(viewport.visibleDuration, DURATION);
    assert.equal(viewport.startTime, 0);
});

test('zoomAt ignores non-positive factors', () => {
    const viewport = createViewport();
    viewport.zoomAt(100, 0.5, 2);

    viewport.zoomAt(100, 0.5, 0);
    viewport.zoomAt(100, 0.5, -1);

    assertClose(viewport.visibleDuration, 120);
});

test('zoomAround uses the window centre when the anchor is off-screen', () => {
    const viewport = createViewport();
    viewport.zoomAt(60, 0.5, 4);

    viewport.zoomAround(200, 2);

    assertClose(viewport.ratioToTime(0.5), 60);
    assertClose(viewport.visibleDuration, 30);
});

test('panBy moves the window and clamps at both ends', () => {
    const viewport = createViewport();
    viewport.zoomAt(120, 0.5, 4);

    viewport.panBy(10);
    assertClose(viewport.startTime, 100);

    viewport.panBy(-1000);
    assert.equal(viewport.startTime, 0);

    viewport.panBy(1000);
    assertClose(viewport.endTime, DURATION);
});

test('panBy does nothing when fitted', () => {
    const viewport = createViewport();
    let changes = 0;
    viewport.onChange(() => changes++);

    viewport.panBy(30);

    assert.equal(viewport.startTime, 0);
    assert.equal(changes, 0);
});

test('fit shows the whole timeline', () => {
    const viewport = createViewport();
    viewport.zoomAt(120, 0.5, 8);

    viewport.fit();

    assert.ok(viewport.isFitted);
    assert.equal(viewport.startTime, 0);
});

test('reveal moves only when the time is off-screen and applies the margin', () => {
    const viewport = createViewport();
    viewport.zoomAt(30, 0, 4);

    viewport.reveal(40, 0.05);
    assertClose(viewport.startTime, 30);

    viewport.reveal(150, 0.05);
    assertClose(viewport.startTime, 150 - 0.05 * 60);
    assertClose(viewport.visibleDuration, 60);
});

test('reveal near the end clamps the window', () => {
    const viewport = createViewport();
    viewport.zoomAt(0, 0, 4);

    viewport.reveal(239, 0.05);

    assertClose(viewport.endTime, DURATION);
});

test('clipRange returns the visible part of a span or null', () => {
    const viewport = createViewport();
    viewport.zoomAt(100, 0, 4);

    assert.deepEqual(viewport.clipRange(110, 120), { start: 110, end: 120 });
    assert.deepEqual(viewport.clipRange(90, 110), { start: 100, end: 110 });
    assert.deepEqual(viewport.clipRange(150, 200), { start: 150, end: 160 });
    assert.equal(viewport.clipRange(0, 100), null);
    assert.equal(viewport.clipRange(160, 170), null);
});

test('pixel conversions round-trip and pixelToTime clamps to the window', () => {
    const viewport = createViewport();
    viewport.zoomAt(100, 0, 4);
    const width = 1200;

    assertClose(viewport.pixelToTime(viewport.timeToPixel(130, width), width), 130);
    assertClose(viewport.timeToPixel(100, width), 0);
    assertClose(viewport.timeToPixel(160, width), width);
    assertClose(viewport.pixelToTime(-50, width), 100);
    assertClose(viewport.pixelToTime(width + 50, width), 160);
});

test('onChange notifies once per change and unsubscribes', () => {
    const viewport = createViewport();
    let changes = 0;
    const unsubscribe = viewport.onChange(() => changes++);

    viewport.zoomAt(100, 0.5, 2);
    viewport.zoomAt(100, 0.5, 1);
    assert.equal(changes, 1);

    unsubscribe();
    viewport.fit();
    assert.equal(changes, 1);
});

test('a timeline shorter than one bar cannot zoom', () => {
    const viewport = new TimelineViewport(1, SECONDS_PER_BAR);

    viewport.zoomAt(0.5, 0.5, 4);

    assert.equal(viewport.visibleDuration, 1);
    assert.equal(viewport.startTime, 0);
});

test('an empty timeline stays at zero without dividing by zero', () => {
    const viewport = new TimelineViewport(0, SECONDS_PER_BAR);

    viewport.zoomAt(0, 0.5, 4);
    viewport.panBy(10);

    assert.equal(viewport.startTime, 0);
    assert.equal(viewport.visibleDuration, 0);
    assert.equal(viewport.timeToRatio(5), 0);
    assert.equal(viewport.pixelToTime(100, 800), 0);
});
