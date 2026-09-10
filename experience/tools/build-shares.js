// Build the share stubs and their preview cards.
//
// The experience is hash-routed on static hosting: #/station/x never reaches a server, and no
// crawler executes the JS that reads it. So a link to a station cannot carry its own Open Graph
// tags from index.html — every share would preview as the building, or as nothing.
//
// The fix is one small real file per station under s/, carrying that station's own title,
// description and card, which then bounces the visitor into the hash route. Static files, no
// server, works on Pages and works embedded on aivric.com.
//
// The card is a screenshot of the experience itself at that station — the room with its panel —
// rather than a logo on a colour. The product is the picture.
//
//   node tools/build-shares.js [baseUrl]
//     baseUrl defaults to the local server; pass the production origin to bake absolute card URLs.
const { chromium } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCAL = process.env.LOCAL || 'http://127.0.0.1:8765/experience/';
const SITE = process.argv[2] || 'https://aivric.com/experience/';
const CARDS = path.join(ROOT, 'media', 'share');
const STUBS = path.join(ROOT, 's');

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// One line about the station, preferring its own headline over the marketing summary.
const blurb = (room, st) => {
  const t = (st.headline || st.summary || room.tagline || '').trim();
  return t.length > 180 ? t.slice(0, 177).replace(/\s+\S*$/, '') + '…' : t;
};

function stub({ title, description, card, hash, canonical }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AiVRIC">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(card)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<!-- A crawler stops at the tags above. A person is sent straight through to the experience; the
     redirect is scripted AND given as a refresh so it still works with JS disabled. -->
<meta http-equiv="refresh" content="0; url=../${esc(hash)}">
<script>location.replace('../${hash.replace(/'/g, "\\'")}');</script>
</head>
<body style="margin:0;background:#080f1c;color:#e8eef7;font:15px/1.5 system-ui;padding:40px">
<p><a style="color:#5aa5ff" href="../${esc(hash)}">Open ${esc(title)}</a></p>
</body>
</html>
`;
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'experience.json'), 'utf8'));
  fs.mkdirSync(CARDS, { recursive: true });
  fs.mkdirSync(STUBS, { recursive: true });

  const browser = await chromium.launch();
  // 1200x630 is the card; capture at 2x then downscale so the type is crisp.
  const page = await (await browser.newContext({
    viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2,
  })).newPage();

  const shot = async (hash, file) => {
    await page.goto(`${LOCAL}?skipintro=1&screens=1#${hash}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(4200);
    // Board clips loop forever, so the page never reports itself stable.
    await page.evaluate(() => document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch {} }));
    await page.waitForTimeout(250);
    // Captured at 2x for crisp type, then downscaled to the card's real 1200x630 and encoded as
    // JPEG. The raw 2x PNGs came to 26MB across fourteen cards, which is absurd for something whose
    // whole job is to load instantly in a chat client.
    const tmp = path.join(CARDS, '.tmp.png');
    await page.screenshot({ path: tmp, animations: 'disabled' });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp,
      '-vf', 'scale=1200:630:flags=lanczos', '-q:v', '4', path.join(CARDS, file)]);
    fs.unlinkSync(tmp);
  };

  await shot('/', 'building.jpg');
  console.log('card  building.jpg');

  let n = 0;
  for (const room of manifest.rooms) {
    for (const st of room.stations) {
      const file = `${st.id}.jpg`;
      await shot(`/station/${st.id}`, file);
      fs.writeFileSync(path.join(STUBS, `${st.id}.html`), stub({
        title: `${st.name} — inside AiVRIC`,
        description: blurb(room, st),
        card: `${SITE}media/share/${file}`,
        hash: `#/station/${st.id}`,
        canonical: `${SITE}s/${st.id}.html`,
      }));
      console.log(`card  ${file}  +  s/${st.id}.html`);
      n++;
    }
  }

  await browser.close();
  console.log(`\n${n} stations, plus the building card. Cards in media/share/, stubs in s/.`);
})();
