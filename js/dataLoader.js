/**
 * Data Loader Module
 * Handles loading and validating manifest.json
 */

import { barToSeconds, secondsToBar } from './utils.js';
import { syncAudioCacheWithManifest } from './cacheManager.js';

const STEM_DEFAULT_VOLUME_DB = 0;

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
        await syncAudioCacheWithManifest(manifest);

        return manifest;
    } catch (error) {
        console.error('Error loading manifest:', error);
        throw error;
    }
}

/**
 * Validate and normalize manifest data before the rest of the app consumes it.
 * Procedure:
 * 1) Validate required top-level blocks and reject legacy fields.
 * 2) Validate song metadata.
 * 3) Normalize/validate stems (defaults, types, startup mute/solo resolution).
 * 4) Validate section shape and compute missing time/bar equivalents.
 * @param {Object} manifest - Manifest object to validate
 * @throws {Error} If validation fails
 */
function validateManifest(manifest) {
    _assertRequiredTopLevelProperties(manifest);
    _assertNoLegacyTopLevelDefaults(manifest);
    _validateSongMetadata(manifest.song);
    _normalizeAndValidateStems(manifest.stems);
    _validateSections(manifest.sections);
    processSections(manifest);
}

function _assertRequiredTopLevelProperties(manifest) {
    if (!manifest.song) {
        throw new Error('Manifest missing "song" property');
    }

    if (!manifest.files) {
        throw new Error('Manifest missing "files" property');
    }

    if (!Array.isArray(manifest.stems)) {
        throw new Error('Manifest missing "stems" array');
    }

    if (!Array.isArray(manifest.sections)) {
        throw new Error('Manifest missing "sections" array');
    }
}

function _assertNoLegacyTopLevelDefaults(manifest) {
    if (
        manifest.defaultMutedStems !== undefined ||
        manifest.defaultSoloStems !== undefined ||
        manifest.defaultStemVolumesDb !== undefined
    ) {
        throw new Error('Top-level default dictionaries are no longer supported. Use per-stem fields: mute, solo, volume.');
    }
}

function _validateSongMetadata(song) {
    const requiredSongFields = ['title', 'artist', 'duration', 'bpm'];
    for (const field of requiredSongFields) {
        if (!song[field]) {
            throw new Error(`Song metadata missing required field: ${field}`);
        }
    }
}

function _normalizeAndValidateStems(stems) {
    stems.forEach((stem, index) => {
        _normalizeAndValidateStem(stem, index);
    });

    stems.sort((a, b) => a.order - b.order);
}

function _normalizeAndValidateStem(stem, index) {
    if (!stem.id || !stem.name || !stem.file) {
        throw new Error(`Stem at index ${index} missing required fields (id, name, file)`);
    }

    if (stem.mute === undefined) {
        stem.mute = false;
    }
    if (typeof stem.mute !== 'boolean') {
        throw new Error(`Stem "${stem.id}" field "mute" must be boolean`);
    }

    if (stem.solo === undefined) {
        stem.solo = false;
    }
    if (typeof stem.solo !== 'boolean') {
        throw new Error(`Stem "${stem.id}" field "solo" must be boolean`);
    }

    if (stem.volume === undefined) {
        stem.volume = STEM_DEFAULT_VOLUME_DB;
    }
    if (typeof stem.volume !== 'number' || !Number.isFinite(stem.volume)) {
        throw new Error(`Stem "${stem.id}" field "volume" must be a finite number (dB)`);
    }

    if (stem.solo) {
        stem.mute = false;
    }

    if (!stem.color) {
        console.warn(`Stem "${stem.name}" missing color, using default`);
        stem.color = '#888888';
    }

    if (stem.order === undefined) {
        stem.order = index;
    }
}

function _validateSections(sections) {
    sections.forEach((section, index) => {
        if (!section.name) {
            throw new Error(`Section at index ${index} missing name`);
        }

        const hasBars = _sectionHasBars(section);
        const hasTime = _sectionHasTime(section);

        if (!hasBars && !hasTime) {
            throw new Error(`Section "${section.name}" must have either startBar/endBar OR startTime/endTime`);
        }
    });
}

/**
 * Normalize section coordinate systems (bars and seconds).
 * If bars exist, bars are authoritative and times are recomputed from bars.
 * If only times exist, bars are derived from times.
 * @param {Object} manifest - Manifest object
 */
function processSections(manifest) {
    const { song } = manifest;
    const bpm = song.bpm;
    const timeSignature = song.timeSignature || "4/4";

    manifest.sections.forEach(section => {
        const hasBars = _sectionHasBars(section);
        const hasTime = _sectionHasTime(section);

        if (hasBars) {
            section.startTime = barToSeconds(section.startBar, bpm, timeSignature);
            section.endTime = barToSeconds(section.endBar, bpm, timeSignature);
        } else if (!hasBars && hasTime) {
            section.startBar = secondsToBar(section.startTime, bpm, timeSignature);
            section.endBar = secondsToBar(section.endTime, bpm, timeSignature);
        }
    });
}

function _sectionHasBars(section) {
    return section.startBar !== undefined && section.endBar !== undefined;
}

function _sectionHasTime(section) {
    return section.startTime !== undefined && section.endTime !== undefined;
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
