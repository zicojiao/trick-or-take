// Hand-inked, state-driven cartoon theatre. The application owns clock and input;
// this module never decides a catch, awards candy, or mutates the room.
import {CANDY_COLORS,createCandyPicker,createCandyTextures} from './candy-colors.mjs';
import {stepThiefPose} from './motion.mjs';
import {sceneLayout, candySize} from './scene-layout.mjs';

const TAU = Math.PI * 2;
const INK = '#352b42';
const CANDY = CANDY_COLORS;
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const smooth = value => {const n = clamp(value); return n * n * (3 - 2 * n);};
const hash = value => [...String(value)].reduce((n, c) => (Math.imul(n, 31) + c.codePointAt(0)) >>> 0, 17);
const ASSETS = {
  room: new URL('./assets/room-grounded.webp', import.meta.url).href,
  hostess: new URL('./assets/hostess-broom-atlas.webp', import.meta.url).href,
  thieves: new URL('./assets/thieves-sneaky-atlas.webp', import.meta.url).href,
  innocent: new URL('./assets/thieves-innocent-atlas.webp', import.meta.url).href,
};
const PROPS = new URL('./assets/props-2d-atlas.webp', import.meta.url).href;

function environment(canvas) {
  const win = canvas.ownerDocument?.defaultView ?? globalThis;
  const doc = canvas.ownerDocument ?? globalThis.document;
  let media;
  try {media = win.matchMedia?.('(prefers-reduced-motion: reduce)');} catch { /* Static poses remain available. */ }
  return {win, doc, reduced: () => Boolean(media?.matches)};
}

export function loadImage(url, env, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const ImageType = env.win.Image ?? globalThis.Image;
    if (!ImageType) {reject(new Error('image_unavailable')); return;}
    const image = new ImageType();
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      image.onload = image.onerror = null;
      if (error) {image.src = ''; reject(new Error(error));} else resolve(image);
    };
    const timer = setTimeout(() => finish('image_timeout'), timeoutMs);
    image.onload = () => finish();
    image.onerror = () => finish('image_unavailable');
    image.src = url;
  });
}

// Runtime texture coordinates preserve the supplied artwork; the asset files
// themselves are never edited. Alpha bounds remove transparent cell padding.
function atlasFrames(image, columns, rows, env, kind) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  // These bounds follow the actual painted silhouettes, including a few hairs
  // and ears that extend across nominal grid lines. Keep adjacent poses out.
  const supplied = kind === 'hostess' && width === 1774 && height === 887
    ? [[84,15,373,439], [516,17,804,440], [965,12,1253,439], [1396,16,1755,439], [87,451,372,871], [525,449,802,869], [947,451,1320,875], [1340,428,1740,875]]
    : kind === 'thieves' && width === 1087 && height === 1447
      ? [[77,50,317,366], [413,40,683,366], [775,34,1035,368], [49,404,354,716], [411,397,719,713], [754,386,1059,718], [68,751,365,1057], [426,734,700,1056], [765,731,1046,1059], [47,1088,372,1403], [395,1077,728,1405], [756,1076,1062,1404]]
    : kind === 'props' && width === 2172 && height === 724
      ? [[71,34,655,688], [781,142,1410,610], [1474,64,2108,676]] : null;
  if (supplied) {
    const stance = kind === 'hostess' ? [214.13,655.12,1104.76,1531.74,215.39,655.69,1112.96,1570.81]
      : kind === 'thieves' ? Array.from({length:12}, (_, i) => [205,546,904][i%3]) : [363.7,1095.5,1791];
    const brows = kind === 'hostess' ? {5:{x:721,y:550}, 6:{x:1113,y:566}, 7:{x:1586,y:554}} : {};
    const broomOrigins = kind === 'hostess' ? {7:{x:1415,y:490}} : {};
    return supplied.map(([x, y, right, bottom], index) => ({x:x-2, y:y-2, w:right-x+4, h:bottom-y+4,
      baseline:bottom, stance:stance[index], referenceH:kind === 'hostess' ? 420 : kind === 'thieves' ? 330 : bottom-y, brow:brows[index], broomOrigin:broomOrigins[index],
      // The raised bristles cross the nominal row boundary; exclude the two
      // shoes belonging to the work pose above while preserving the broom.
      trimTopRight:kind==='hostess'&&index===7?{x:1430,y:449}:null}));
  }
  const cellW = width / columns, cellH = height / rows;
  const frames = [];
  let pixels;
  try {
    const scratch = env.doc.createElement('canvas');
    scratch.width = width; scratch.height = height;
    const context = scratch.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0);
    pixels = context.getImageData(0, 0, width, height).data;
  } catch { /* Full cells are safe when image readback is unavailable. */ }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const left = Math.floor(column * cellW), top = Math.floor(row * cellH);
      const cw = Math.floor((column + 1) * cellW) - left, ch = Math.floor((row + 1) * cellH) - top;
      let minX = cw, minY = ch, maxX = -1, maxY = -1;
      if (pixels) {
        for (let y = 0; y < ch; y += 2) {
          for (let x = 0; x < cw; x += 2) {
            if (pixels[((top + y) * width + left + x) * 4 + 3] > 20) {
              minX = Math.min(minX, x); minY = Math.min(minY, y);
              maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
          }
        }
      }
      if (maxX < minX) {minX = 0; minY = 0; maxX = cw - 1; maxY = ch - 1;}
      const baseline = top + maxY;
      const pad = 3;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(cw, maxX + pad); maxY = Math.min(ch, maxY + pad);
      frames.push({x:left+minX, y:top+minY, w:maxX-minX, h:maxY-minY, baseline,
        stance:left+(minX+maxX)/2, referenceH:maxY-minY});
    }
  }
  return frames;
}

function avatarIndex(player, index) {
  const value = Number(player.avatar);
  return Number.isFinite(value) ? Math.abs(Math.trunc(value)) % 6 : hash(player.avatar || index) % 6;
}

