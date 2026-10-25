/**
 * The hero sky.
 *
 * Night: a three-layer starfield over a faint nebula band, with meteors radiating from Aries.
 * Meteors are drawn as tapered streaks that brighten fast and fade slowly, leave a short glowing
 * train, and now and then one flares into a fireball that sheds sparks.
 *
 * Day: the Daytime Arietids fall in daylight and were found by radar, so the same shower is shown
 * as a radar scope. Meteors are faint pencil strokes; the sweep only "sees" one when it passes over
 * it, leaving an echo that fades like phosphor.
 *
 * The radiant can be pinned to an element (the hero's astrolabe), so meteors burst out from behind
 * it and the radar scope is centred on it. Elements passed as `shield` (the hero copy) get a soft
 * zone where meteors and nebula dim, so nothing streaks across the text at full brightness.
 *
 * The sky is a stack of layers in the host element, so each frame only redraws what moves:
 *   back   a canvas painted once per resize/theme (nebula, dust, scope rings); the pointer drift
 *          is a transform on it
 *   sweep  day only: the radar's phosphor tail and leading line, turned by a compositor animation
 *   halo   the radiant's glow, its slow pulse a compositor opacity animation
 *   live   the only per-frame canvas: stars, meteors, trains, sparks, echoes
 * The header clearance is part of the host's CSS mask (--sky-cut, see base.css), not a canvas pass.
 * Everything pauses off-screen, in background tabs, and with motion paused; reduced motion gets one
 * still frame.
 */
import { seeded } from '~/lib/random';
import { isStill, onMotionChange } from '~/scripts/motion';

type RGB = [number, number, number];
type Star = { x: number; y: number; r: number; a: number; tw: number; ph: number; depth: number; tint: 0 | 1 | 2 };
type Meteor = {
  dx: number;
  dy: number;
  ang: number;
  d0: number;
  speed: number;
  len: number;
  life: number;
  born: number;
  width: number;
  fireball: boolean;
  seen: boolean;
};
type Train = { x1: number; y1: number; x2: number; y2: number; born: number; width: number };
type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number };
type Echo = { x: number; y: number; born: number; strong: boolean };
type Box = { x0: number; y0: number; x1: number; y1: number };

export type SkyOptions = {
  /** Radiant position as fractions of the canvas box, used when there is no anchor. */
  radiant: { x: number; y: number };
  /** Element whose centre is the radiant; its half-width is the radius meteors start outside of. */
  anchor?: HTMLElement | null;
  /** Elements to keep readable: meteors and nebula fade around them. */
  shield?: HTMLElement[];
  /** Mean milliseconds between meteors. */
  rate?: number;
  /** Draw the nebula band (hero) or keep the sky plain (small canvases). */
  nebula?: boolean;
  /** Day: let the sweep leave echoes (false on the 404, where the scope finds nothing). */
  echoes?: boolean;
};

const TAU = Math.PI * 2;
/** One turn of the radar sweep, and one breath of the halo (dim and back). */
const SWEEP_MS = 5712;
/** Below this much of the sky in view, it rests (the bottom of the hero is faded out anyway). */
const MIN_VISIBLE = 0.12;
const FRAME_MS = 1000 / 60;

