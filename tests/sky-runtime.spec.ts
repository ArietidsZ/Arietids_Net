import { readFileSync } from 'node:fs';
import { ScriptTarget, transpileModule } from 'typescript';
import { expect, test, type Page } from '@playwright/test';

// Exercise the real renderer with a deterministic RAF clock, without relying on a CI display's Hz.
const skyScript = transpileModule(
  ['../src/lib/random.ts', '../src/scripts/motion.ts', '../src/scripts/sky.ts']
    .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''))
    .join('\n') + '\nwindow.__skyHarness.api = mountSky(document.getElementById("sky"), { radiant: { x: .5, y: .5 }, nebula: false });',
  { compilerOptions: { target: ScriptTarget.ES2022 } },
).outputText;

type Frame = { time: number; starAlpha?: number };
type SkyHarness = {
  api: { burst(n?: number): void; destroy(): void };
  frames: Frame[];
  paints: number;
  randomCalls: number;
  step(time: number): void;
  finishFonts(): void;
  flushTimers(): void;
  staleIntersection(): void;
  pendingFrames(): number;
};

declare global {
  interface Window {
    __skyHarness: SkyHarness;
  }
}

async function boot(page: Page) {
  await page.goto('about:blank');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setContent('<style>:root { --sky-star: 200 210 220; --sky-star-cool: 150 180 240; --sky-meteor: 240 220 190; --sky-radiant: 200 180 130; --sky-nebula-a: 90 70 130; --sky-nebula-b: 60 80 110; --sky-scope: 50 120 140; } #sky { position: relative; width: 600px; height: 400px; }</style><div id="sky"></div>');
  await page.evaluate(() => {
    let now = 0;
    let id = 0;
    const rafs = new Map<number, FrameRequestCallback>();
    const timers = new Map<number, () => void>();
    let finishFonts!: () => void;
    let intersect: IntersectionObserverCallback = () => {};
    Object.defineProperty(performance, 'now', { value: () => now });
    Object.defineProperty(document, 'fonts', { value: { ready: new Promise<void>((resolve) => { finishFonts = resolve; }) } });
    window.requestAnimationFrame = (callback) => { rafs.set(++id, callback); return id; };
    window.cancelAnimationFrame = (key) => { rafs.delete(key); };
    window.setTimeout = ((callback: () => void) => { timers.set(++id, callback); return id; }) as typeof setTimeout;
    window.clearTimeout = (key) => { if (key !== undefined) timers.delete(Number(key)); };
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() {} unobserve() {} disconnect() {}
    } as unknown as typeof IntersectionObserver;
    const harness: SkyHarness = window.__skyHarness = {
      api: { burst() {}, destroy() {} }, frames: [], paints: 0, randomCalls: 0,
      step(time) {
        now = time;
        const callbacks = [...rafs.values()];
        rafs.clear();
        callbacks.forEach((callback) => callback(time));
      },
      finishFonts: () => finishFonts(),
      flushTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); },
      staleIntersection() { intersect([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver); },
      pendingFrames: () => rafs.size,
    };
    Math.random = () => { harness.randomCalls++; return 0.5; };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      harness.paints++;
      if (this.canvas === document.getElementById('sky')!.lastElementChild) harness.frames.push({ time: now });
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      const frame = harness.frames.at(-1);
      if (this.canvas === document.getElementById('sky')!.lastElementChild && frame && frame.starAlpha === undefined && args[2] < 4 && args[3] < 4) frame.starAlpha = this.globalAlpha;
      return fill.apply(this, args);
    };
  });
  await page.addScriptTag({ content: skyScript });
  await page.evaluate(() => { window.__skyHarness.frames.length = 0; window.__skyHarness.paints = 0; });
}

test('sky paints at about 60 Hz on high-refresh displays without slowing its timeline', async ({ page }) => {
  const samples: number[] = [];
  for (const hz of [60, 90, 120, 144, 240]) {
    await boot(page);
    const frames = await page.evaluate((rate) => {
      const h = window.__skyHarness;
      for (let i = 1; i <= rate; i++) h.step((i * 1000) / rate);
      return h.frames;
    }, hz);
    expect(frames.length, `canvas paints at ${hz} Hz`).toBeGreaterThanOrEqual(59);
    expect(frames.length, `canvas paints at ${hz} Hz`).toBeLessThanOrEqual(61);
    expect(frames.at(-1)!.time, `animation time at ${hz} Hz`).toBeCloseTo(1000, 4);
    expect(frames.at(-1)!.starAlpha).toBeDefined();
    samples.push(frames.at(-1)!.starAlpha!);
  }
  for (const alpha of samples) expect(alpha).toBeCloseTo(samples[0]!, 7);
});

test('destroyed skies ignore late font, observer and burst callbacks', async ({ page }) => {
  await boot(page);
  const state = await page.evaluate(async () => {
    const h = window.__skyHarness;
    h.step(20);
    h.api.burst();
    h.api.destroy();
    const before = { paints: h.paints, randomCalls: h.randomCalls };
    h.finishFonts();
    await Promise.resolve();
    h.staleIntersection();
    h.flushTimers();
    h.step(1000);
    return { before, after: { paints: h.paints, randomCalls: h.randomCalls }, pendingFrames: h.pendingFrames() };
  });
  expect(state.after).toEqual(state.before);
  expect(state.pendingFrames).toBe(0);
});