/** All animation is visual; `now` is the app's authoritative (or paused local) clock. */
export function createScene(canvas) {
  const env = environment(canvas);
  const g = canvas.getContext('2d', {alpha: false});
  if (!g) return {update() {}, dispose() {}, ready: Promise.resolve({ok: false, failed: ['canvas']}), retryAssets: () => Promise.resolve({ok: false, failed: ['canvas']})};
  let width = 1100, height = 600, dpr = 1, disposed = false;
  let clock = 0, lastClock = null, roomKey = '', lastPhase = '', lastEvent = 0;
  let pose = '', poseChangedAt = -10, workPhase = 0;
  let hostessMotion = {x: 0, y: 0, rotation: 0};
  let assets = {}, frames = {}, loadPromise, propsPromise;
  let candyTextures = new Map();
  const nextCandyColor = createCandyPicker();
  const actors = new Map(), particles = [];
  canvas.dataset.renderer = 'inked-2d';
  canvas.dataset.assets = 'loading';
  canvas.dataset.props = 'loading';

  function resize() {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    dpr = Math.min(Number(env.win.devicePixelRatio) || 1, 2);
    const nextWidth = Math.round(width * dpr), nextHeight = Math.round(height * dpr);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth; canvas.height = nextHeight;
    }
  }
  const Resize = env.win.ResizeObserver ?? globalThis.ResizeObserver;
  let observer;
  if (Resize) {
    observer = new Resize(resize);
    observer.observe(canvas);
  } else env.win.addEventListener?.('resize', resize);
  resize();

  function loadProps() {
    if (disposed || assets.props || propsPromise) return;
    canvas.dataset.props = 'loading';
    propsPromise = loadImage(PROPS, env).then(image => {
      if (disposed) return;
      assets.props = image;
      frames.props = atlasFrames(image, 3, 1, env, 'props');
      candyTextures = createCandyTextures(image,frames.props[1],env.doc);
      canvas.dataset.props = 'ready';
    }).catch(() => {
      if (!disposed) canvas.dataset.props = 'unavailable';
    }).finally(() => {propsPromise = null;});
  }
  function loadAssets() {
    loadProps();
    if (loadPromise) return loadPromise;
    canvas.dataset.assets = 'loading';
    loadPromise = Promise.all(Object.entries(ASSETS).map(async ([key, url]) => {
      if (assets[key]) return null;
      try {
        const image = await loadImage(url, env);
        if (disposed) return key;
        assets[key] = image;
        if (key === 'hostess') frames.hostess = atlasFrames(image, 4, 2, env, key);
        if (key === 'thieves') frames.thieves = atlasFrames(image, 3, 4, env, key);
        if (key === 'innocent') frames.innocent = atlasFrames(image, 3, 1, env, key);
        return null;
      } catch {return key;}
    })).then(results => {
      const failed = results.filter(Boolean);
      if (!disposed) canvas.dataset.assets = failed.length ? 'error' : 'ready';
      return {ok: failed.length === 0, failed};
    }).finally(() => {loadPromise = null;});
    return loadPromise;
  }
  const ready = loadAssets();

  function ellipse(x, y, rx, ry, fill, rotation = 0) {
    if (rx <= 0 || ry <= 0) return;
    g.beginPath(); g.ellipse(x, y, rx, ry, rotation, 0, TAU);
    g.fillStyle = fill; g.fill();
  }
  function rounded(x, y, w, h, radius, fill) {
    g.beginPath(); g.roundRect(x, y, w, h, radius); g.fillStyle = fill; g.fill();
  }
  function line(x1, y1, x2, y2, color, lineWidth = 2) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.strokeStyle = color; g.lineWidth = lineWidth; g.lineCap = 'round'; g.stroke();
  }
  function star(x, y, size, color, rotation = 0) {
    g.save(); g.translate(x, y); g.rotate(rotation); g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4, radius = i % 2 ? size * .28 : size;
      if (i) g.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      else g.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    g.closePath(); g.fillStyle = color; g.fill();
    g.strokeStyle = INK; g.lineWidth = Math.max(.8, size * .13); g.lineJoin = 'round'; g.stroke(); g.restore();
  }
  function flower(x, y, size, color, rotation = 0) {
    g.save(); g.translate(x, y); g.rotate(rotation); g.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      g.rotate(TAU / 5);
      g.beginPath(); g.ellipse(0, size * .55, size * .28, size * .46, 0, 0, TAU); g.fill();
    }
    g.beginPath(); g.arc(0, 0, size * .22, 0, TAU); g.fillStyle = '#fff3c4'; g.fill();
    g.restore();
  }
  function candy(x, y, size, color, rotation = 0) {
    g.save(); g.translate(x, y); g.rotate(rotation);
    const frame = frames.props?.[1];
    const texture=candyTextures.get(color);
    if (texture && frame) {
      const w = size * 2, h = w * frame.h / frame.w;
      g.drawImage(texture, -w / 2, -h / 2, w, h);
      g.restore(); return;
    }
    g.fillStyle = color;
    g.strokeStyle = INK; g.lineWidth = Math.max(1, size * .14); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-size * .57, 0); g.lineTo(-size, -size * .49); g.lineTo(-size * .94, size * .49); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(size * .57, 0); g.lineTo(size, -size * .49); g.lineTo(size * .94, size * .49); g.closePath(); g.fill(); g.stroke();
    rounded(-size * .56, -size * .44, size * 1.12, size * .88, size * .3, color);
    g.stroke();
    line(-size * .22, -size * .36, size * .17, size * .34, '#fff0cc', size * .24);
    g.restore();
  }
  function text(value, x, y, size, color, weight = 800, align = 'center') {
    g.font = `${weight} ${size}px "Nunito", "Arial Rounded MT Bold", "PingFang SC", sans-serif`;
    g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(value, x, y);
  }
  function broom(x, y, size, rotation) {
    g.save(); g.translate(x, y); g.rotate(rotation);
    line(0, size * .2, 0, size * 3.8, INK, size * .29);
    line(0, size * .2, 0, size * 3.8, '#bd8455', size * .17);
    g.beginPath();g.moveTo(-size*.37,size*.8);g.lineTo(-size*.95,-size*.43);
    g.quadraticCurveTo(0,-size*.65,size*.95,-size*.43);g.lineTo(size*.37,size*.8);g.closePath();
    g.fillStyle='#e8ba65';g.fill();g.strokeStyle=INK;g.lineWidth=Math.max(1.3,size*.09);g.stroke();
    for(let i=-2;i<=2;i++)line(i*size*.13,size*.61,i*size*.30,-size*.38,'#ab753f',Math.max(1,size*.05));
    line(-size*.43,size*.52,size*.43,size*.52,INK,size*.19);
    line(-size*.43,size*.52,size*.43,size*.52,'#a58ac4',size*.11);g.restore();
  }
  function fitLabel(prefix, suffix, available) {
    const full = prefix + suffix;
    if (g.measureText(full).width <= available) return full;
    const letters = [...prefix];
    while (letters.length && g.measureText(letters.join('') + '…' + suffix).width > available) letters.pop();
    const shortened = letters.join('') + '…' + suffix;
    if (g.measureText(shortened).width <= available) return shortened;
    const identity = suffix.trimStart();
    return g.measureText(identity).width <= available ? identity : '';
  }
  function sprite(key, index, x, foot, desiredHeight, alpha = 1, rotation = 0, squash = 1, flip = false, maxWiden = Infinity) {
    const image = assets[key], frame = frames[key]?.[index];
    if (!image || !frame || alpha <= 0) return;
    const drawW = desiredHeight * frame.w / frame.h;
    const anchor = Number.isFinite(frame.stance) ? (frame.stance - frame.x) / frame.w : .5;
    const baseline = Number.isFinite(frame.baseline) ? (frame.baseline - frame.y) / frame.h : 1;
    g.save(); g.translate(x, foot); g.rotate(rotation);
    g.scale((flip ? -1 : 1) * Math.min(maxWiden, 1 / Math.sqrt(squash)), squash); g.globalAlpha *= alpha;
    if(frame.trimTopRight){
      const left=-drawW*anchor,top=-desiredHeight*baseline,cut=(frame.trimTopRight.y-frame.y)*desiredHeight/frame.h,keep=(frame.trimTopRight.x-frame.x)*drawW/frame.w;
      g.beginPath();g.rect(left,top+cut,drawW,desiredHeight-cut);g.rect(left,top,keep,cut);g.clip();
    }
    g.drawImage(image, frame.x, frame.y, frame.w, frame.h, -drawW * anchor, -desiredHeight * baseline, drawW, desiredHeight);
    g.restore();
  }

  function paintBackground(reduced,stage) {
    const image = assets.room;
    if (image) {
      const {x,y,w,h}=stage.background;
      g.drawImage(image,x,y,w,h);
    } else {
      g.fillStyle = '#f1e5ce'; g.fillRect(0, 0, width, height);
      g.strokeStyle = INK; g.lineWidth = 2;
      g.strokeRect(18, 18, width - 36, height - 36);
      text('· · ·', width * .5, height * .52, 34, INK);
    }
    if(assets.props){
      const size=Math.min(height*.24,width*.19),x=width-size*.57-8,foot=stage.floor+height*.035;
      ellipse(x,foot-1,size*.44,size*.05,'#352b4240');
      sprite('props',2,x,foot,size);
    }
    if (!reduced && image) {
      for (let i = 0; i < 4; i++) {
        const drift = clock * .14 + i * 1.8;
        const x = width * (.16 + i * .21) + Math.sin(drift) * 4;
        const y = height * (.29 + i % 2 * .12) + Math.cos(drift) * 3;
        line(x - 1, y, x + 1, y + 1, '#f6e6bc88', 1.3);
      }
    }
  }

  function prepareHostess(room, stage, players, viewerId, now, reduced, dt) {
    const phase = room?.phase, active = phase === 'playing';
    const lookAt = Number(room?.lookAt) || 0;
    const watchUntil = Number(room?.watchUntil) || 0;
    let attention = active ? room.attention : 'away';
    // Public warning/inspection deadlines also apply between snapshots. This
    // advances only the illustration, without predicting a private next look.
    if (active && attention !== 'away' && lookAt > 0 && now >= lookAt) {
      attention = watchUntil > lookAt && now >= watchUntil ? 'away' : 'watching';
    }
    const activity = room?.activity || 'cooking';
    const lady = stage.hostess;
    const working = attention === 'away';
    // Scale stop → listen → peek to the actual warning length so Hard stays
    // telegraphable even when the window is only a few hundred milliseconds.
    const warningDuration = Math.max(1, Number(room?.warningMs) || 900);
    const warningProgress = attention === 'warning' ? clamp(1 - (lookAt - now) / warningDuration) : 0;
    const warningMs = warningProgress * warningDuration;
    const watchProgress = attention === 'watching' ? clamp((now - lookAt) / Math.max(1, watchUntil - lookAt)) : 0;
    const watchMs = attention === 'watching' ? Math.max(0, now - lookAt) : 0;
    const inspectHold = attention === 'watching' && watchMs < 130;
    const scanProgress = attention === 'watching' ? clamp((watchMs - 130) / Math.max(1, watchUntil - lookAt - 130)) : 0;
    // A real catch is the only cause of the raised broom. Prefer the viewer's catch
    // when simultaneous catches arrive; never invent a target from input.
    const catches = attention === 'watching' ? (room.events || []).filter(event => event.type === 'catch' && now >= event.at && now - event.at < 1100) : [];
    const newest = items => items.reduce((last, event) => !last || event.at > last.at || event.at === last.at && event.id > last.id ? event : last, null);
    const reaction = newest(catches.filter(event => event.playerId === viewerId)) || newest(catches);
    const targetIndex = reaction ? players.findIndex(player => player.id === reaction.playerId) : -1;
    const target = targetIndex >= 0 ? stage.positions[targetIndex] : null;
    if (working && !reduced) workPhase += dt;
    const workDrawing = reduced ? 0 : Math.floor(workPhase / (activity === 'cooking' ? .34 : .30)) % 2;
    const key = 'hostess';
    let frameIndex = (activity === 'cleaning' ? 2 : 0) + workDrawing;
    let cue = 'work';
    if (attention === 'warning') {
      // Fractions of the live warning: stop, listen, then peek over a shoulder.
      cue = warningProgress < .18 ? 'stop' : warningProgress < .42 ? 'listen' : 'peek';
      if (cue !== 'stop') {
        frameIndex = cue === 'listen' ? 4 : 5;
      }
    } else if (attention === 'watching') {
      cue = reaction ? 'caught' : 'inspect';
      frameIndex = reaction ? 7 : 6;
    }
    const targetPose = `${key}:${frameIndex}`;
    if (targetPose !== pose) {pose = targetPose; poseChangedAt = clock;}
    const cueProgress = smooth((warningProgress - .18) / .82);
    const scan = reduced ? 0 : Math.sin(scanProgress * TAU) * .5;
    const direction = target ? clamp((target.x - lady.x) / (width * .5), -1, 1) : 0;
    let goal = working
      ? {x: activity === 'cleaning' ? Math.sin(workPhase * 4.5) * lady.height * .009 : 0, y: Math.sin(workPhase * 5) * .65, rotation: Math.sin(workPhase * 2.8) * .009}
      : attention === 'warning'
        ? {x: -lady.height * .008 * cueProgress, y: 0, rotation: -.022 * cueProgress}
        : {x: lady.height * (-.013 + scan * .004 + direction * .004), y: 0, rotation: -.030 + scan * .006 + direction * .006};
    if (reduced) goal = {x: 0, y: 0, rotation: 0};
    // No continuation of the work bob during the first stopped beat.
    if (reduced || inspectHold) hostessMotion = goal;
    else if (cue !== 'stop') {
      const amount = 1 - Math.exp(-dt * 17);
      for (const axis of ['x', 'y', 'rotation']) hostessMotion[axis] = mix(hostessMotion[axis], goal[axis], amount);
    }
    const frame = frames[key]?.[frameIndex];
    const poseHeight = frame ? lady.height * frame.h / frame.referenceH : lady.height;
    // One opaque pose at a time avoids double faces during a turn. A tiny
    // settling motion and a shared shoe anchor join the successive poses.
    const settle = reduced || cue === 'stop' || inspectHold ? 0 : Math.sin(clamp((clock - poseChangedAt) / .12) * Math.PI) * .004;
    const burst = reduced ? 0 : attention === 'watching'
      ? clamp(1 - (reaction ? now - reaction.at : watchMs) / 260)
      : cue === 'peek' ? clamp(1 - (warningProgress - .42) / .22) : 0;
    const model = {key, frameIndex, cue, attention, activity, working, warningMs, warningProgress, watchProgress, scanProgress, watchMs, burst, target,
      x: lady.x + hostessMotion.x, foot: lady.foot + hostessMotion.y, height: poseHeight,
      rotation: hostessMotion.rotation, stretch: 1 - settle, brow: null, broomOrigin: null};
    const worldPoint = point => {
      const nativeScale = poseHeight / frame.h;
      const lx = (point.x - (frame.stance ?? frame.x + frame.w / 2)) * nativeScale / Math.sqrt(model.stretch);
      const ly = (point.y - (frame.baseline ?? frame.y + frame.h)) * nativeScale * model.stretch;
      return {x:model.x + Math.cos(model.rotation) * lx - Math.sin(model.rotation) * ly,
        y:model.foot + Math.sin(model.rotation) * lx + Math.cos(model.rotation) * ly};
    };
    if (frame?.brow) model.brow = worldPoint(frame.brow);
    if (frame?.broomOrigin) model.broomOrigin = worldPoint(frame.broomOrigin);
    canvas.dataset.hostessCue = cue;
    return model;
  }

  function paintHostess(model, stage, reduced) {
    const lady = stage.hostess;
    const {x, foot, activity, attention, working} = model;
    ellipse(x, lady.foot - 1, lady.height * .22, lady.height * .035, '#352b422a');
    sprite(model.key, model.frameIndex, x, foot, model.height, 1, model.rotation, model.stretch);
    if (model.brow && model.burst > 0) {
      const {x:bx,y:by} = model.brow, mark = lady.height * .039;
      g.save(); g.globalAlpha *= model.burst * .8;
      line(bx - mark * 4, by - mark * .1, bx - mark * 5, by - mark * .7, '#914952', 1.7);
      line(bx - mark * 4.1, by + mark * .8, bx - mark * 5.2, by + mark * .9, '#914952', 1.7);
      line(bx + mark * 4, by - mark * .5, bx + mark * 4.7, by - mark * 1.2, '#914952', 1.7);
      g.restore();
    }
    if (working && !reduced) {
      if (activity === 'cooking') {
        for (let i = 0; i < 3; i++) {
          const progress = (clock * .42 + i / 3) % 1;
          const steamX = x + lady.height * .23 + Math.sin(progress * 8 + i) * lady.height * .015;
          const steamY = foot - lady.height * (.50 + progress * .16);
          g.save(); g.globalAlpha = Math.sin(progress * Math.PI) * .45;
          g.beginPath(); g.moveTo(steamX, steamY + 10);
          g.bezierCurveTo(steamX - 7, steamY + 2, steamX + 9, steamY - 5, steamX + 1, steamY - 15);
          g.strokeStyle = '#f5e8c8'; g.lineWidth = stage.narrow ? 2 : 3; g.lineCap = 'round'; g.stroke(); g.restore();
        }
      } else {
        const sparkle = Math.max(0, Math.sin(clock * 3));
        const raised = model.frameIndex === 3;
        const ragX = x + lady.height * (raised ? .47 : .27), ragY = foot - lady.height * (raised ? .62 : .32);
        star(ragX, ragY, 4 + sparkle * 2, '#f7e7a5', .15);
        line(ragX + 8, ragY - 6, ragX + 14, ragY - 10, INK, 1.2);
      }
    }
    if (attention === 'watching' || attention === 'warning' && model.warningMs >= 150) {
      const badgeX = x - lady.height * .28, badgeY = lady.foot - lady.height * .89;
      const pulse = reduced ? 1 : 1 + Math.sin(clock * 9) * .06;
      g.save(); g.translate(badgeX, badgeY); g.rotate(-.10);
      ellipse(0, 0, 15 * pulse, 19 * pulse, attention === 'watching' ? '#ffbc76' : '#fff4ce');
      g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      text(attention === 'watching' ? '!' : '?', 0, 0, 24, INK); g.restore();
    }
  }

  function paintBowl(stage, attention, reduced) {
    const {x, y, radius: r} = stage.bowl;
    g.save();
    const prop = frames.props?.[0];
    const foot = y + r * .94, propHeight = r * 2.12;
    ellipse(x + 2, foot - 1, r * .88, r * .15, '#352b4229');
    if (assets.props && prop) {
      sprite('props', 0, x, foot, propHeight);
      const scale = propHeight / prop.h;
      stage.bowl.pile = {x:x + (365 - prop.stance) * scale, y:foot + (165 - prop.baseline) * scale};
    } else {
      // Optional prop failure keeps the same flat ink treatment; required
      // character/room failure is handled by the application's asset gate.
      for (const direction of [-1, 1]) {
        line(x + direction * r * .55, y + r * .2, x + direction * r * .72, foot, INK, r * .14);
        line(x + direction * r * .55, y + r * .2, x + direction * r * .72, foot, '#b58460', r * .08);
      }
      ellipse(x, y + r * .15, r * .98, r * .24, '#c9996e');
      g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
      g.beginPath(); g.moveTo(x - r * .88, y - r * .3);
      g.bezierCurveTo(x - r * .91, y + r * .25, x + r * .8, y + r * .32, x + r * .86, y - r * .3);
      g.closePath(); g.fillStyle = '#a18bb8'; g.fill(); g.stroke();
      ellipse(x, y - r * .3, r * .87, r * .23, '#d2b6dc'); g.stroke();
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996, spread = Math.sqrt((i + .5) / 9);
        candy(x + Math.cos(a) * r * .64 * spread, y - r * .39 + Math.sin(a) * r * .15 * spread, candySize(stage.bowl), CANDY[i % CANDY.length], a);
      }
      ellipse(x - r * .24, y - r * .02, r * .045, r * .055, INK);
      ellipse(x + r * .22, y - r * .025, r * .11, r * .14, '#f4e9cc'); g.stroke();
      ellipse(x + r * .23, y - r * .015, r * .035, r * .06, INK);
      line(x - r * .07, y + r * .1, x + r * .08, y + r * .08, INK, 1.5);
      stage.bowl.pile = {x, y:y-r*.4};
    }
    if (!reduced && attention === 'away') {
      const pulse = Math.sin(clock * 1.8);
      const pile = stage.bowl.pile;
      star(pile.x - r * .95, pile.y + 2, 4 + pulse, '#f4dc8c', .1);
      star(pile.x + r * .91, pile.y - 4, 3 - pulse * .5, '#f4dc8c', -.1);
    }
    g.restore();
  }

  function spawn(type, playerId, count, options = {}) {
    particles.push({type, playerId, count, at: clock, seed: hash(`${playerId}-${clock}-${count}`), ...options});
    if (particles.length > 140) particles.splice(0, particles.length - 140);
  }
  function voiceLevel(levels, player) {
    const value = levels?.get ? levels.get(String(player.uid)) : levels?.[String(player.uid)];
    return clamp(Number(value) || 0);
  }
  function synchronize(room, players, now, holding, viewerId, reduced) {
    const nextKey = room ? `${room.code}:${room.roundIndex}:${room.createdAt}` : 'preview';
    if (nextKey !== roomKey) {
      roomKey = nextKey; actors.clear(); particles.length = 0;
      lastPhase = room?.phase || ''; lastEvent = Math.max(0, ...(room?.events || []).map(item => item.id));
      pose = ''; poseChangedAt = -10; workPhase = 0;
      hostessMotion = {x: 0, y: 0, rotation: 0};
    }
    const activeIds = new Set(players.map(player => player.id));
    for (const id of actors.keys()) if (!activeIds.has(id)) actors.delete(id);
    for (const player of players) {
      let actor = actors.get(player.id);
      const active = room?.phase === 'playing';
      const stealing = active && player.stunnedUntil <= now && (player.id === viewerId ? Boolean(holding) : Boolean(player.holding));
      if (!actor) {
        actor = {pending: Number(player.pending) || 0, score: Number(player.score) || 0, steal: stealing, motion: null, catchAt: -10, catchEventAt: -Infinity, bonkOrigin: null};
        actors.set(player.id, actor);
      }
      const gain = Math.floor(Number(player.pending) || 0) - Math.floor(actor.pending);
      const bank = Math.floor(Number(player.score) || 0) - Math.floor(actor.score);
      // Release stops pickups immediately; innocent reactions are separate.
      // A delayed authoritative score update may still show bank feedback.
      if (!stealing) {
        for (let i = particles.length - 1; i >= 0; i--) {
          if (particles[i].type === 'candy' && particles[i].playerId === player.id) particles.splice(i, 1);
        }
      }
      if (!reduced && active && stealing && gain > 0) {
        const count = Math.min(3, Math.ceil(gain / 2));
        for (let i = 0; i < count; i++) spawn('candy', player.id, 1, {delay: i * .065, color: nextCandyColor()});
      }
      if (bank > 0 && active) spawn('bank', player.id, bank);
      actor.pending = Number(player.pending) || 0; actor.score = Number(player.score) || 0;
      actor.steal = stealing;
    }
    for (const event of room?.events || []) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      if (event.type === 'catch' && now - event.at < 2000) {
        const actor = actors.get(event.playerId);
        if (actor) {
          actor.catchAt = clock - Math.max(0, now - event.at) / 1000;
          actor.catchEventAt = event.at;
          actor.bonkOrigin = null;
          // A confiscation invalidates old +score feedback as well as candy
          // in transit. Only the authoritative catch creates a bonk or spill.
          for (let i = particles.length - 1; i >= 0; i--) {
            if (particles[i].playerId === event.playerId) particles.splice(i, 1);
          }
          const lost = Math.max(0, Number(event.lost) || 0);
          if (!reduced && lost > 0) {
            for (let i = 0; i < Math.min(4, Math.ceil(lost)); i++) {
              spawn('confiscate', event.playerId, 1, {index:i, at:actor.catchAt + .22 + i*.025, color:nextCandyColor()});
            }
          }
        }
      }
    }
    if (room?.phase === 'finished' && lastPhase === 'playing' && !reduced) {
      const colors = ['#e07a9a', '#f2b15a', '#c9a0e0', '#f4d56a', '#ef8b6a', '#8fceab'];
      for (let i = 0; i < 36; i++) {
        const angle = -Math.PI / 2 + (i / 36 - .5) * Math.PI * 1.7;
        spawn('confetti', '', 1, {
          index: i, color: colors[i % colors.length], delay: (i % 6) * .04,
          angle, speed: .55 + (i % 5) * .12, spin: (i % 2 ? 1 : -1) * (2.2 + i % 3), shape: i % 3,
        });
      }
    }
    lastPhase = room?.phase || '';
  }

  function paintPlayer(player, index, location, room, viewerId, now, reduced, levels, dt, lang, stage) {
    const actor = actors.get(player.id);
    const avatar = avatarIndex(player, index);
    const base = avatar % 3;
    const active = room?.phase === 'playing';
    const caught = active && player.stunnedUntil > now;
    const stealing = actor?.steal && !caught;
    const held = Math.max(0, now - (player.heldSince || now));
    const speed = 5.5 + clamp(held / 2000) * 3;
    const innocent = active && !stealing && !caught;
    const motion = stepThiefPose(actor?.motion, {stealing, active, caught, reduced, dt, speed});
    if(actor && motion.frame === 3 && actor.motion?.frame !== 3) actor.innocentAt=clock;
    if (actor) actor.motion = motion;
    const idle = reduced || active ? 0 : Math.sin(clock * 1.8 + index * 1.4);
    // Tiptoe transforms belong only to stealing. Release clears them together
    // with the candy-holding drawing, even when Lily is still working.
    const bob = Math.abs(motion.bob) * .72 * location.height + idle * location.height * .008;
    const bend = motion.lean * .55;
    const tuck = Math.abs(motion.lean) / .055 * .012;
    const bodyStretch = 1 - tuck + (motion.stretch - 1) * .30;
    const catchAge = clock - (actor?.catchAt ?? -10);
    const startle = caught && !reduced ? Math.sin(clamp((catchAge - .14) / .30) * Math.PI) : 0;
    const rebound = caught && !reduced ? Math.sin(clamp((catchAge - .44) / .24) * Math.PI) : 0;
    const shake = caught && !reduced && catchAge < .65 ? Math.sin(catchAge * 45) * (1 - catchAge / .65) * location.height * .025 : 0;
    const away = location.x < stage.bowl.x ? -1 : 1;
    const knockback = caught && !reduced ? Math.sin(clamp((catchAge-.18)/.5)*Math.PI)*location.height*.10 : 0;
    const x = location.x + shake + away*knockback, foot = location.foot - bob + (startle * .035 - rebound * .05) * location.height;
    const innocencePop = innocent && !reduced ? Math.sin(clamp((clock-(actor?.innocentAt??clock))/.14)*Math.PI)*.055 : 0;
    const self = player.id === viewerId;
    const level = voiceLevel(levels, player);
    g.save();
    if (player.online === false) g.globalAlpha = .63;
    const shadowRadius = location.height * .36;
    ellipse(x, location.foot - 2, shadowRadius, location.height * .037, '#352b4230');
    if (self || level > .035) {
      g.beginPath(); g.ellipse(x, location.foot - 2, shadowRadius * (1 + level * .1), location.height * .075, 0, 0, TAU);
      g.strokeStyle = caught ? '#e99371' : level > .035 ? '#bfd39b' : '#f5dc9b';
      g.lineWidth = self ? 3 : 2;
      g.globalAlpha *= .85; g.stroke(); g.globalAlpha /= .85;
    }
    if (caught && !reduced && catchAge >= .16 && catchAge < .60) {
      const progress = (catchAge - .16) / .44;
      g.save(); g.globalAlpha *= 1 - progress;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.05 + i * .22);
        const spread = location.height * (.30 + progress * .20);
        ellipse(x + Math.cos(a) * spread, foot - location.height * .30 + Math.sin(a) * spread,
          location.height * .095, location.height * .075, '#f4e8cc', a);
        g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
      }
      g.restore();
    }
    // The three supplied characters repeat for the six seats; each seat's bow
    // and badge retain a separate accent without recoloring the source artwork.
    const spriteKey = motion.frame===3 && !caught ? 'innocent' : 'thieves';
    const spriteIndex = spriteKey==='innocent' ? base : base + (caught ? 3 : motion.frame) * 3;
    const drawing = frames[spriteKey]?.[spriteIndex];
    const drawHeight = drawing ? location.height * drawing.h / drawing.referenceH : location.height;
    const squash = bodyStretch * (1 - startle * .32 + rebound * .09 + innocencePop);
    const rotation = bend + away*startle*.16;
    if (actor) {
      // Follow the actual flattened crown so the broom lands on the character
      // instead of hovering at the height of its former standing pose.
      const crownY = -location.height * .96 * squash;
      actor.bonkTarget = {x:x - Math.sin(rotation) * crownY, y:foot + Math.cos(rotation) * crownY};
    }
    sprite(spriteKey, spriteIndex, x, foot, drawHeight, 1, rotation, squash, location.x > stage.bowl.x, caught ? 1.08 : Infinity);
    if (avatar >= 3) {
      const bx = x + location.height * .16, by = foot - location.height * .81;
      g.save(); g.translate(bx, by); g.rotate(.15);
      candy(0, 0, location.height * .057, CANDY[avatar % CANDY.length], -.2); g.restore();
    }
    if (stealing && !reduced) {
      const direction = x < width * .5 ? 1 : -1;
      const handX = x + direction * location.height * .43, handY = foot - location.height * .54;
      line(handX, handY, handX + direction * 5, handY - 4, INK, 1.3);
      line(handX + direction * 2, handY + 7, handX + direction * 8, handY + 6, INK, 1.3);
    }
    if (caught) {
      for (let i = 0; i < 3; i++) {
        const a = (reduced ? .4 : clock * 3) + i * TAU / 3;
        star(x + Math.cos(a) * location.height * .22, foot - location.height * .99 + Math.sin(a) * location.height * .05, location.height * .043, i % 2 ? '#eead6b' : '#f5dc93', a * .5);
      }
      g.save(); g.translate(x + location.height * .29, foot - location.height * .78);
      g.scale(location.height * .006, location.height * .006);
      g.beginPath(); g.moveTo(0, -9); g.bezierCurveTo(-9, 2, -6, 10, 0, 10); g.bezierCurveTo(7, 10, 8, 2, 0, -9);
      g.fillStyle = '#a9c8c1'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(); g.restore();
    } else if (innocent && location.height > 60) {
      // A tiny innocent whistle is a reaction mark, not a moving body part.
      const bx = x + location.height * .39, by = foot - location.height * .89;
      ellipse(bx - 11, by + 13, 2, 2, '#f6e8c9');
      ellipse(bx - 7, by + 8, 3, 3, '#f6e8c9');
      ellipse(bx, by, 12, 13, '#f6e8c9'); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();
      text('♪', bx, by + .5, 15, INK);
    }
    if (!player.decoration) {
      const name = self && innocent ? lang === 'zh' ? '装乖中' : 'Who, me?' : String(player.name || '');
      const suffix = self ? lang === 'zh' ? ' ·你' : ' ·you' : '';
      const fontSize = width < 500 ? 10 : 11;
      g.font = `800 ${fontSize}px "Nunito", "Arial Rounded MT Bold", "PingFang SC", sans-serif`;
      const maximum = Math.max(0, Math.min(location.labelWidth, location.height * 1.1));
      const label = fitLabel(name, suffix, Math.max(0, maximum - 12));
      const pillWidth = Math.min(maximum, Math.max(38, g.measureText(label).width + 12));
      const pillY = location.labelAbove ? location.foot-location.height-13 : Math.min(height - 14, location.foot + 10);
      rounded(location.x - pillWidth / 2, pillY - 9, pillWidth, 19, 9.5, self ? '#f9e6af' : '#f3e6ce');
      g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
      text(label, location.x, pillY + .3, fontSize, INK);
    }
    g.restore();
  }

  function paintBonks(stage, players, model, reduced, now, active) {
    if (!active) return;
    for (let i = 0; i < players.length; i++) {
      const actor = actors.get(players[i].id), location = stage.positions[i];
      const age = clock - (actor?.catchAt ?? -10);
      const eventAge = now - (actor?.catchEventAt ?? -Infinity);
      // A background tab can skip visual time. The public catch deadline still
      // expires its bonk, while a local pause keeps both clocks unchanged.
      if (!actor || age < 0 || age > .68 || eventAge < 0 || eventAge > 680 || players[i].stunnedUntil <= now) continue;
      if (!actor.bonkOrigin) {
        actor.bonkOrigin = model.broomOrigin || {x:stage.hostess.x - stage.hostess.height * .18, y:stage.hostess.foot - stage.hostess.height * .73};
      }
      const source = actor.bonkOrigin;
      const target = actor.bonkTarget || {x:location.x, y:location.foot - location.height * .96};
      const control = {x:mix(source.x,target.x,.58), y:Math.max(68,Math.min(source.y,target.y) - height * .085)};
      const approach = smooth(age / .22), retract = smooth((age - .32) / .30);
      const progress = reduced ? 1 : approach * (1 - retract * .38);
      const point = {x:(1-progress)**2*source.x + 2*(1-progress)*progress*control.x + progress**2*target.x,
        y:(1-progress)**2*source.y + 2*(1-progress)*progress*control.y + progress**2*target.y};
      g.save();
      g.globalAlpha = reduced ? 1 : smooth(age / .045) * (1 - retract);
      if (!reduced) {
        g.beginPath(); g.moveTo(source.x, source.y);
        g.quadraticCurveTo(control.x, control.y, target.x, target.y);
        g.strokeStyle = '#fff4ccad'; g.lineWidth = clamp(location.height*.09,3,12); g.stroke();
        g.strokeStyle = '#cb874c90'; g.lineWidth = 2; g.stroke();
      }
      const angle = Math.atan2(source.y-point.y, source.x-point.x) - Math.PI / 2;
      broom(point.x, point.y - location.height * .015, clamp(location.height * .16,8,29), angle);
      if (age >= .18 && age <= .42) {
        const size = reduced ? 7 : 9 + Math.sin(clamp((age - .18) / .24) * Math.PI) * 12;
        star(target.x, target.y + 5, size, '#f4ce79', -.1);
        if(!reduced)for(let ray=0;ray<5;ray++){
          const a=ray*TAU/5+.3;
          line(target.x+Math.cos(a)*size*1.35,target.y+Math.sin(a)*size*1.35,target.x+Math.cos(a)*size*1.75,target.y+Math.sin(a)*size*1.75,INK,1.7);
        }
      }
      g.restore();
    }
  }

  function paintParticles(stage, players, reduced) {
    const locations = new Map(players.map((player, i) => [player.id, stage.positions[i]]));
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i], age = clock - particle.at - (particle.delay || 0);
      const duration = particle.type === 'bank' ? 1.25 : particle.type === 'confetti' ? 3.3 : particle.type === 'confiscate' ? .8 : .62;
      if (age > duration) {particles.splice(i, 1); continue;}
      if (age < 0) continue;
      const loc = locations.get(particle.playerId);
      g.save();
      if (particle.type === 'candy' && loc && !reduced) {
        const progress = clamp(age / duration), eased = smooth(progress);
        const startX = stage.bowl.pile?.x ?? stage.bowl.x, startY = stage.bowl.pile?.y ?? stage.bowl.y - stage.bowl.radius * .4;
        const endX = loc.x + (loc.x < width * .5 ? 1 : -1) * loc.height * .19, endY = loc.foot - loc.height * .44;
        const x = mix(startX, endX, eased), y = mix(startY, endY, eased) - Math.sin(progress * Math.PI) * stage.bowl.radius * .85;
        g.globalAlpha = Math.min(1, (1 - progress) * 6);
        candy(x, y, candySize(stage.bowl), particle.color, progress * 4 + particle.seed % 3);
      } else if (particle.type === 'confiscate' && loc && !reduced) {
        const progress = clamp(age / duration), side = particle.index % 2 ? -1 : 1;
        const spread = .24 + particle.index * .055;
        const x = loc.x + side * loc.height * (.20 + progress * spread);
        const y = loc.foot - loc.height * .35 - Math.sin(progress * Math.PI) * loc.height * .14 + progress * progress * loc.height * .44;
        g.globalAlpha = Math.min(1, (1-progress) * 3);
        candy(x, y, candySize(stage.bowl), particle.color, side * progress * 5 + particle.index);
      } else if (particle.type === 'bank' && loc) {
        const progress = clamp(age / duration);
        g.globalAlpha = Math.min(1, (1 - progress) * 4);
        const y = loc.foot - loc.height * .67 - (reduced ? 0 : progress * 31);
        const value = `+${particle.count}`;
        g.font = `900 ${width < 500 ? 18 : 23}px "Fredoka", "Nunito", sans-serif`;
        g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = '#fff5d9'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.strokeText(value, loc.x, y); g.fillStyle = INK; g.fillText(value, loc.x, y);
      } else if (particle.type === 'confetti' && !reduced) {
        const progress = clamp(age / duration);
        const pop = Math.sin(Math.min(1, age / .42) * Math.PI * .5);
        const x = width * .5 + Math.cos(particle.angle) * particle.speed * pop * width * .46;
        const y = height * .36 + Math.sin(particle.angle) * particle.speed * pop * height * .34 + age * age * height * .16;
        g.globalAlpha = Math.min(1, age * 8) * (1 - progress);
        const spin = particle.angle + age * particle.spin;
        const size = 7 + particle.index % 4 * 2.2;
        if (particle.shape === 1) candy(x, y, size * .5, particle.color, spin);
        else if (particle.shape === 2) star(x, y, size, particle.color, spin);
        else flower(x, y, size, particle.color, spin);
      }
      g.restore();
    }
  }

  function update(room, viewerId, options = {}) {
    if (disposed) return;
    const givenTime = Number(options.time);
    const nextClock = Number.isFinite(givenTime) ? givenTime : (globalThis.performance?.now?.() ?? Date.now()) / 1000;
    // Home uses RAF seconds; a match may use epoch seconds or a paused clock.
    // Accumulate a local visual clock so changing origins cannot strand a
    // transition in the future. Gameplay timing still comes only from `now`.
    const elapsed = lastClock === null ? 0 : nextClock - lastClock;
    const dt = elapsed < 0 || elapsed > 2 ? 0 : clamp(elapsed, 0, .05);
    clock += dt; lastClock = nextClock;
    const now = Number.isFinite(options.now) ? options.now : Number(room?.serverNow) || Date.now();
    const lang = options.lang === 'en' ? 'en' : 'zh';
    const reduced = env.reduced();
    const players = room?.players?.filter(player => !player.left).slice(0, 6) || Array.from({length:options.previewCount===2?2:1},(_,i)=>({id:'preview-'+i,avatar:((Number(options.avatar)||0)+i)%3,decoration:true}));
    const stage = sceneLayout(width, height, Math.max(1, players.length),assets.room?.naturalWidth||1672,assets.room?.naturalHeight||941);
    synchronize(room, players, now, options.holding, viewerId, reduced);
    const hostess = prepareHostess(room, stage, players, viewerId, now, reduced, dt);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    g.clearRect(0, 0, width, height);
    paintBackground(reduced,stage);
    paintHostess(hostess, stage, reduced);
    paintBowl(stage, hostess.attention, reduced);
    const sorted = players.map((player, index) => ({player, index, location: stage.positions[index]})).sort((a, b) => a.location.foot - b.location.foot);
    for (const item of sorted) paintPlayer(item.player, item.index, item.location, room, viewerId, now, reduced, options.levels, dt, lang, stage);
    paintBonks(stage, players, hostess, reduced, now, room?.phase === 'playing');
    paintParticles(stage, players, reduced);
    if (hostess.attention === 'warning') {
      const progress = hostess.warningProgress ?? 0;
      g.save(); g.globalAlpha = .07 + progress * .1;
      g.strokeStyle = '#e1a26c'; g.lineWidth = 6; g.strokeRect(3, 3, width - 6, height - 6); g.restore();
    }
  }

  function dispose() {
    disposed = true; observer?.disconnect(); env.win.removeEventListener?.('resize', resize);
    particles.length = 0; actors.clear(); assets = {}; frames = {};
  }
  return {update, dispose, ready, retryAssets: loadAssets};
}
