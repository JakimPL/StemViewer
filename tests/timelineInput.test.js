import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TimelineInput } from '../js/timelineInput.js';
import { TimelineViewport } from '../js/timelineViewport.js';

const DURATION = 240;
const SECONDS_PER_BAR = 240 / 138;
const CANVAS_LEFT = 200;
const CANVAS_WIDTH = 1000;
const EPSILON = 1e-9;

function createFixture() {
    const listeners = new Map();
    const container = {
        clientWidth: 1200,
        addEventListener: (type, listener) => listeners.set(type, listener)
    };
    const canvas = {
        clientWidth: CANVAS_WIDTH,
        getBoundingClientRect: () => ({ left: CANVAS_LEFT, width: CANVAS_WIDTH })
    };
    const viewport = new TimelineViewport(DURATION, SECONDS_PER_BAR);
    const input = new TimelineInput(container, canvas, viewport);
    input.enable();

    const dispatch = (type, fields) => {
        const event = {
            deltaMode: 0, deltaX: 0, deltaY: 0, clientX: CANVAS_LEFT, timeStamp: 0,
            ctrlKey: false, metaKey: false, shiftKey: false, defaultPrevented: false,
            ...fields
        };
        event.preventDefault = () => { event.defaultPrevented = true; };
        listeners.get(type)(event);
        return event;
    };

    return { viewport, input, dispatch };
}

function assertClose(actual, expected) {
    assert.ok(Math.abs(actual - expected) < EPSILON, `expected ${expected}, got ${actual}`);
}

test('ctrl + wheel zooms around the pointer and blocks page zoom', () => {
    const { viewport, dispatch } = createFixture();
    const anchorRatio = 0.25;

    const event = dispatch('wheel', { ctrlKey: true, deltaY: -100, clientX: CANVAS_LEFT + anchorRatio * CANVAS_WIDTH });

    assert.ok(event.defaultPrevented);
    assert.ok(viewport.visibleDuration < DURATION);
    assertClose(viewport.timeToRatio(anchorRatio * DURATION), anchorRatio);
});

test('a mouse notch and a capped delta zoom by the same amount', () => {
    const notch = createFixture();
    const capped = createFixture();

    notch.dispatch('wheel', { ctrlKey: true, deltaY: -100 });
    capped.dispatch('wheel', { ctrlKey: true, deltaY: -50 });

    assertClose(notch.viewport.visibleDuration, capped.viewport.visibleDuration);
});

test('zoom anchor outside the canvas is clamped to its edge', () => {
    const { viewport, dispatch } = createFixture();

    dispatch('wheel', { metaKey: true, deltaY: -50, clientX: 0 });

    assert.equal(viewport.startTime, 0);
});

test('shift + wheel pans by the vertical delta when no horizontal delta is given', () => {
    const { viewport, dispatch } = createFixture();
    viewport.zoomAt(0, 0, 4);

    const event = dispatch('wheel', { shiftKey: true, deltaY: 100 });

    assert.ok(event.defaultPrevented);
    assertClose(viewport.startTime, (100 / CANVAS_WIDTH) * 60);
});

test('line-mode deltas are converted to pixels', () => {
    const { viewport, dispatch } = createFixture();
    viewport.zoomAt(0, 0, 4);

    dispatch('wheel', { shiftKey: true, deltaMode: 1, deltaY: 3 });

    assertClose(viewport.startTime, (48 / CANVAS_WIDTH) * 60);
});

test('plain vertical wheel is left to native scrolling', () => {
    const { viewport, input, dispatch } = createFixture();
    viewport.zoomAt(0, 0, 4);

    const event = dispatch('wheel', { deltaY: 100 });

    assert.ok(!event.defaultPrevented);
    assert.equal(viewport.startTime, 0);
    assert.equal(input.lastInputTime, -Infinity);
});

test('a horizontal swipe keeps panning while it wobbles, until the gesture pauses', () => {
    const { viewport, dispatch } = createFixture();
    viewport.zoomAt(0, 0, 4);

    dispatch('wheel', { deltaX: 40, deltaY: 5, timeStamp: 0 });
    const wobble = dispatch('wheel', { deltaX: 10, deltaY: 30, timeStamp: 50 });
    assert.ok(wobble.defaultPrevented);
    assertClose(viewport.startTime, (50 / CANVAS_WIDTH) * 60);

    const nextGesture = dispatch('wheel', { deltaX: 10, deltaY: 30, timeStamp: 400 });
    assert.ok(!nextGesture.defaultPrevented);
});

test('Safari pinch zooms by the relative scale change', () => {
    const { viewport, dispatch } = createFixture();

    const start = dispatch('gesturestart', {});
    dispatch('gesturechange', { scale: 2 });
    dispatch('gesturechange', { scale: 4 });

    assert.ok(start.defaultPrevented);
    assertClose(viewport.visibleDuration, DURATION / 4);
});

test('pan and zoom record the input time for follow suppression', () => {
    const { input, dispatch } = createFixture();

    dispatch('wheel', { ctrlKey: true, deltaY: -50 });

    assert.ok(input.lastInputTime > -Infinity);
});
