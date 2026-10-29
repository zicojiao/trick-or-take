/** Track pointer ownership and keyboard ownership separately. Consumers should
 * compare .held before/after an event to decide whether the game needs an edge.
 */
export function createHoldInput() {
  let pointer = null;
  let space = false;
  return {
    get held() {return pointer !== null || space;},
    get pointerId() {return pointer;},
    pressPointer(id, isPrimary = true) {
      if (isPrimary !== true || pointer !== null || !Number.isSafeInteger(id) || id < 0) return false;
      pointer = id;
      return true;
    },
    releasePointer(id) {
      if (pointer === null || pointer !== id) return false;
      pointer = null;
      return true;
    },
    pressKey(code) {
      if (code !== 'Space' || space) return false;
      space = true;
      return true;
    },
    releaseKey(code) {
      if (code !== 'Space' || !space) return false;
      space = false;
      return true;
    },
    clear() {
      const changed = pointer !== null || space;
      pointer = null;
      space = false;
      return changed;
    },
  };
}

function validTime(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError('time must be a finite nonnegative number within the safe range');
  }
  return value;
}

/** A pausable local game clock driven only by caller-supplied RAF timestamps.
 * Timestamp gaps above 500 ms are treated as a stall, never as game progress.
 */
export function createLocalClock(initialMs = 0) {
  let elapsed = validTime(initialMs);
  let paused = false;
  let lastStamp = null;
  let anchorStamp = null;
  let anchorElapsed = elapsed;
  const snapshot = (autoPaused = false) => ({now: Math.floor(elapsed), autoPaused});
  const clearAnchor = () => {lastStamp = null; anchorStamp = null;};
  return {
    get now() {return Math.floor(elapsed);},
    get paused() {return paused;},
    tick(rafStampMs) {
      validTime(rafStampMs);
      if (paused) return snapshot();
      if (lastStamp === null) {
        lastStamp = anchorStamp = rafStampMs;
        anchorElapsed = elapsed;
        return snapshot();
      }
      // An older RAF timestamp must not move the reference backwards and cause
      // its elapsed interval to be counted again on the following frame.
      if (rafStampMs < lastStamp) return snapshot();
      if (rafStampMs - lastStamp > 500) {
        paused = true;
        clearAnchor();
        return snapshot(true);
      }
      // Use the segment's anchor rather than rounding each frame or repeatedly
      // summing frame differences. Fractional elapsed survives pause/resume.
      const next = validTime(anchorElapsed + (rafStampMs - anchorStamp));
      elapsed = next;
      lastStamp = rafStampMs;
      return snapshot();
    },
    pause() {
      const changed = !paused;
      paused = true;
      clearAnchor();
      return changed;
    },
    resume() {
      const changed = paused;
      paused = false;
      clearAnchor();
      return changed;
    },
    reset(nextInitialMs) {
      const next = validTime(nextInitialMs);
      elapsed = anchorElapsed = next;
      paused = false;
      clearAnchor();
    },
  };
}
