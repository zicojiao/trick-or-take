// Original sampled Christmas arcade score. Audio shares the gesture-unlocked
// context with effects; two aligned stems keep the final-ten-second lift musical.
export const MUSIC_BPM = 125;
export const MUSIC_LOOP_SECONDS = 32 * 4 * 60 / MUSIC_BPM;
export const MUSIC_STEMS = Object.freeze([
  new URL('./assets/music/candy-workshop-theme.mp3', import.meta.url).href,
  new URL('./assets/music/candy-workshop-pulse.mp3', import.meta.url).href,
]);
export const musicAllowed = s => !!(s.enabled && s.solo && s.active && !s.paused && !s.hidden);

async function loadStem(context, url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('music_unavailable');
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  if (buffer.duration < MUSIC_LOOP_SECONDS - .02) throw new Error('music_incomplete');
  return buffer;
}

export function createSoloMusic({getAudio, loadBuffer = loadStem, onStatus = () => {}}) {
  let audio, bus, pulseBus, buffers, loading, starting = false, failed = false;
  let state = {}, status = 'off', generation = 0, offset = 0, startedAt = 0;
  let musicGain = 0, pulseGain = 0, running = false;
  const voices = new Set();
  const notify = value => {if (status !== value) {status = value; onStatus(value);}};
  function mix() {
    if (!audio || !bus) return;
    const quiet = state.attention === 'warning' || state.attention === 'watching';
    const level = quiet ? .35 : .70;
    const pulse = state.remaining > 0 && state.remaining <= 10 ? .65 : 0;
    const at = audio.context.currentTime;
    if (musicGain !== level) {
      bus.gain.cancelScheduledValues(at);
      bus.gain.setTargetAtTime(level, at, level < musicGain ? .08 : .20);
      musicGain = level;
    }
    if (pulseGain !== pulse) {
      pulseBus.gain.cancelScheduledValues(at);
      pulseBus.gain.setTargetAtTime(pulse, at, .18);
      pulseGain = pulse;
    }
  }
  function stop() {
    generation++; starting = false;
    if (audio && bus) {
      const at = audio.context.currentTime;
      if (running) offset = (offset + Math.max(0, at - startedAt)) % MUSIC_LOOP_SECONDS;
      bus.gain.cancelScheduledValues(at); bus.gain.setTargetAtTime(0, at, .025);
      for (const source of voices) try {source.stop(at + .08);} catch { /* Already stopped. */ }
    }
    running = false; musicGain = 0; notify('off');
    if (!state.active || !state.solo) offset = 0;
  }
  function start() {
    if (starting || running || failed || !audio || audio.context.state !== 'running') return;
    const ticket = generation;
    starting = true;
    if (!loading) {
      notify('loading');
      loading = Promise.all(MUSIC_STEMS.map(url => loadBuffer(audio.context, url)));
    }
    void loading.then(result => {
      if (ticket !== generation || !musicAllowed(state)) return;
      buffers = result;
      const at = audio.context.currentTime + .03;
      // Both loops start at exactly the same audio-clock time and offset. The
      // silent pulse keeps its place, so fading it in never restarts the tune.
      for (let i = 0; i < buffers.length; i++) {
        const source = audio.context.createBufferSource();
        source.buffer = buffers[i]; source.loop = true; source.loopEnd = MUSIC_LOOP_SECONDS;
        source.connect(i === 0 ? bus : pulseBus); voices.add(source);
        source.onended = () => {voices.delete(source); source.disconnect();};
        source.start(at, offset);
      }
      startedAt = at; running = true; mix(); notify('playing');
    }).catch(() => {
      loading = undefined;
      if (ticket !== generation) return;
      failed = true; stop(); notify('unavailable');
    }).finally(() => {if (ticket === generation) starting = false;});
  }
  function sync(next = state) {
    state = next;
    if (!musicAllowed(state)) {
      if (running || starting) stop();
      if (!state.active || !state.solo) offset = 0;
      return;
    }
    if (running) mix(); else start();
  }
  async function unlock() {
    try {
      if (!audio) {
        audio = getAudio(); if (!audio) return;
        const ctx = audio.context;
        bus = ctx.createGain(); bus.gain.value = 0; bus.connect(audio.output);
        pulseBus = ctx.createGain(); pulseBus.gain.value = 0; pulseBus.connect(bus);
      }
      // Resume is invoked before the first await, during the user's gesture.
      const resumed = audio.context.resume();
      failed = false;
      await resumed; sync();
    } catch {stop();}
  }
  return {unlock, sync, stop, get status() {return status;}, get activeVoices() {return voices.size;}};
}
