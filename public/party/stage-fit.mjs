// Stage sizing from measured space, replacing per-breakpoint viewport guesses.
const IDEAL = 16 / 9, WIDEST = 1.9, TALLEST = .68, GAP = 14;

/** Pure: pick the stage height and an optional card width cap.
 * viewport, top, below and bar are px. width is the stage width the card
 * would have at full column width. layout is 'wide' (desktop, tablet and
 * phone landscape), 'portrait' (phone in a match) or 'portrait-home'.
 */
export function fitStage({viewport, top, below = 0, bar = 0, width, layout}) {
  if (!(width > 0) || !(viewport > 0)) return null;
  if (layout === 'portrait-home') return {height: Math.round(width / 1.2), maxWidth: null};
  const room = Math.floor(viewport - top - below - bar - GAP);
  if (layout === 'portrait') return {height: Math.round(Math.max(180, Math.min(room, width / TALLEST))), maxWidth: null};
  const ideal = width / IDEAL, height = Math.round(Math.max(180, Math.min(ideal, room)));
  const maxWidth = Math.floor(height * WIDEST);
  return {height, maxWidth: maxWidth < width - 1 ? maxWidth : null};
}

/** Keeps #stage sized to the room left in the viewport for scene views. */
export function installStageFit(doc, win) {
  const $ = id => doc.getElementById(id);
  const stage = $('stage'), card = stage?.closest('.game-card'), column = card?.parentElement;
  if (!stage || !card || !column) return () => {};
  const media = query => !!win.matchMedia?.(query).matches;
  let queued = 0;
  function apply() {
    queued = 0;
    const {view, mode} = doc.body.dataset, narrow = media('(max-width:700px)');
    // Measure the card at its full track width; the cap is re-applied below in the same frame.
    column.style.removeProperty('--card-max');
    // Phone panels and desktop results replace the scene and size themselves.
    const sceneShown = !narrow || (mode === 'solo' && view === 'home') || view === 'playing' || view === 'countdown';
    if (!sceneShown) {stage.style.removeProperty('height'); return;}
    const scroll = win.scrollY || 0, stageBox = stage.getBoundingClientRect(), cardBox = card.getBoundingClientRect();
    const fixed = narrow && doc.querySelector('.action-wrap');
    const barTop = fixed && win.getComputedStyle(fixed).position === 'fixed' ? fixed.getBoundingClientRect().top : 0;
    const side = cardBox.width - stageBox.width;
    // The home page is scrollable: use the full column, with a natural scene ratio.
    // Active games still fit the available viewport and reserve the input dock.
    if (view === 'home' && mode === 'solo' && !narrow) {
      stage.style.height = Math.round(Math.min(560, Math.max(300, (cardBox.width - side) / 1.9))) + 'px';
      return;
    }
    const result = fitStage({
      viewport: win.innerHeight, top: stageBox.top + scroll,
      below: Math.max(0, cardBox.bottom - stageBox.bottom),
      bar: barTop ? win.innerHeight - barTop : 0,
      width: cardBox.width - side,
      layout: narrow ? view === 'home' ? 'portrait-home' : 'portrait' : 'wide',
    });
    if (!result) return;
    const height = result.height + 'px';
    if (stage.style.height !== height) stage.style.height = height;
    if (result.maxWidth) column.style.setProperty('--card-max', result.maxWidth + side + 'px');
  }
  const schedule = () => {if (!queued) queued = win.requestAnimationFrame(apply);};
  win.addEventListener('resize', schedule);
  const Resize = win.ResizeObserver, Mutation = win.MutationObserver;
  const resize = Resize && new Resize(schedule);
  for (const selector of ['.topbar', '.setup-panel', '.game-dock', '.under-stage', '.voice-bar']) {
    const element = doc.querySelector(selector);
    if (element) resize?.observe(element);
  }
  resize?.observe(column);
  const mutation = Mutation && new Mutation(schedule);
  mutation?.observe(doc.body, {attributes: true, attributeFilter: ['data-view', 'data-mode']});
  schedule();
  return () => {win.removeEventListener('resize', schedule); resize?.disconnect(); mutation?.disconnect();};
}

// Installs itself in the browser; app.mjs only imports this module for that side effect.
if (typeof document !== 'undefined' && typeof window !== 'undefined') installStageFit(document, window);
