import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildShortcutGroups, describeHint } from '../js/shortcutGuide.js';

const WINDOWS_LABELS = { modifier: 'Ctrl', shift: 'Shift' };
const MAC_LABELS = { modifier: '⌘', shift: '⇧' };

test('whole song visible while learning teaches zoom', () => {
    assert.deepEqual(
        describeHint({ isFitted: true, isLearned: false, zoomFactor: 1, keyLabels: WINDOWS_LABELS }),
        { zoomLabel: '', instruction: 'Ctrl + scroll to zoom' }
    );
    assert.equal(
        describeHint({ isFitted: true, isLearned: false, zoomFactor: 1, keyLabels: MAC_LABELS }).instruction,
        '⌘ + scroll to zoom'
    );
});

test('zoomed in while learning teaches scrolling and shows the zoom level', () => {
    assert.deepEqual(
        describeHint({ isFitted: false, isLearned: false, zoomFactor: 4, keyLabels: WINDOWS_LABELS }),
        { zoomLabel: '×4', instruction: 'Shift + scroll to move' }
    );
});

test('once learned only the zoom level remains', () => {
    assert.deepEqual(
        describeHint({ isFitted: false, isLearned: true, zoomFactor: 4, keyLabels: WINDOWS_LABELS }),
        { zoomLabel: '×4', instruction: '' }
    );
    assert.deepEqual(
        describeHint({ isFitted: true, isLearned: true, zoomFactor: 1, keyLabels: WINDOWS_LABELS }),
        { zoomLabel: '', instruction: '' }
    );
});

test('zoom level keeps one decimal below ×10 and rounds above', () => {
    const label = (zoomFactor) =>
        describeHint({ isFitted: false, isLearned: true, zoomFactor, keyLabels: WINDOWS_LABELS }).zoomLabel;

    assert.equal(label(1.26), '×1.3');
    assert.equal(label(2), '×2');
    assert.equal(label(9.94), '×9.9');
    assert.equal(label(37.6), '×38');
});

test('shortcut sheet uses platform key labels', () => {
    const keys = buildShortcutGroups(MAC_LABELS).flatMap(group => group.rows.flatMap(row => row.keys));

    assert.ok(keys.includes('⌘ + scroll'));
    assert.ok(keys.includes('⇧ + scroll'));
    assert.ok(keys.includes('?'));
});
