## Plan: Audio Engine Implementation

**TL;DR:** Build `AudioEngine` class using Web Audio API that loads multiple stem AudioBuffers, plays them with synchronized `start()` calls, uses GainNodes for individual mute/solo during playback, calculates proper time tracking, and supports both multi-stem and mix-only modes.

**Steps**

1. **AudioEngine class setup** - AudioContext creation, state management (isPlaying, currentTime, stems Map, mix node)
2. **Audio loading** - `loadStem()`, `loadMix()`, `loadFromManifest()` methods using fetch + decodeAudioData (*parallel for all stems*)
3. **Synchronized playback** - `play()` creates source nodes, connects source→gainNode→destination, calls `start(when, offset)` with SAME offset on all sources for sync
4. **Time tracking** - Calculate from `audioContext.currentTime - startTime + pausedOffset`, expose `getCurrentTime()` (*parallel with 3*)
5. **Pause/resume/stop** - Store `pausedAt` position, stop sources, recreate on resume with correct offset
6. **Mute/Solo logic** - `setMute(stemId)`, `setSolo(stemId)` update state, `_recalculateGains()` applies logic: if ANY soloed → only soloed audible, else respect mute (*depends on 3*)
7. **Mode switching** - `setMixMode(bool)` toggles between multi-stem and single mix file
8. **Seek functionality** - `seek(time)` stops sources, restarts at new offset, preserves mute/solo
9. **Event system** - Emit 'timeupdate', 'ended', 'statechange', 'loadprogress' for UI integration
10. **Wire to UI** - Connect transport buttons to engine methods, sync mute/solo buttons with engine state (*depends on 1-9*)

**Relevant files**
- `js/audioEngine.js` - new AudioEngine class module
- main.js - instantiate engine, wire events to UI

**Verification**
1. Play all stems → verify synchronized (no drift after minutes)
2. Mute stem during playback → instant silence without restart
3. Solo vocals → only vocals audible, unmute others
4. Pause at 30s, resume → continues from 30s exactly
5. Seek to 90s → all stems jump to 90s in sync
6. Mix mode → single file plays instead of stems

**Decisions**
- Use `AudioBufferSourceNode` (one-shot, create new on each play)
- GainNodes remain persistent, sources are disposable
- Mute/Solo: Solo takes precedence, if any soloed → only soloed audible
- Time tracking: `audioContext.currentTime - startTime + offset`
- Synchronization: Same `offset` parameter in all `start()` calls

**Critical Implementation Detail**
```js
// CORRECT sync approach:
const offset = this.pausedAt || 0;
this.stems.forEach(stem => {
  stem.source = this.audioContext.createBufferSource();
  stem.source.buffer = stem.buffer;
  stem.source.connect(stem.gainNode);
  stem.source.start(0, offset); // Same offset on all!
});
this.startTime = this.audioContext.currentTime - offset;
```
