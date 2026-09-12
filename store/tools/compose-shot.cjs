/**
 * Composes one Play screenshot: the caption block over a dark ground, the app
 * capture inside a cream card. Every number here was measured off the English
 * set in `store/screenshots/`, so a localised frame sits beside them unchanged.
 *
 *   node compose-shot.cjs <capture.png> <out.png> <headline, \n for the break> <sub>
 *
 * The headline falls back per script — Baloo has no Cyrillic and no Greek — which
 * is the same cascade the app itself draws with. Needs a Chromium from
 * Playwright's cache; see store/tools/capture-shots.sh for the rest of the loop.
 */
/*
 * playwright-core is not a dependency of this repo — it is a few megabytes for
 * a script that runs when the store copy changes. Point PLAYWRIGHT_CORE at an
 * install, or `npm i --no-save playwright-core` in a scratch directory and
 * point at that.
 */
const { createRequire } = require('module');
function loadChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    require('path').resolve(__dirname, '../../node_modules/playwright-core'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      return createRequire(require('path').join(dir, 'package.json'))('playwright-core').chromium;
    } catch {}
  }
  try {
    return require('playwright-core').chromium;
  } catch {
    console.error('playwright-core not found. Set PLAYWRIGHT_CORE=<path to an install>.');
    process.exit(2);
  }
}
const chromium = loadChromium();
const fs = require('fs');
const path = require('path');
const [capture, out, headline, sub] = process.argv.slice(2);
const FONTS = path.resolve(__dirname, '../../node_modules/.pnpm');
function findFont(glob) {
  const hit = require('child_process').execSync(`find ${FONTS} -path '*${glob}' -maxdepth 6 | head -1`).toString().trim();
  return hit;
}
const baloo = findFont('@expo-google-fonts/baloo-2/800ExtraBold/Baloo2_800ExtraBold.ttf');
const nunitoBlack = findFont('@expo-google-fonts/nunito/900Black/Nunito_900Black.ttf');
const nunitoMedium = findFont('@expo-google-fonts/nunito/500Medium/Nunito_500Medium.ttf');
const html = `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: Display; src: url('file://${baloo}'); }
  @font-face { font-family: DisplayCyr; src: url('file://${nunitoBlack}'); }
  @font-face { font-family: Body; src: url('file://${nunitoMedium}'); }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1920px; background: rgb(26,21,18); overflow: hidden; position: relative;
         -webkit-font-smoothing: antialiased; }
  h1 { position: absolute; left: 100px; top: 112px; width: 900px;
       font-family: Display, DisplayCyr, Body, system-ui, sans-serif; font-weight: 800;
       font-size: 92px; line-height: 94px; letter-spacing: -1.5px; color: rgb(247,239,230); white-space: pre-line; }
  p  { position: absolute; left: 100px; top: 306px; width: 900px;
       font-family: Body, system-ui, sans-serif; font-weight: 500; font-size: 34px; line-height: 42px;
       color: rgb(171,157,144); }
  .bar { position: absolute; left: 100px; top: 378px; width: 96px; height: 7px; border-radius: 4px; background: rgb(64,236,162); }
  .card { position: absolute; left: 73px; top: 480px; width: 934px; height: 1500px; border-radius: 28px;
          overflow: hidden; background: rgb(255,246,236); box-shadow: 0 18px 50px rgba(0,0,0,.45); }
  .card img { width: 934px; display: block; margin-top: -83px; }  /* crop the status bar */
</style>
<h1>${headline.replace(/\\n/g, '\n')}</h1><p>${sub}</p><div class="bar"></div>
<div class="card"><img src="file://${path.resolve(capture)}"></div>`;
(async () => {
  const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium`, headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  // Written next to the capture and opened as a file:// page — Chromium refuses
  // local images to a page with no file origin, which is why setContent left the card empty.
  const tmp = path.join(path.dirname(path.resolve(out)), '.compose.html');
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log('wrote', out);
})();
