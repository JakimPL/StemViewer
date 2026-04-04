/**
 * Cache Manager Module
 * Handles manifest-aware audio file caching in CacheStorage
 */

const AUDIO_CACHE_NAME = 'stemviewer-audio-v1';
const MANIFEST_SIGNATURE_KEY = 'stemviewer-manifest-signature';

/**
 * Compare the current manifest signature against the last persisted signature.
 * If they differ, reset audio cache contents so stale files are never reused,
 * then persist the new signature for future runs.
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
 * Resolve an audio file as ArrayBuffer, preferring CacheStorage when available.
 * Procedure:
 * 1) Try CacheStorage lookup.
 * 2) If missing, fetch from network.
 * 3) Attempt cache write as best-effort, but never fail playback if caching fails.
 * @param {string} url - Audio file URL
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchArrayBufferWithCache(url) {
    if (!_isCacheStorageAvailable()) {
        return _fetchArrayBuffer(url);
    }

    const cache = await caches.open(AUDIO_CACHE_NAME);
    const cachedArrayBuffer = await _getCachedArrayBuffer(cache, url);
    if (cachedArrayBuffer) return cachedArrayBuffer;

    return _fetchAndCacheArrayBuffer(cache, url);
}

/**
 * Clear all cached audio files for this app.
 * @returns {Promise<void>}
 */
export async function clearAudioCache() {
    if (!_isCacheStorageAvailable()) return;
    await caches.delete(AUDIO_CACHE_NAME);
}

function _isCacheStorageAvailable() {
    return typeof caches !== 'undefined';
}

async function _getCachedArrayBuffer(cache, url) {
    const cachedResponse = await cache.match(url);
    if (!cachedResponse) return null;

    console.log(`[Cache] Loaded from cache: ${url}`);
    return cachedResponse.arrayBuffer();
}

async function _fetchAndCacheArrayBuffer(cache, url) {
    const response = await _fetchResponseOrThrow(url);
    await _cacheResponseBestEffort(cache, url, response);
    return response.arrayBuffer();
}

async function _fetchResponseOrThrow(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    return response;
}

async function _cacheResponseBestEffort(cache, url, response) {
    try {
        await cache.put(url, response.clone());
        console.log(`[Cache] Fetched and cached new file: ${url}`);
    } catch (error) {
        console.warn(`[Cache] Failed to cache audio response: ${url}`, error);
    }
}

async function _fetchArrayBuffer(url) {
    const response = await _fetchResponseOrThrow(url);
    return response.arrayBuffer();
}

function _buildManifestSignature(manifest) {
    const relevantManifestData = {
        song: manifest.song,
        files: manifest.files,
        stems: manifest.stems,
        sections: manifest.sections
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
