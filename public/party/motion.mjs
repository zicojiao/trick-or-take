const TAU = Math.PI * 2;
const neutral = () => ({phase: 0, bob: 0, lean: 0, stretch: 1, frame: 0, frozen: false, hasMoved: false});

/** Visual warning poses share the exact authoritative turn deadline. A sharp
 * v8 turn starts moving immediately; there is no stop/listen or punctuation beat.
 */
export function hostessTurnPose(warningMs, progress, rulesVersion) {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const sharp = rulesVersion >= 8 && warningMs <= 520;
  if (sharp) return {cue:'snap',frameIndex:5,movement:p,sharp:true};
  const cue = p < .18 ? 'stop' : p < .42 ? 'listen' : 'peek';
  return {cue,frameIndex:cue === 'stop' ? null : cue === 'listen' ? 4 : 5,
    movement:Math.max(0,Math.min(1,(p-.18)/.82)),sharp:false};
}

function priorPose(previous) {
  if (!previous || !['phase', 'bob', 'lean', 'stretch'].every(key => Number.isFinite(previous[key]))
      || previous.phase < 0 || previous.phase >= TAU || Math.abs(previous.bob) > .03
      || Math.abs(previous.lean) > .1 || previous.stretch <= .9 || previous.stretch >= 1.1
      || ![0, 1, 2, 3].includes(previous.frame)) return neutral();
  return {
    phase: previous.phase, bob: previous.bob, lean: previous.lean, stretch: previous.stretch,
    frame: previous.frame, frozen: Boolean(previous.frozen), hasMoved: Boolean(previous.hasMoved),
  };
}

/** Pure per-character visual state. dt is seconds; speed is radians/second.
 * bob is a fraction of character height, lean is radians, stretch is a scale.
 * Keep one returned pose per character. Releasing clears the stealing drawing
 * and its transforms immediately, independently of the homeowner's attention.
 * frame 0 is reset; frames 1/2 steal; frame 3 is the innocent idle drawing.
 */
export function stepThiefPose(previous, {
  stealing, active, caught = false, reduced = false, dt = 0, speed = 1,
} = {}) {
  if (!active || caught) return neutral();
  const pose = priorPose(previous);
  // Looking innocent is a fast visual response, never an input lock. A player
  // who presses while watched still moves and can be caught by the server.
  if (!stealing) return {...neutral(), frame:3, frozen:true, hasMoved:pose.hasMoved};
  const moving = {...pose, frame: pose.frame === 2 ? 2 : 1, frozen: false, hasMoved: true};
  if (reduced) return {...moving, bob: 0, lean: 0, stretch: 1};
  const elapsed = Number.isFinite(dt) ? Math.min(.05, Math.max(0, dt)) : 0;
  const rate = Number.isFinite(speed) ? Math.min(20, Math.max(0, speed)) : 1;
  if (elapsed === 0 || rate === 0) return moving;
  const phase = (pose.phase + elapsed * rate) % TAU;
  return {
    ...moving, phase, frame: phase < Math.PI ? 1 : 2,
    bob: Math.sin(phase) * .022,
    lean: Math.sin(phase) * .055,
    stretch: 1 + Math.sin(phase * 2) * .025,
  };
}
