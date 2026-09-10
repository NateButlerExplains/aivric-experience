// Export the marketing film from the site itself.
//
// The director (js/director.js) is a keyframed timeline over the same camera every visitor uses.
// This drives that timeline one frame at a time in a headless browser and pipes the frames through
// ffmpeg, so the film is a build artifact of the experience rather than a separate production: a
// change to a room render, a screen, or the timeline is a change to the film, and nothing can
// drift between the two.
//
// How it is made deterministic. Three clocks exist in the page and all three are put on film time:
//   1. The shared clock (js/clock.js) is frozen at rate 0 by `?film=1` and stepped here, so the
//      director, the living screens and the approver board advance exactly 1/fps per frame.
//   2. Every CSS transition and animation is paused through the Web Animations API the moment it
//      appears and seeked to film time before each capture — the camera moves are CSS transitions,
//      and this is what keeps them off the wall clock. (Chromium's virtual time does not reach the
//      compositor, and BeginFrameControl hangs on the bundled headless shell; both were tried.)
//   3. window.setTimeout is shimmed to film time, so the pin reveal and the settle fallbacks fire
//      where they would in a real 30 fps playback rather than early because capture is slower.
//
// What is NOT on film time: <video> elements. The board clips on the AIRE bridge play at wall
// rate, so frames inside that beat differ run to run by exactly those pixels. --verify measures it.
//
//   node tools/build-film.js [--fps 30] [--seconds N] [--out media/film/inside-aivric.mp4] [--verify]
//     --seconds caps the export (a smoke test); omit it for the whole timeline.
//     --verify runs the timeline a second time and reports how many frames were bit-identical.
//
// Needs the local server: python3 -m http.server 8765 from the repo root.
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCAL = process.env.LOCAL || 'http://127.0.0.1:8765/experience/';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('--fps', 30));
const CAP = Number(arg('--seconds', 0));
const OUT = path.resolve(ROOT, arg('--out', 'media/film/inside-aivric.mp4'));
const VERIFY = process.argv.includes('--verify');
const W = 1920, H = 1080;

// Runs before any page script. Timers go on film time; the real ones are kept for the harness.
const TIMER_SHIM = `(() => {
  if (!/[?&]film=1/.test(location.search)) return;
  const real = { setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) };
  let now = 0, seq = 0; const timers = new Map();
  window.setTimeout = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { due: now + Math.max(0, +ms || 0), fn, args }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); };
  window.__filmTimers = {
    real,
    now: () => now,
    advance(ms) {
      now += ms;
      const due = [...timers].filter(([, t]) => t.due <= now).sort((a, b) => a[1].due - b[1].due);
      for (const [id, t] of due) { timers.delete(id); try { t.fn(...t.args); } catch (e) { console.error(e); } }
    },
  };
})();`;

// Installed once the director exists. One film frame: step the clock, run due timers, let the
// router's hashchange task land, seek every animation to film time, then let the renderer flush.
const FRAME = `(() => {
  const real = window.__filmTimers.real;
  const task = () => new Promise((r) => real.setTimeout(r, 0));
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const seek = () => {
    const now = window.__director.time() * 1000;
    for (const a of document.getAnimations()) {
      if (a.__film == null) { a.__film = now; try { a.pause(); } catch (e) { /* not seekable */ } }
      try { a.currentTime = now - a.__film; } catch (e) { /* not seekable */ }
    }
  };
  window.__film = {
    // A known first frame: on the building, camera settled, clock at zero, every infinite
    // animation re-based so its phase is a function of film time and nothing else.
    reset: async () => {
      window.__director.reset();                 // stop and drop the directing class, so the hint fade settles too
      location.hash = '#/';
      for (let i = 0; i < 90; i++) await window.__film.frame(1 / 30);
      window.__director.reset();                 // clock back to zero now that everything is still
      for (const a of document.getAnimations()) a.__film = 0;
      await window.__film.frame(0);
    },
    frame: async (dt) => {
      window.__director.step(dt);
      window.__filmTimers.advance(dt * 1000);
      await task(); await task();
      seek();
      await raf(); await raf();
      seek();                      // anything the first flush started
      await raf();
    },
  };
})();`;

async function runTimeline(page, cdp, onFrame) {
  runTimeline.pass = (runTimeline.pass || 0) + 1;
  if (process.env.FILM_DUMP) fs.mkdirSync(process.env.FILM_DUMP, { recursive: true });
  await page.evaluate(() => window.__film.reset());
  await page.evaluate(() => window.__director.start());
  const total = await page.evaluate(() => window.__director.length);
  const frames = Math.ceil((CAP > 0 ? Math.min(CAP, total) : total) * FPS) + 1;
  const hashes = [];
  for (let i = 0; i < frames; i++) {
    await page.evaluate((dt) => window.__film.frame(dt), 1 / FPS);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    const buf = Buffer.from(data, 'base64');
    hashes.push(crypto.createHash('sha1').update(buf).digest('hex'));
    if (onFrame) await onFrame(buf, i);
    // FILM_DUMP=<dir> keeps one frame a second from each pass, for looking at and for diffing.
    if (process.env.FILM_DUMP && i % FPS === 0) fs.writeFileSync(path.join(process.env.FILM_DUMP, `pass${runTimeline.pass}-${String(i).padStart(5, '0')}.png`), buf);
    if (i % (FPS * 5) === 0) process.stdout.write(`  ${(i / FPS).toFixed(0)}s / ${(frames / FPS).toFixed(0)}s  beat ${await page.evaluate(() => window.__director.beat())}\n`);
    if (await page.evaluate(() => window.__director.done())) break;
  }
  return hashes;
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.addInitScript(TIMER_SHIM);
  await page.goto(`${LOCAL}?film=1&skipintro=1#/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__director && document.body.classList.contains('floor-ready'));
  await page.evaluate(FRAME);
  const cdp = await page.context().newCDPSession(page);

  // Warm every room and every screen once, in wall time, so no frame of the export is a fetch.
  console.log('warming rooms');
  await page.evaluate(() => window.__director.prepare());
  const rooms = await page.evaluate(async () => (await (await fetch('content/experience.json')).json()).rooms.map((r) => r.id));
  for (const id of rooms) {
    await page.evaluate((id) => { location.hash = `#/room/${id}`; }, id);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__film.frame(3));
    await page.waitForLoadState('networkidle');
  }

  console.log(`exporting ${W}x${H} @ ${FPS} fps → ${path.relative(ROOT, OUT)}`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const write = (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
  const first = await runTimeline(page, cdp, write);
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  fs.writeFileSync(OUT.replace(/\.mp4$/, '.frames.json'), JSON.stringify(first));
  const size = fs.statSync(OUT).size;
  console.log(`wrote ${first.length} frames (${(first.length / FPS).toFixed(1)}s), ${(size / 1e6).toFixed(1)} MB`);

  if (VERIFY) {
    console.log('verifying: second pass');
    const second = await runTimeline(page, cdp, null);
    const n = Math.min(first.length, second.length);
    const diff = [];
    for (let i = 0; i < n; i++) if (first[i] !== second[i]) diff.push(i);
    const runs = [];
    for (const i of diff) { const last = runs[runs.length - 1]; if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]); }
    console.log(`identical ${n - diff.length} / ${n} frames; differing ranges (s): ${runs.map(([a, b]) => `${(a / FPS).toFixed(1)}–${(b / FPS).toFixed(1)}`).join(', ') || 'none'}`);
    if (first.length !== second.length) console.log(`frame counts differ: ${first.length} vs ${second.length}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
