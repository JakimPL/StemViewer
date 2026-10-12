import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PlayheadFollower } from '../js/playheadFollower.js';
import { TimelineViewport } from '../js/timelineViewport.js';

const DURATION = 240;
const SECONDS_PER_BAR = 240 / 138;
const EPSILON = 1e-9;

function createFixture() {
    const viewport = new TimelineViewport(DURATION, SECONDS_PER_BAR);
    viewport.zoomAt(0, 0, 4);
    const clock = { now: 10_000, lastInput: -Infinity };
    const follower = new PlayheadFollower(viewport, () => clock.lastInput, () => clock.now);
    return { viewport, clock, follower };
}

function assertClose(actual, expected) {
    assert.ok(Math.abs(actual - expected) < EPSILON, `expected ${expected}, got ${actual}`);
}

test('playback pages forward when the playhead crosses the right edge', () => {
    const { viewport, follower } = createFixture();

    follower.onTimeUpdate(59.9);
    assert.equal(viewport.startTime, 0);

    follower.onTimeUpdate(60.01);
    assertClose(viewport.startTime, 60.01 - 0.05 * 60);
});

test('playback inside the window leaves the view alone', () => {
    const { viewport, follower } = createFixture();

    [10, 20, 30, 40, 50].forEach(time => follower.onTimeUpdate(time));

    assert.equal(viewport.startTime, 0);
});

test('a playhead the user scrolled away from is left until the next seek', () => {
    const { viewport, follower } = createFixture();
    follower.onTimeUpdate(100);
    viewport.showAt(0, 0);

    follower.onTimeUpdate(101);
    assert.equal(viewport.startTime, 0);

    follower.onSeek(150);
    assertClose(viewport.startTime, 150 - 0.05 * 60);
});

test('paging waits for the input grace period and then catches up', () => {
    const { viewport, clock, follower } = createFixture();
    follower.onTimeUpdate(59);
    clock.lastInput = clock.now - 200;

    follower.onTimeUpdate(61);
    assert.equal(viewport.startTime, 0);

    clock.now += 1000;
    follower.onTimeUpdate(62);
    assertClose(viewport.startTime, 62 - 0.05 * 60);
});

test('seek reveals off-screen targets only', () => {
    const { viewport, follower } = createFixture();

    follower.onSeek(30);
    assert.equal(viewport.startTime, 0);

    follower.onSeek(120);
    assertClose(viewport.startTime, 120 - 0.05 * 60);
});

test('stop reveals the start of the song', () => {
    const { viewport, follower } = createFixture();
    viewport.showAt(150, 0);

    follower.onStop();

    assert.equal(viewport.startTime, 0);
});
