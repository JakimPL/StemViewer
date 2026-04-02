/**
 * Utility Functions
 * Time formatting, bar calculations, etc.
 */

/**
 * Format seconds to MM:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string (e.g., "3:45")
 */
export function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) {
        return '0:00';
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate bar number from time and BPM
 * @param {number} timeInSeconds - Current time in seconds
 * @param {number} bpm - Beats per minute
 * @param {string} timeSignature - Time signature (e.g., "4/4")
 * @returns {number} Bar number (1-indexed)
 */
export function calculateBarNumber(timeInSeconds, bpm, timeSignature = "4/4") {
    const [beatsPerBar] = timeSignature.split('/').map(Number);
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * beatsPerBar;
    const barNumber = Math.floor(timeInSeconds / secondsPerBar) + 1;
    return barNumber;
}

/**
 * Calculate time in seconds from bar number
 * @param {number} barNumber - Bar number (0-indexed, can be fractional)
 * @param {number} bpm - Beats per minute
 * @param {string} timeSignature - Time signature (e.g., "4/4")
 * @returns {number} Time in seconds
 */
export function barToSeconds(barNumber, bpm, timeSignature = "4/4") {
    const [beatsPerBar] = timeSignature.split('/').map(Number);
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * beatsPerBar;
    return barNumber * secondsPerBar;
}

/**
 * Calculate bar number from time in seconds
 * @param {number} timeInSeconds - Time in seconds
 * @param {number} bpm - Beats per minute
 * @param {string} timeSignature - Time signature (e.g., "4/4")
 * @returns {number} Bar number (0-indexed, can be fractional)
 */
export function secondsToBar(timeInSeconds, bpm, timeSignature = "4/4") {
    const [beatsPerBar] = timeSignature.split('/').map(Number);
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * beatsPerBar;
    return timeInSeconds / secondsPerBar;
}

/**
 * Calculate section positions as percentages for layout
 * @param {Array} sections - Array of section objects
 * @param {number} totalDuration - Total duration in seconds
 * @returns {Array} Sections with added position and width percentages
 */
export function calculateSectionPositions(sections, totalDuration) {
    return sections.map(section => ({
        ...section,
        leftPercent: (section.startTime / totalDuration) * 100,
        widthPercent: ((section.endTime - section.startTime) / totalDuration) * 100
    }));
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
