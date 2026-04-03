/**
 * Cache Manager Module
 * Handles manifest-aware audio file caching in CacheStorage
 */

const AUDIO_CACHE_NAME = 'stemviewer-audio-v1';
const MANIFEST_SIGNATURE_KEY = 'stemviewer-manifest-signature';

/**
 * Synchronize audio cache lifecycle with current manifest content.
 * If manifest changed, clear cached audio files and store new signature.
 * @param {Object} manifest - Current manifest object
 * @returns {Promise<{cacheReset: boolean}>}
 */
export async function syncAudioCacheWithManifest(manifest) {
    const signature = _buildManifestSignature(manifest);
    const previousSignature = localStorage.getItem(MANIFEST_SIGNATURE_KEY);

    if (previousSignature !== signature) {
        await clearAudioCache();
        localStorage.setItem(MANIFEST_SIGNATURE_KEY, signature);
        console.log('[Cache] Manifest changed. Cleared audio cache. New files will be cached.');
        return { cacheReset: true };
    }

    console.log('[Cache] Manifest unchanged. Reusing cached audio files when available.');
    return { cacheReset: false };
}

/**
 * Fetch an audio file as ArrayBuffer with CacheStorage fallback.
 * @param {string} url - Audio file URL
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchArrayBufferWithCache(url) {
    // Fallback for environments without CacheStorage
    if (typeof caches === 'undefined') {
        return _fetchArrayBuffer(url);
    }

    const cache = await caches.open(AUDIO_CACHE_NAME);
    const cachedResponse = await cache.match(url);

    if (cachedResponse) {
        console.log(`[Cache] Loaded from cache: ${url}`);
        return cachedResponse.arrayBuffer();
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    // Best effort cache write - app should still work if this fails
    try {
        await cache.put(url, response.clone());
        console.log(`[Cache] Fetched and cached new file: ${url}`);
    } catch (error) {
        console.warn(`[Cache] Failed to cache audio response: ${url}`, error);
    }

    return response.arrayBuffer();
}

/**
 * Clear all cached audio files for this app.
 * @returns {Promise<void>}
 */
export async function clearAudioCache() {
    if (typeof caches === 'undefined') return;
    await caches.delete(AUDIO_CACHE_NAME);
}

async function _fetchArrayBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    return response.arrayBuffer();
}

function _buildManifestSignature(manifest) {
    const relevantManifestData = {
        song: manifest.song,
        files: manifest.files,
        stems: manifest.stems,
        sections: manifest.sections,
        defaultMutedStems: manifest.defaultMutedStems || {}
    };

    return _stableStringify(relevantManifestData);
}

function _stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(item => _stableStringify(item)).join(',')}]`;
    }

    const keys = Object.keys(value).sort();
    const pairs = keys.map(key => `${JSON.stringify(key)}:${_stableStringify(value[key])}`);
    return `{${pairs.join(',')}}`;
}