export function mountSky(host: HTMLElement, opts: SkyOptions) {
  const back = document.createElement('canvas');
  const sweepBox = document.createElement('div');
  const rotor = document.createElement('div');
  const tail = document.createElement('div');
  const beam = document.createElement('div');
  const halo = document.createElement('div');
  const live = document.createElement('canvas');
  rotor.append(tail, beam);
  sweepBox.append(rotor);
  host.append(back, sweepBox, halo, live);
  const ctx = live.getContext('2d');
  const bctx = back.getContext('2d');
  if (!ctx || !bctx) return { burst() {}, destroy() {} };

  const abs = 'position:absolute;pointer-events:none;';
  sweepBox.style.cssText = `${abs}inset:0;`;
  rotor.style.cssText = `${abs}width:0;height:0;transform-origin:0 0;`;
  tail.style.cssText = `${abs}border-radius:50%;`;
  // A hairline as a 3px box with soft edges: a 1px box turned to an arbitrary angle rasterizes as
  // a heavy, stepped line, a feathered one as a clean 1.1px stroke.
  beam.style.cssText = `${abs}height:3px;mask-image:linear-gradient(transparent 0.7px, #000 1.2px, #000 1.8px, transparent 2.3px);`;
  halo.style.cssText = abs;
  // Compositor animations: the sweep turns at the old canvas rate, the halo breathes on the same beat.
  const turn = rotor.animate([{ transform: 'rotate(0turn)' }, { transform: 'rotate(1turn)' }], { duration: SWEEP_MS, iterations: Infinity });
  const breathe = halo.animate([{ opacity: 1 }, { opacity: 0.7 }], {
    duration: SWEEP_MS / 2,
    iterations: Infinity,
    direction: 'alternate',
    easing: 'ease-in-out',
  });
  turn.pause();
  breathe.pause();
  // The sweep starts pointing up, as it always has.
  turn.currentTime = SWEEP_MS * 0.75;

  const baseRate = opts.rate ?? 820;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let stars: Star[][] = [[], [], []];
  let meteors: Meteor[] = [];
  let trains: Train[] = [];
  let sparks: Spark[] = [];
  let echoes: Echo[] = [];
  let palette = readPalette();
  let day = isDay();
  let nextSpawn = 0;
  let raf = 0;
  let running = false;
  let destroyed = false;
  let visible = true;
  let last = performance.now();
  let nextFrame = last;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let drift = '';
  // Radiant centre and the radius of the instrument around it (0 without an anchor).
  let R = { x: 0, y: 0, r: 0 };
  let shields: Box[] = [];
  /** Bottom of the header bar in canvas space; static stars stay below it. */
  let cut = 0;
  /** Diffraction spikes, one gradient per tint, reused every frame (see drawStars). */
  let spikes: CanvasGradient[][] = [];
  const SPIKE = 8;

  function isDay() {
    return document.documentElement.dataset.theme === 'day';
  }

  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const rgb = (name: string): RGB => cs.getPropertyValue(name).trim().split(/\s+/).map(Number) as RGB;
    return {
      star: rgb('--sky-star'),
      cool: rgb('--sky-star-cool'),
      meteor: rgb('--sky-meteor'),
      radiant: rgb('--sky-radiant'),
      nebulaA: rgb('--sky-nebula-a'),
      nebulaB: rgb('--sky-nebula-b'),
      scope: rgb('--sky-scope'),
    };
  }

  const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const css = (c: RGB, a: number) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${+a.toFixed(4)})`;
  const px = (n: number) => `${n.toFixed(2)}px`;

  /** Read the anchor and shield boxes relative to the canvas. */
  function measure() {
    const c = host.getBoundingClientRect();
    const a = opts.anchor?.getBoundingClientRect();
    if (opts.anchor && a && a.width > 0) {
      // The radius comes from the layout size: the entrance scale and the pointer tilt change the
      // box but not the instrument. Both are centred, so the box centre is still right.
      const size = opts.anchor.offsetWidth || a.width;
      R = { x: a.left + a.width / 2 - c.left, y: a.top + a.height / 2 - c.top, r: (size / 2) * 0.97 };
    } else {
      R = { x: opts.radiant.x * w, y: opts.radiant.y * h, r: 0 };
    }
    shields = (opts.shield ?? [])
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0)
      .map((b) => ({ x0: b.left - c.left, y0: b.top - c.top, x1: b.right - c.left, y1: b.bottom - c.top }));
    // A star between two nav links reads as punctuation, so the header bar is kept clear: the
    // host's mask fades the whole sky out over it.
    const header = document.querySelector<HTMLElement>('[data-header]');
    cut = header ? header.offsetHeight - (c.top + scrollY) : 0;
    host.style.setProperty('--sky-cut', px(Math.max(0, cut)));
    host.style.setProperty('--sky-feather', cut > 0 ? '40px' : '0px');
  }

  /** 1 in open sky, falling to about a quarter over shielded text, with a soft 70px edge. */
  function clearance(x: number, y: number) {
    let f = 1;
    for (const b of shields) {
      const dx = Math.max(b.x0 - x, 0, x - b.x1);
      const dy = Math.max(b.y0 - y, 0, y - b.y1);
      const d = Math.hypot(dx, dy);
      const k = Math.min(1, d / 70);
      f = Math.min(f, 0.24 + 0.76 * k * k * (3 - 2 * k));
    }
    return f;
  }

  /* ---------- static layers ---------- */

  function paintBackdrop() {
    // Painted once, so it can afford full resolution even where the live canvas cannot.
    const bdpr = Math.min(window.devicePixelRatio || 1, 2);
    back.width = Math.round(w * bdpr);
    back.height = Math.round(h * bdpr);
    bctx!.setTransform(bdpr, 0, 0, bdpr, 0, 0);
    bctx!.clearRect(0, 0, w, h);
    const rand = seeded(1947);
    if (day) {
      paintScope(rand);
      carveShields(0.55);
    } else {
      if (opts.nebula !== false) paintNebula(rand);
      paintDust(rand, 0.9);
      carveShields(0.75);
    }
  }

  /** Band geometry: a line through the radiant, steep on wide screens and flatter on tall ones. */
  function band() {
    const ang = w >= h ? -1.08 : -0.38;
    const L = Math.hypot(w, h);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    return { x0: R.x - ux * L * 0.75, y0: R.y - uy * L * 0.75, x1: R.x + ux * L * 0.55, y1: R.y + uy * L * 0.55 };
  }

  /** Soft elliptical holes in the backdrop behind shielded text. */
  function carveShields(strength: number) {
    bctx!.save();
    bctx!.globalCompositeOperation = 'destination-out';
    for (const b of shields) {
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      const rx = (b.x1 - b.x0) / 2 + 60;
      const ry = (b.y1 - b.y0) / 2 + 50;
      bctx!.save();
      bctx!.translate(cx, cy);
      bctx!.scale(rx / ry, 1);
      const g = bctx!.createRadialGradient(0, 0, 0, 0, 0, ry);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.6, `rgba(0,0,0,${strength * 0.7})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      bctx!.fillStyle = g;
      bctx!.fillRect(-ry, -ry, ry * 2, ry * 2);
      bctx!.restore();
    }
    bctx!.restore();
  }

  /** A soft band of cloud through the radiant, built from many faint blobs, with darker dust lanes.
   *  It is brightest around the instrument and thins out toward both ends. */
  function paintNebula(rand: () => number) {
    const { nebulaA, nebulaB } = palette;
    const diag = Math.hypot(w, h);
    const { x0, y0, x1, y1 } = band();
    const tR = 0.75 / 1.3; // where the radiant sits along the band
    bctx!.save();
    bctx!.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 160; i++) {
      const t = rand();
      const wobble = Math.sin(t * 7.3) * 0.06 + (rand() - 0.5) * 0.16;
      const x = x0 + (x1 - x0) * t + wobble * h * 0.8;
      const y = y0 + (y1 - y0) * t - wobble * w * 0.25;
      const r = diag * (0.03 + rand() * 0.08);
      const warm = rand() > 0.62;
      const c = warm ? nebulaB : nebulaA;
      const falloff = 1 - 0.7 * Math.min(1, Math.abs(t - tR) / 0.55);
      const g = bctx!.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, (0.022 + rand() * 0.024) * falloff));
      g.addColorStop(1, rgba(c, 0));
      bctx!.fillStyle = g;
      bctx!.fillRect(x - r, y - r, r * 2, r * 2);
    }
    bctx!.restore();
    // Keep the sky right behind the instrument dark, so the gilt ring stays crisp against it.
    if (R.r) {
      bctx!.save();
      bctx!.globalCompositeOperation = 'destination-out';
      const hole = bctx!.createRadialGradient(R.x, R.y, R.r * 0.8, R.x, R.y, R.r * 1.45);
      hole.addColorStop(0, 'rgba(0,0,0,0.85)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      bctx!.fillStyle = hole;
      bctx!.fillRect(R.x - R.r * 1.5, R.y - R.r * 1.5, R.r * 3, R.r * 3);
      bctx!.restore();
    }
    // Dust lanes: carve a little darkness back out of the band.
    bctx!.save();
    bctx!.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const t = 0.15 + rand() * 0.75;
      const x = x0 + (x1 - x0) * t + (rand() - 0.5) * w * 0.08;
      const y = y0 + (y1 - y0) * t + (rand() - 0.5) * h * 0.08;
      const r = diag * (0.015 + rand() * 0.04);
      const g = bctx!.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      bctx!.fillStyle = g;
      bctx!.fillRect(x - r, y - r, r * 2, r * 2);
    }
    bctx!.restore();
  }

  /** Thousands of faint motes, denser along the band, drawn once. */
  function paintDust(rand: () => number, strength: number) {
    const { star, cool } = palette;
    const n = Math.round(Math.min(2600, (w * h) / 520));
    for (let i = 0; i < n; i++) {
      let x = rand() * w;
      let y = rand() * h;
      if (opts.nebula !== false && rand() < 0.45) {
        const b = band();
        const t = rand();
        const spread = (rand() - 0.5) * 0.28;
        x = b.x0 + (b.x1 - b.x0) * t + spread * h * 0.8;
        y = b.y0 + (b.y1 - b.y0) * t - spread * w * 0.25;
      }
      const a = (0.04 + rand() * 0.22) * strength;
      bctx!.fillStyle = rgba(rand() > 0.7 ? cool : star, a);
      const s = rand() > 0.97 ? 1.2 : 0.7;
      bctx!.fillRect(x, y, s, s);
    }
  }

  /** Scope ring radii: they continue the astrolabe's geometry outward from its rim. */
  function rings() {
    const r0 = R.r || 70;
    const maxR = Math.hypot(Math.max(R.x, w - R.x), Math.max(R.y, h - R.y));
    const out: number[] = [];
    for (let k = 1.16; r0 * k < maxR; k += 0.42) out.push(r0 * k);
    return { r0, maxR, out };
  }

  /** Day: a radar scope centred on the radiant. Range rings, bearing ticks, spokes, paper grain. */
  function paintScope(rand: () => number) {
    const c = palette.scope;
    const { r0, maxR, out } = rings();
    bctx!.save();
    bctx!.lineWidth = 1;
    out.forEach((r, i) => {
      const fade = Math.max(0.35, 1 - (r - r0) / (maxR * 1.1));
      bctx!.strokeStyle = rgba(c, (i % 2 ? 0.08 : 0.15) * fade);
      bctx!.setLineDash(i % 2 ? [1, 5] : []);
      bctx!.beginPath();
      bctx!.arc(R.x, R.y, r, 0, TAU);
      bctx!.stroke();
    });
    bctx!.setLineDash([]);
    // Bearing ticks on the first and third rings, longer every 30 degrees (as on the astrolabe).
    for (const r of [out[0], out[2]]) {
      if (!r) continue;
      for (let deg = 0; deg < 360; deg += 5) {
        const a = (deg * Math.PI) / 180;
        const len = deg % 30 === 0 ? 10 : 4;
        bctx!.strokeStyle = rgba(c, deg % 30 === 0 ? 0.26 : 0.13);
        bctx!.beginPath();
        bctx!.moveTo(R.x + Math.cos(a) * r, R.y + Math.sin(a) * r);
        bctx!.lineTo(R.x + Math.cos(a) * (r + len), R.y + Math.sin(a) * (r + len));
        bctx!.stroke();
      }
    }
    // Spokes start at the scope's inner ring, so they never cross the instrument.
    const inner = out[0] ?? r0;
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      bctx!.strokeStyle = rgba(c, k % 3 === 0 ? 0.08 : 0.04);
      bctx!.beginPath();
      bctx!.moveTo(R.x + Math.cos(a) * inner, R.y + Math.sin(a) * inner);
      bctx!.lineTo(R.x + Math.cos(a) * maxR, R.y + Math.sin(a) * maxR);
      bctx!.stroke();
    }
    bctx!.restore();
    const n = Math.round((w * h) / 1600);
    for (let i = 0; i < n; i++) {
      bctx!.fillStyle = rgba(c, 0.03 + rand() * 0.05);
      bctx!.fillRect(rand() * w, rand() * h, 0.8, 0.8);
    }
  }

  /** The radiant's warm halo behind the instrument (or a free-standing glow when there is none). */
  function placeHalo() {
    const c = palette.radiant;
    const outer = R.r ? R.r * 1.75 : 170;
    const inner = R.r * 0.6;
    const mid = inner + 0.4 * (outer - inner);
    Object.assign(halo.style, {
      left: px(R.x - outer),
      top: px(R.y - outer),
      width: px(outer * 2),
      height: px(outer * 2),
      background: `radial-gradient(circle closest-side, ${css(c, day ? 0.1 : 0.2)} ${px(inner)}, ${css(c, day ? 0.035 : 0.07)} ${px(mid)}, ${css(c, 0)} ${px(outer)})`,
    });
  }

  /** Day: the sweep's phosphor tail (brightest just behind the leading edge, fading in angle and in
   *  range, so it reads as afterglow rather than a slice of pie) and its thin ink leading line. The
   *  host box masks both around shielded text; the rotor turns them. */
  function placeSweep() {
    sweepBox.style.display = day ? '' : 'none';
    if (!day) return;
    const { r0, maxR, out } = rings();
    const inner = out[0] ?? r0;
    const outerR = Math.min(maxR, (out[3] ?? r0 * 2.6) * 1.12);
    const c = palette.radiant;
    const ink = palette.scope;
    const trail = 1.25;
    const f = trail / TAU;
    rotor.style.left = px(R.x);
    rotor.style.top = px(R.y);
    // The tail at rotor angle 0 has its leading edge pointing right (CSS conic angles start at the top).
    Object.assign(tail.style, {
      left: px(-outerR),
      top: px(-outerR),
      width: px(outerR * 2),
      height: px(outerR * 2),
      background: `conic-gradient(from ${(90 - (trail * 180) / Math.PI).toFixed(3)}deg, ${css(c, 0)} 0turn, ${css(c, 0.06)} ${(f * 0.5).toFixed(4)}turn, ${css(c, 0.22)} ${(f * 0.9).toFixed(4)}turn, ${css(c, 0.34)} ${f.toFixed(4)}turn, ${css(c, 0)} ${(f + 0.004).toFixed(4)}turn)`,
    });
    // Range falloff: zero at the instrument's rim, peak a little outside it, gone by the outer ring.
    const r1 = inner * 0.98;
    const at = (t: number) => px(r1 + t * (outerR - r1));
    tail.style.maskImage = `radial-gradient(circle closest-side, transparent ${at(0)}, #000 ${at(0.12)}, rgb(0 0 0 / 0.6) ${at(0.45)}, transparent ${at(1)})`;
    Object.assign(beam.style, {
      left: px(inner),
      top: '-1.5px',
      width: px(maxR - inner),
      background: `linear-gradient(to right, ${css(ink, 0.5)}, ${css(ink, 0.22)} 35%, ${css(ink, 0)})`,
    });
    // Keep the copy clean: tail and line both fade around shielded text (each ellipse multiplies).
    const holes = shields.map((b) => {
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      return `radial-gradient(${px((b.x1 - b.x0) / 2 + 50)} ${px((b.y1 - b.y0) / 2 + 40)} at ${px(cx)} ${px(cy)}, rgb(0 0 0 / 0.15), rgb(0 0 0 / 0.4) 65%, #000)`;
    });
    sweepBox.style.maskImage = holes.join(',');
    sweepBox.style.maskComposite = holes.map(() => 'intersect').join(',');
  }

  /** The sweep's bearing, read from the compositor animation that draws it. */
  function sweepAngle() {
    const t = Number(turn.currentTime ?? 0);
    return ((t % SWEEP_MS) / SWEEP_MS) * TAU;
  }

  /* ---------- live layer ---------- */

  function resize() {
    if (destroyed) return;
    const rect = host.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, w < 700 ? 1.5 : 2);
    live.width = Math.round(w * dpr);
    live.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure();
    const rand = seeded(20260607);
    const count = Math.round(Math.min(420, Math.max(90, (w * h) / 3600)));
    const all = Array.from({ length: count }, (): Star => {
      const big = rand() > 0.9;
      const t = rand();
      return {
        x: rand(),
        y: rand(),
        r: big ? 1.1 + rand() * 1.1 : 0.45 + rand() * 0.7,
        a: 0.35 + rand() * 0.65,
        tw: 0.0005 + rand() * 0.0016,
        ph: rand() * TAU,
        depth: 0.2 + rand() * 0.8,
        tint: t > 0.88 ? 2 : t > 0.62 ? 1 : 0,
      };
    });
    // Grouped by tint, so a frame sets each colour once and varies only the alpha.
    stars = [0, 1, 2].map((t) => all.filter((s) => s.tint === t));
    makeSpikes();
    paintBackdrop();
    placeHalo();
    placeSweep();
    if (!running) still();
  }

  /** Spike gradients along +x and +y around the origin, drawn under a per-star translate and scale. */
  function makeSpikes() {
    const tints = [palette.star, palette.cool, palette.meteor];
    spikes = tints.map((c) =>
      [
        [-SPIKE, 0, SPIKE, 0],
        [0, -SPIKE, 0, SPIKE],
      ].map(([x0, y0, x1, y1]) => {
        const g = ctx!.createLinearGradient(x0!, y0!, x1!, y1!);
        g.addColorStop(0, rgba(c, 0));
        g.addColorStop(0.5, rgba(c, 1));
        g.addColorStop(1, rgba(c, 0));
        return g;
      }),
    );
  }

  function spawn(now: number, forceFireball = false) {
    // Aim at a random point on screen so meteors cover the whole sky and never fly toward the radiant.
    const tx = Math.random() * w;
    const ty = Math.random() * h;
    const ang = Math.atan2(ty - R.y, tx - R.x) + (Math.random() - 0.5) * 0.1;
    const diag = Math.hypot(w, h);
    // With an instrument at the radiant, meteors appear just outside its rim, as if from behind it.
    const d0 = R.r ? R.r + 10 + Math.random() * diag * 0.32 : diag * (0.05 + Math.random() * 0.4);
    // Perspective: near the radiant meteors look short and slow, far away long and fast.
    const far = d0 / diag;
    const fireball = forceFireball || Math.random() < 0.06;
    meteors.push({
      dx: Math.cos(ang),
      dy: Math.sin(ang),
      ang,
      d0,
      speed: (0.22 + far * 1.2 + Math.random() * 0.25) * (fireball ? 1.15 : 1),
      len: (50 + far * 340 + Math.random() * 60) * (fireball ? 1.5 : 1),
      life: (620 + Math.random() * 620) * (fireball ? 1.35 : 1),
      born: now,
      width: (0.9 + Math.random() * 1.1 + far * 1.2) * (fireball ? 1.9 : 1),
      fireball,
      seen: false,
    });
  }

  /** Brightness over a meteor's life: a fast rise, then a slow fade. */
  function envelope(t: number) {
    return t < 0.18 ? t / 0.18 : Math.pow(1 - (t - 0.18) / 0.82, 1.6);
  }

  function drawStars(now: number) {
    const { star, cool, meteor } = palette;
    const dim = day ? 0.32 : 1;
    const rim = R.r * 0.92;
    [star, cool, meteor].forEach((c, tint) => {
      ctx!.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      for (const s of stars[tint]!) {
        const tw = 0.62 + 0.38 * Math.sin(now * s.tw + s.ph);
        const px = s.x * w + pointer.x * s.depth * 16;
        const py = s.y * h + pointer.y * s.depth * 11;
        if (R.r && Math.hypot(px - R.x, py - R.y) < rim) continue;
        const below = Math.min(1, (py - cut) / 40);
        if (below <= 0) continue;
        const a = s.a * tw * dim * below;
        ctx!.globalAlpha = a;
        if (s.r < 1) {
          ctx!.fillRect(px, py, s.r * 1.7, s.r * 1.7);
          continue;
        }
        ctx!.beginPath();
        ctx!.arc(px, py, s.r, 0, TAU);
        ctx!.fill();
        if (!day && s.r > 1.6) {
          // Diffraction spikes on the brightest stars: two thin bars, stretched to length k.
          const k = s.r * 4.2 * tw;
          const [hz, vt] = spikes[tint]!;
          ctx!.globalAlpha = a * 0.55;
          ctx!.save();
          ctx!.translate(px, py);
          ctx!.scale(k / SPIKE, 1);
          ctx!.fillStyle = hz!;
          ctx!.fillRect(-SPIKE, -0.35, SPIKE * 2, 0.7);
          ctx!.restore();
          ctx!.save();
          ctx!.translate(px, py);
          ctx!.scale(1, k / SPIKE);
          ctx!.fillStyle = vt!;
          ctx!.fillRect(-0.35, -SPIKE, 0.7, SPIKE * 2);
          ctx!.restore();
          ctx!.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        }
      }
    });
    ctx!.globalAlpha = 1;
  }

  /** A small reticle marks a free-standing radiant at night, turning slowly. */
  function drawReticle(now: number) {
    if (day || R.r) return;
    const c = palette.radiant;
    ctx!.save();
    ctx!.translate(R.x + pointer.x * 6, R.y + pointer.y * 4);
    ctx!.rotate(now * 0.00008);
    ctx!.strokeStyle = rgba(c, 0.32);
    ctx!.lineWidth = 0.8;
    ctx!.beginPath();
    ctx!.arc(0, 0, 13, 0, TAU);
    ctx!.stroke();
    ctx!.setLineDash([2, 4]);
    ctx!.beginPath();
    ctx!.arc(0, 0, 24, 0, TAU);
    ctx!.stroke();
    ctx!.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      ctx!.rotate(Math.PI / 2);
      ctx!.beginPath();
      ctx!.moveTo(17, 0);
      ctx!.lineTo(30, 0);
      ctx!.stroke();
    }
    ctx!.restore();
  }

  /** A tapered streak: a thin triangle from the tail to a rounded head. */
  function streak(tx: number, ty: number, hx: number, hy: number, width: number, head: RGB, tail: RGB, alpha: number) {
    const dx = hx - tx;
    const dy = hy - ty;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const g = ctx!.createLinearGradient(tx, ty, hx, hy);
    g.addColorStop(0, rgba(tail, 0));
    g.addColorStop(0.65, rgba(tail, alpha * 0.4));
    g.addColorStop(1, rgba(head, alpha));
    ctx!.fillStyle = g;
    ctx!.beginPath();
    ctx!.moveTo(tx, ty);
    ctx!.lineTo(hx + nx * width * 0.5, hy + ny * width * 0.5);
    ctx!.arc(hx, hy, width * 0.5, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true);
    ctx!.closePath();
    ctx!.fill();
  }

  function drawMeteors(now: number, frozen = false) {
    const c = palette.meteor;
    const white: RGB = day ? palette.meteor : [255, 250, 236];
    const sweep = day ? sweepAngle() : 0;
    meteors = meteors.filter((m) => {
      const age = now - m.born;
      const t = age / m.life;
      const dist = m.d0 + m.speed * age;
      const hx = R.x + m.dx * dist;
      const hy = R.y + m.dy * dist;
      // Tails stop short of the instrument's rim, so every meteor seems to come from behind it.
      const room = R.r ? Math.max(0, dist - R.r - 4) : Infinity;
      if (t >= 1) {
        if (!frozen) {
          const len = Math.min(m.len * 0.55, room);
          if (clearance(hx, hy) > 0.6) trains.push({ x1: hx - m.dx * len, y1: hy - m.dy * len, x2: hx, y2: hy, born: now, width: m.width });
          if (m.fireball && !day && clearance(hx, hy) > 0.6) {
            for (let i = 0; i < 9; i++) {
              const a = m.ang + (Math.random() - 0.5) * 0.9;
              const v = 0.03 + Math.random() * 0.09;
              sparks.push({ x: hx, y: hy, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.01, born: now, life: 500 + Math.random() * 700 });
            }
          }
        }
        return false;
      }
      const env = envelope(Math.min(1, t)) * clearance(hx, hy);
      const len = Math.min(m.len * (0.3 + 0.7 * Math.min(1, t * 2.2)), room);
      const tx = hx - m.dx * len;
      const ty = hy - m.dy * len;
      const alpha = (day ? 0.32 : m.fireball ? 1 : 0.92) * env;
      streak(tx, ty, hx, hy, day ? m.width * 0.6 : m.width, white, c, alpha);
      if (!day) {
        const r = (m.fireball ? 16 : 7) + m.width * 2.4;
        const glow = ctx!.createRadialGradient(hx, hy, 0, hx, hy, r);
        glow.addColorStop(0, `rgba(255,250,236,${(m.fireball ? 0.95 : 0.8) * env})`);
        glow.addColorStop(0.35, rgba(c, 0.35 * env));
        glow.addColorStop(1, rgba(c, 0));
        ctx!.fillStyle = glow;
        ctx!.fillRect(hx - r, hy - r, r * 2, r * 2);
      } else if (!m.seen && opts.echoes !== false) {
        // The sweep finds a meteor when it passes over the meteor's bearing.
        let diff = Math.atan2(hy - R.y, hx - R.x) - sweep;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (diff < 0 && diff > -0.28) {
          m.seen = true;
          echoes.push({ x: hx, y: hy, born: now, strong: m.fireball });
        }
      }
      return !frozen;
    });
  }

  function drawTrains(now: number) {
    const c = palette.meteor;
    ctx!.lineCap = 'round';
    trains = trains.filter((tr) => {
      const t = (now - tr.born) / 900;
      if (t >= 1) return false;
      const a = (day ? 0.08 : 0.16) * (1 - t);
      ctx!.strokeStyle = rgba(c, a);
      ctx!.lineWidth = tr.width * (1 + t * 2.5);
      ctx!.beginPath();
      ctx!.moveTo(tr.x1, tr.y1);
      ctx!.lineTo(tr.x2, tr.y2);
      ctx!.stroke();
      return true;
    });
  }

  function drawSparks(now: number, dt: number) {
    const c = palette.meteor;
    sparks = sparks.filter((s) => {
      const t = (now - s.born) / s.life;
      if (t >= 1) return false;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 0.00004 * dt;
      ctx!.fillStyle = rgba(c, 0.9 * (1 - t));
      ctx!.beginPath();
      ctx!.arc(s.x, s.y, 1.2 * (1 - t) + 0.3, 0, TAU);
      ctx!.fill();
      return true;
    });
  }

  function drawEchoes(now: number) {
    const c = palette.scope;
    const m = palette.meteor;
    echoes = echoes.filter((e) => {
      const t = (now - e.born) / 3600;
      if (t >= 1) return false;
      // An echo is a mark on the scope, not on the copy: none at all over shielded text.
      const open = (clearance(e.x, e.y) - 0.24) / 0.76;
      if (open <= 0.02) return true;
      const fade = Math.pow(1 - t, 1.5) * open;
      ctx!.fillStyle = rgba(m, 0.85 * fade);
      ctx!.beginPath();
      ctx!.arc(e.x, e.y, e.strong ? 3.4 : 2.4, 0, TAU);
      ctx!.fill();
      ctx!.strokeStyle = rgba(c, 0.5 * fade);
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(e.x, e.y, 4 + t * (e.strong ? 30 : 20), 0, TAU);
      ctx!.stroke();
      return true;
    });
  }

  /** Night: the backdrop drifts a little against the pointer for depth (a transform, not a redraw). */
  function moveBackdrop() {
    const next = day ? '' : `${(pointer.x * 5).toFixed(2)}px ${(pointer.y * 4).toFixed(2)}px`;
    if (next !== drift) back.style.translate = drift = next;
  }

  function paint(now: number, dt: number) {
    const follow = 1 - Math.pow(0.95, dt / FRAME_MS);
    pointer.x += (pointer.tx - pointer.x) * follow;
    pointer.y += (pointer.ty - pointer.y) * follow;
    moveBackdrop();
    ctx!.clearRect(0, 0, w, h);
    drawReticle(now);
    drawStars(now);
    drawTrains(now);
    drawMeteors(now);
    drawSparks(now, dt);
    if (day) drawEchoes(now);
  }

  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Keep a 60 Hz phase on every display refresh rate; do not redraw missed frames after a stall.
    if (now + 0.1 < nextFrame) return;
    nextFrame += Math.max(1, Math.floor((now - nextFrame) / FRAME_MS) + 1) * FRAME_MS;
    const dt = Math.min(64, now - last);
    last = now;
    if (now >= nextSpawn) {
      spawn(now);
      const rate = day ? baseRate * 0.7 : baseRate;
      // Exponential gaps, with the occasional burst.
      nextSpawn = now + (Math.random() < 0.08 ? 70 : -Math.log(1 - Math.random()) * rate);
    }
    paint(now, dt);
  }

  /** A deterministic still frame for reduced motion or before the loop starts. */
  function still() {
    const now = performance.now();
    meteors = [];
    trains = [];
    sparks = [];
    echoes = [];
    const rand = seeded(7);
    const diag = Math.hypot(w, h);
    // Park the sweep pointing down and right, away from the header and (usually) the copy.
    turn.currentTime = (0.6 / TAU) * SWEEP_MS;
    breathe.currentTime = SWEEP_MS / 4;
    for (let i = 0; i < 6; i++) {
      const ang = R.r ? (i / 6) * TAU + 0.4 + rand() * 0.5 : Math.PI * (0.55 + rand() * 0.75);
      const d0 = R.r ? R.r + 70 + rand() * diag * 0.2 : diag * (0.1 + rand() * 0.35);
      meteors.push({ dx: Math.cos(ang), dy: Math.sin(ang), ang, d0, speed: 0, len: 60 + (d0 / diag) * 300, life: 1000, born: now - 420, width: 1.4, fireball: i === 0, seen: true });
      if (day && opts.echoes !== false) echoes.push({ x: R.x + Math.cos(ang) * d0, y: R.y + Math.sin(ang) * d0, born: now - 600, strong: false });
    }
    moveBackdrop();
    ctx!.clearRect(0, 0, w, h);
    drawReticle(now);
    drawStars(now);
    drawMeteors(now, true);
    if (day) drawEchoes(now);
  }

  function play() {
    if (destroyed || running || isStill() || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    nextFrame = last + FRAME_MS;
    nextSpawn = last + 300;
    if (day) turn.play();
    breathe.play();
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    running = false;
    cancelAnimationFrame(raf);
    turn.pause();
    breathe.pause();
  }
  function refresh() {
    if (isStill()) {
      pause();
      still();
    } else play();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(host);
  if (opts.anchor) ro.observe(opts.anchor);
  opts.shield?.forEach((el) => ro.observe(el));
  // Web fonts change the copy's height, which moves the anchor: measure again once they settle.
  document.fonts?.ready.then(() => resize());
  const io = new IntersectionObserver(
    ([e]) => {
      visible = !!e && e.isIntersecting && e.intersectionRatio >= MIN_VISIBLE;
      visible ? play() : pause();
    },
    { threshold: [0, MIN_VISIBLE] },
  );
  io.observe(host);

  const onVisibility = () => (document.hidden ? pause() : play());
  const onTheme = () => {
    day = isDay();
    palette = readPalette();
    meteors = [];
    trains = [];
    sparks = [];
    echoes = [];
    makeSpikes();
    paintBackdrop();
    placeHalo();
    placeSweep();
    if (running) day ? turn.play() : turn.pause();
    else still();
  };
  const onPointer = (e: PointerEvent) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / innerHeight) * 2 - 1;
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('themechange', onTheme);
  window.addEventListener('pointermove', onPointer, { passive: true });
  const offMotion = onMotionChange(refresh);

  resize();
  refresh();
  // Entrances (the copy rises 14px, the instrument scales up) move the boxes without resizing
  // them, so measure once more when they finish. Loops never finish and are left out.
  const watched = [...(opts.shield ?? []), ...(opts.anchor ? [opts.anchor] : [])];
  const entrances = document.getAnimations().filter((a) => {
    const target = (a.effect as KeyframeEffect | null)?.target;
    return !!target && Number.isFinite(Number(a.effect?.getComputedTiming().endTime)) && watched.some((el) => target.contains(el));
  });
  if (entrances.length) Promise.allSettled(entrances.map((a) => a.finished)).then(() => !destroyed && resize());

  return {
    /** Fire a handful of meteors at once, the first one a fireball. */
    burst(n = 7) {
      if (!running) return;
      for (let i = 0; i < n; i++) setTimeout(() => running && spawn(performance.now(), i === 0), i * 80 + Math.random() * 60);
      nextSpawn = performance.now() + 900;
    },
    destroy() {
      destroyed = true;
      pause();
      turn.cancel();
      breathe.cancel();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('themechange', onTheme);
      window.removeEventListener('pointermove', onPointer);
      offMotion();
    },
  };
}
