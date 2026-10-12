/**
 * Shortcut Guide Module
 * Ruler-corner hint for timeline gestures and the "?" shortcut sheet
 */

const HINT_FADE_DURATION_MS = 200;
const ZOOM_LABEL_DECIMAL_LIMIT = 10;
const APPLE_PLATFORM_PATTERN = /Mac|iPhone|iPad/;

/**
 * Platform-specific key labels.
 * @returns {{modifier: string, shift: string}}
 */
export function detectKeyLabels() {
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    return APPLE_PLATFORM_PATTERN.test(platform)
        ? { modifier: '⌘', shift: '⇧' }
        : { modifier: 'Ctrl', shift: 'Shift' };
}

/**
 * Shortcut sheet content, grouped. Each row lists its keys and what they do.
 * @param {{modifier: string, shift: string}} keyLabels - Platform key labels
 * @returns {Array<{title: string, rows: Array<{keys: Array<string>, description: string}>}>}
 */
export function buildShortcutGroups(keyLabels) {
    const { modifier, shift } = keyLabels;
    return [
        {
            title: 'Playback',
            rows: [
                { keys: ['Space'], description: 'Play / pause' },
                { keys: ['Esc'], description: 'Stop' },
                { keys: ['←', '→'], description: 'Seek 5 s' },
                { keys: ['Tab', `${shift} Tab`], description: 'Next / previous section' },
                { keys: ['Home'], description: 'Jump to start' }
            ]
        },
        {
            title: 'Timeline',
            rows: [
                { keys: [`${modifier} + scroll`], description: 'Zoom around the pointer (or pinch)' },
                { keys: [`${shift} + scroll`], description: 'Scroll sideways (or swipe)' },
                { keys: ['=', '−'], description: 'Zoom in / out' },
                { keys: ['0'], description: 'Show the whole song' }
            ]
        },
        {
            title: 'Stems',
            rows: [
                { keys: ['1–9'], description: 'Mute stem' },
                { keys: [`${shift} 1–9`], description: 'Solo stem' },
                { keys: ['M', 'U'], description: 'Mute all / unmute all' }
            ]
        },
        {
            title: 'Help',
            rows: [
                { keys: ['?'], description: 'Show or hide this list' }
            ]
        }
    ];
}

/**
 * Text for the ruler-corner hint.
 * While learning, the hint teaches the next useful gesture; once learned, only the zoom level remains.
 * @param {{isFitted: boolean, isLearned: boolean, zoomFactor: number, keyLabels: {modifier: string, shift: string}}} state
 * @returns {{zoomLabel: string, instruction: string}}
 */
export function describeHint(state) {
    const zoomLabel = state.isFitted ? '' : formatZoomFactor(state.zoomFactor);

    if (state.isLearned) {
        return { zoomLabel, instruction: '' };
    }

    const instruction = state.isFitted
        ? `${state.keyLabels.modifier} + scroll to zoom`
        : `${state.keyLabels.shift} + scroll to move`;
    return { zoomLabel, instruction };
}

function formatZoomFactor(zoomFactor) {
    const rounded = zoomFactor < ZOOM_LABEL_DECIMAL_LIMIT
        ? Math.round(zoomFactor * 10) / 10
        : Math.round(zoomFactor);
    return `×${rounded}`;
}

/**
 * ShortcutGuide - owns the ruler-corner hint button and the shortcut sheet it opens.
 */
export class ShortcutGuide {
    /**
     * @param {HTMLButtonElement} hintButton - Button in the ruler corner
     * @param {HTMLElement} sheetHost - Positioned element the sheet is anchored in
     * @param {GestureProgress} gestureProgress - Learned-gesture tracker
     */
    constructor(hintButton, sheetHost, gestureProgress) {
        this.hintButton = hintButton;
        this.gestureProgress = gestureProgress;
        this.keyLabels = detectKeyLabels();

        this._zoomElement = this._appendSpan(hintButton, 'ruler-hint-zoom');
        this._instructionElement = this._appendSpan(hintButton, 'ruler-hint-text');
        this._appendSpan(hintButton, 'ruler-hint-badge').textContent = '?';

        this.sheet = this._createSheet();
        sheetHost.appendChild(this.sheet);

        this._handleOutsidePointer = this._handleOutsidePointer.bind(this);
        hintButton.addEventListener('click', () => this.toggle());
    }

    get isOpen() {
        return this.sheet.classList.contains('is-open');
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.sheet.classList.add('is-open');
        this.hintButton.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', this._handleOutsidePointer);
    }

    close() {
        this.sheet.classList.remove('is-open');
        this.hintButton.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', this._handleOutsidePointer);
    }

    /**
     * Refresh the hint for the current zoom level and learning progress.
     * @param {TimelineViewport} viewport - Visible timeline window
     */
    update(viewport) {
        const { zoomLabel, instruction } = describeHint({
            isFitted: viewport.isFitted,
            isLearned: this.gestureProgress.isLearned,
            zoomFactor: viewport.visibleDuration > 0 ? viewport.duration / viewport.visibleDuration : 1,
            keyLabels: this.keyLabels
        });

        this._zoomElement.textContent = zoomLabel;
        this._setInstruction(instruction);
    }

    _setInstruction(instruction) {
        if (this._instructionElement.textContent === instruction) return;

        this._instructionElement.textContent = instruction;
        this._instructionElement.animate([{ opacity: 0 }, { opacity: 1 }], HINT_FADE_DURATION_MS);
    }

    _handleOutsidePointer(event) {
        if (this.sheet.contains(event.target) || this.hintButton.contains(event.target)) return;
        this.close();
    }

    _appendSpan(parent, className) {
        const span = document.createElement('span');
        span.className = className;
        parent.appendChild(span);
        return span;
    }

    _createSheet() {
        const sheet = document.createElement('div');
        sheet.className = 'shortcut-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-label', 'Shortcuts');

        const header = document.createElement('div');
        header.className = 'shortcut-sheet-header';

        const title = document.createElement('span');
        title.className = 'shortcut-sheet-title';
        title.textContent = 'Shortcuts';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'shortcut-sheet-close';
        closeButton.setAttribute('aria-label', 'Close shortcuts');
        closeButton.textContent = '✕';
        closeButton.addEventListener('click', () => this.close());

        header.append(title, closeButton);
        sheet.appendChild(header);

        buildShortcutGroups(this.keyLabels).forEach(group => {
            sheet.appendChild(this._createGroup(group));
        });

        return sheet;
    }

    _createGroup(group) {
        const section = document.createElement('section');
        section.className = 'shortcut-group';

        const title = document.createElement('h3');
        title.className = 'shortcut-group-title';
        title.textContent = group.title;
        section.appendChild(title);

        group.rows.forEach(row => {
            const rowElement = document.createElement('div');
            rowElement.className = 'shortcut-row';

            const keys = document.createElement('span');
            keys.className = 'shortcut-keys';
            row.keys.forEach(key => {
                const kbd = document.createElement('kbd');
                kbd.textContent = key;
                keys.appendChild(kbd);
            });

            const description = document.createElement('span');
            description.className = 'shortcut-description';
            description.textContent = row.description;

            rowElement.append(keys, description);
            section.appendChild(rowElement);
        });

        return section;
    }
}
