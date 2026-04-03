/**
 * Data Loader Module
 * Handles loading and validating manifest.json
 */

import { barToSeconds, secondsToBar } from './utils.js';

/**
 * Load manifest data from JSON file
 * @param {string} path - Path to manifest.json
 * @returns {Promise<Object>} Parsed manifest data
 */
export async function loadManifest(path = 'data/manifest.json') {
    try {
        const response = await fetch(path);

        if (!response.ok) {
            throw new Error(`Failed to load manifest: ${response.status} ${response.statusText}`);
        }

        const manifest = await response.json();
        validateManifest(manifest);

        return manifest;
    } catch (error) {
        console.error('Error loading manifest:', error);
        throw error;
    }
}

/**
 * Validate manifest structure
 * @param {Object} manifest - Manifest object to validate
 * @throws {Error} If validation fails
 */
function validateManifest(manifest) {
    // Check required top-level properties
    if (!manifest.song) {
        throw new Error('Manifest missing "song" property');
    }

    if (!manifest.files) {
        throw new Error('Manifest missing "files" property');
    }

    if (!manifest.stems || !Array.isArray(manifest.stems)) {
        throw new Error('Manifest missing "stems" array');
    }

    if (!manifest.sections || !Array.isArray(manifest.sections)) {
        throw new Error('Manifest missing "sections" array');
    }

    // Validate optional default muted stems map
    if (manifest.defaultMutedStems === undefined) {
        manifest.defaultMutedStems = {};
    } else if (
        manifest.defaultMutedStems === null ||
        typeof manifest.defaultMutedStems !== 'object' ||
        Array.isArray(manifest.defaultMutedStems)
    ) {
        throw new Error('Manifest "defaultMutedStems" must be an object map of stemId -> boolean');
    }

    Object.entries(manifest.defaultMutedStems).forEach(([stemId, isMuted]) => {
        if (typeof isMuted !== 'boolean') {
            throw new Error(`Manifest "defaultMutedStems.${stemId}" must be boolean`);
        }
    });

    // Validate song metadata
    const requiredSongFields = ['title', 'artist', 'duration', 'bpm'];
    for (const field of requiredSongFields) {
        if (!manifest.song[field]) {
            throw new Error(`Song metadata missing required field: ${field}`);
        }
    }

    // Validate stems
    manifest.stems.forEach((stem, index) => {
        if (!stem.id || !stem.name || !stem.file) {
            throw new Error(`Stem at index ${index} missing required fields (id, name, file)`);
        }
        if (!stem.color) {
            console.warn(`Stem "${stem.name}" missing color, using default`);
            stem.color = '#888888';
        }
        if (stem.order === undefined) {
            stem.order = index;
        }
    });

    // Sort stems by order
    manifest.stems.sort((a, b) => a.order - b.order);

    // Warn about default mute entries for unknown stems
    const stemIds = new Set(manifest.stems.map(stem => stem.id));
    Object.keys(manifest.defaultMutedStems).forEach(stemId => {
        if (!stemIds.has(stemId)) {
            console.warn(`defaultMutedStems contains unknown stem id: "${stemId}"`);
        }
    });

    // Validate sections
    manifest.sections.forEach((section, index) => {
        if (!section.name) {
            throw new Error(`Section at index ${index} missing name`);
        }

        // Check that at least one of (bars or time) is provided
        const hasBars = section.startBar !== undefined && section.endBar !== undefined;
        const hasTime = section.startTime !== undefined && section.endTime !== undefined;

        if (!hasBars && !hasTime) {
            throw new Error(`Section "${section.name}" must have either startBar/endBar OR startTime/endTime`);
        }

        // If both are provided, we'll prefer bars and recalculate time
        // If only one is provided, we'll calculate the other
        // This will be done in a separate processing step after validation
    });

    // Process sections: calculate missing time or bar values
    processSections(manifest);
}

/**
 * Process sections to calculate missing time or bar values
 * If both bars and time are provided, prefer bars (recalculate time from bars)
 * If only one is provided, calculate the other
 * @param {Object} manifest - Manifest object
 */
function processSections(manifest) {
    const { song } = manifest;
    const bpm = song.bpm;
    const timeSignature = song.timeSignature || "4/4";

    manifest.sections.forEach(section => {
        const hasBars = section.startBar !== undefined && section.endBar !== undefined;
        const hasTime = section.startTime !== undefined && section.endTime !== undefined;

        if (hasBars) {
            // Both provided: prefer bars, recalculate time
            section.startTime = barToSeconds(section.startBar, bpm, timeSignature);
            section.endTime = barToSeconds(section.endBar, bpm, timeSignature);
        } else if (!hasBars && hasTime) {
            // Only time provided: calculate bars
            section.startBar = secondsToBar(section.startTime, bpm, timeSignature);
            section.endBar = secondsToBar(section.endTime, bpm, timeSignature);
        }
    });
}

/**
 * Get base path for audio files
 * @returns {string} Base path (e.g., 'data/')
 */
export function getBasePath() {
    return 'data/';
}

/**
 * Resolve full path for an audio file
 * @param {string} relativePath - Relative path from manifest
 * @returns {string} Full path to audio file
 */
export function resolveAudioPath(relativePath) {
    return `${getBasePath()}${relativePath}`;
}
