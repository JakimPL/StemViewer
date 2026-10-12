import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GestureProgress, GESTURE_PAN, GESTURE_ZOOM } from '../js/gestureProgress.js';

function createMemoryStorage() {
    const items = new Map();
    return {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, value),
        items
    };
}

function createBlockedStorage() {
    const blocked = () => {
        throw new DOMException('Storage is disabled', 'SecurityError');
    };
    return { getItem: blocked, setItem: blocked };
}

test('gestures are learned after two zooms and two pans', () => {
    const progress = new GestureProgress(createMemoryStorage());

    progress.record(GESTURE_ZOOM);
    progress.record(GESTURE_ZOOM);
    progress.record(GESTURE_PAN);
    assert.equal(progress.isLearned, false);

    progress.record(GESTURE_PAN);
    assert.equal(progress.isLearned, true);
});

test('progress persists across visits', () => {
    const storage = createMemoryStorage();
    const firstVisit = new GestureProgress(storage);
    [GESTURE_ZOOM, GESTURE_ZOOM, GESTURE_PAN, GESTURE_PAN].forEach(kind => firstVisit.record(kind));

    const secondVisit = new GestureProgress(storage);

    assert.equal(secondVisit.isLearned, true);
});

test('blocked storage keeps counting for the current visit', () => {
    const progress = new GestureProgress(createBlockedStorage());

    [GESTURE_ZOOM, GESTURE_ZOOM, GESTURE_PAN, GESTURE_PAN].forEach(kind => progress.record(kind));

    assert.equal(progress.isLearned, true);
});

test('missing storage keeps counting for the current visit', () => {
    const progress = new GestureProgress(null);

    [GESTURE_ZOOM, GESTURE_ZOOM, GESTURE_PAN, GESTURE_PAN].forEach(kind => progress.record(kind));

    assert.equal(progress.isLearned, true);
});

test('corrupt or foreign stored values start from zero', () => {
    ['not json', '"text"', 'null', '{"zoom": -3, "pan": "many"}'].forEach(raw => {
        const storage = createMemoryStorage();
        storage.items.set('stemviewer.gestureProgress', raw);

        const progress = new GestureProgress(storage);

        assert.deepEqual(progress.counts, { zoom: 0, pan: 0 }, raw);
    });
});

test('counts stop growing once learned, so storage stays untouched', () => {
    const storage = createMemoryStorage();
    const progress = new GestureProgress(storage);
    [GESTURE_ZOOM, GESTURE_ZOOM].forEach(kind => progress.record(kind));
    const saved = storage.items.get('stemviewer.gestureProgress');

    progress.record(GESTURE_ZOOM);

    assert.equal(progress.counts.zoom, 2);
    assert.equal(storage.items.get('stemviewer.gestureProgress'), saved);
});
