// Original playful Halloween heist theme. Pure Web Audio — no samples or network.
// "Pumpkin Tiptoe": D minor with a raised 7th, 4/4, light swing. A short glass
// hook, oom-pah bass and offbeat plucks — mischievous, not a sleepy pad wash.
export const MUSIC_BPM = 108;
export const MUSIC_STEPS = 128; // 16 bars × 8 eighth-notes
// Hook, then a higher answer. Rests keep the loop from buzzing on phone speakers.
const melody = [
  [74,null,77,null,81,null,77,null],
  [79,null,77,null,76,null,74,null],
  [73,null,81,null,73,null,null,null],
  [77,null,76,null,74,null,null,null],
  [82,null,81,null,77,null,74,null],
  [81,null,77,null,79,null,81,null],
  [79,null,82,null,74,null,79,null],
  [76,null,73,null,null,null,null,null],
  [74,null,81,null,82,null,81,null],
  [81,null,77,null,74,null,null,null],
  [82,null,74,null,77,null,null,null],
  [84,null,82,null,81,null,79,null],
  [73,null,76,null,81,null,76,null],
  [79,null,82,null,74,null,77,null],
  [77,79,81,84,null,null,null,null],
  [81,null,77,null,74,null,null,null],
];
// Dm Bb A Dm / Bb F Gm A / Dm F Bb Bb / A Gm F Dm
const chords = [
  [50,53,57],[46,50,53],[57,61,64],[50,53,57],
  [46,50,53],[53,57,60],[55,58,62],[57,61,64],
  [50,53,57],[53,57,60],[46,50,53],[46,50,53],
  [57,61,64],[55,58,62],[53,57,60],[50,53,57],
];
export function musicNotes(step) {
  const n = ((step % MUSIC_STEPS) + MUSIC_STEPS) % MUSIC_STEPS;
  const bar = Math.floor(n / 8), beat = n % 8, c = chords[bar], notes = [];
  const pitch = melody[bar][beat];
  if (pitch != null) {
    const bright = pitch >= 82;
    const accent = beat % 4 === 0 ? .11 : .08;
    notes.push({
      pitch, instrument: 'celesta',
      duration: bright ? .18 : (beat % 4 === 0 ? .3 : .22),
      level: bright ? .065 : accent,
    });
  }
  // Short parlor stab, not a long wash — the groove should stay tiptoe-light.
  if (beat === 0) for (const p of c) notes.push({pitch: p, instrument: 'pad', duration: .62, level: .02});
  if (beat === 0) notes.push({pitch: c[0] - 12, instrument: 'bass', duration: .26, level: .16});
  if (beat === 4) notes.push({pitch: c[0] - 5, instrument: 'bass', duration: .16, level: .1});
  // Offbeat plucks: thirds in the hook, fifths once the answer starts.
  if (beat === 2 || beat === 6) notes.push({pitch: bar >= 8 ? c[2] : c[1], instrument: 'pluck', duration: .1, level: .04});
  return notes;
}
export const musicAllowed = s => !!(s.enabled && s.solo && s.active && !s.paused && !s.hidden);

export function createSoloMusic({getAudio, timers = globalThis, onStatus = () => {}}) {
  let audio, bus, filter, timer = null, nextAt = 0, step = 0, state = {}, status = 'off', currentGain = 0;
  const voices = new Set(), eighth = 60 / MUSIC_BPM / 2;
  const notify = s => {if (status !== s) {status = s; onStatus(s);}};
  function voice(type, freq, level, duration, at, attack = .01) {
    const ctx = audio.context, osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    amp.gain.setValueAtTime(.00001, at);
    amp.gain.exponentialRampToValueAtTime(Math.max(level, .00002), at + attack);
    amp.gain.exponentialRampToValueAtTime(Math.max(level * .18, .00002), at + duration * .42);
    amp.gain.exponentialRampToValueAtTime(.00001, at + duration);
    osc.connect(amp); amp.connect(filter); voices.add(osc);
    osc.onended = () => {voices.delete(osc); osc.disconnect(); amp.disconnect();};
    osc.start(at); osc.stop(at + duration + .02);
  }
  function note(n, at) {
    const freq = 440 * 2 ** ((n.pitch - 69) / 12);
    if (n.instrument === 'pad') {
      voice('sine', freq * .997, n.level, n.duration, at, .03);
      voice('sine', freq * 1.003, n.level * .85, n.duration, at, .03);
      return;
    }
    if (n.instrument === 'bass') {voice('sine', freq, n.level, n.duration, at, .012); return;}
    if (n.instrument === 'pluck') {voice('triangle', freq, n.level, n.duration, at, .006); return;}
    // Wonky glass: round fundamental, a short sparkle, a little body. Halloween music-box, not a toy bell.
    voice('sine', freq * 1.004, n.level, n.duration, at, .008);
    voice('triangle', freq * 2.003, n.level * .22, Math.min(n.duration, .12), at, .004);
    voice('sine', freq * .5, n.level * .28, n.duration * .9, at, .012);
  }
  function schedule() {
    const ctx = audio.context; if (ctx.state !== 'running') return;
    if (nextAt < ctx.currentTime - .2) nextAt = ctx.currentTime + .02;
    while (nextAt < ctx.currentTime + .18) {
      for (const n of musicNotes(step)) note(n, nextAt);
      // Light swing: downbeat eighths linger, offbeats sneak ahead.
      const swing = step % 2 === 0 ? eighth * 1.16 : eighth * .84;
      step = (step + 1) % MUSIC_STEPS; nextAt += swing;
    }
  }
  function stop() {
    if (timer !== null) {timers.clearInterval(timer); timer = null;}
    if (audio && bus) {
      const at = audio.context.currentTime;
      bus.gain.cancelScheduledValues(at); bus.gain.setTargetAtTime(0, at, .03);
      for (const v of voices) try {v.stop(at + .08);} catch { /* already stopped */ }
    }
    currentGain = 0; notify('off');
  }
  function sync(next = state) {
    state = next;
    if (!musicAllowed(state)) {if (timer !== null) stop(); return;}
    if (!audio || audio.context.state !== 'running') return;
    // Duck under Lily's warning/watch so gameplay cues stay clear.
    const level = (state.attention === 'warning' || state.attention === 'watching') ? .07 : .28;
    const at = audio.context.currentTime;
    if (currentGain !== level) {
      bus.gain.cancelScheduledValues(at);
      bus.gain.setTargetAtTime(level, at, level < currentGain ? .04 : .12);
      currentGain = level;
    }
    if (timer !== null) return;
    nextAt = at + .03; step = 0; schedule(); timer = timers.setInterval(schedule, 50); notify('playing');
  }
  async function unlock() {
    try {
      if (!audio) {
        audio = getAudio(); if (!audio) return;
        const ctx = audio.context;
        bus = ctx.createGain(); bus.gain.value = 0;
        const warm = ctx.createBiquadFilter();
        warm.type = 'highpass'; warm.frequency.value = 90; warm.Q.value = .7;
        filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 3200; filter.Q.value = .5;
        filter.connect(warm); warm.connect(bus); bus.connect(audio.output);
      }
      await audio.context.resume(); sync();
    } catch {stop();}
  }
  return {unlock, sync, stop, get status() {return status;}, get activeVoices() {return voices.size;}};
}
