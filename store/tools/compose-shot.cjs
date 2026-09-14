/**
 * Composes one store screenshot: the caption over the onboarding's warm light, the
 * capture inside a lit cream card. It was a dark ground and Baloo until the
 * glow-up (GLOW-UP.md); the frames now stand in the same light the app does,
 * with the headline in the same serif the app speaks in. The card geometry is
 * unchanged, so a localised frame still sits beside the English set.
 *
 *   node compose-shot.cjs <capture.png> <out.png> <headline, \n for the break> <sub>
 *
 * The headline falls back per script — Fraunces has no Cyrillic and no Greek, so
 * Literata carries them — which is the same cascade the app itself draws with. Needs a Chromium from
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
/*
 * Which store slot the frame is for. The layout is the Play frame's, measured at
 * 1080 wide; a taller slot keeps that width and scales the whole page up to the
 * slot's pixel width, giving the extra height to the card — the headline is what
 * carries a listing at thumbnail size, so it keeps its proportions everywhere.
 * `crop` is the capture's status bar at the card's 934pt width.
 *
 *   COMPOSE_TARGET=iphone node compose-shot.cjs …   # 1284×2778, the 6.5" slot
 *   COMPOSE_TARGET=ipad   node compose-shot.cjs …   # 2064×2752, the 13" slot
 *
 * `COMPOSE_CROP` overrides the status-bar crop, for a capture from a device
 * whose bar is a different share of its width (62pt of a 402pt iPhone 17 Pro is
 * 144 at card width; of a 440pt Pro Max, 132).
 */
const TARGETS = {
  play: { width: 1080, height: 1920, crop: 83 },
  iphone: { width: 1284, height: 2778, crop: 144 },
  ipad: { width: 2064, height: 2752, crop: 40 },
};
const target = { ...TARGETS[process.env.COMPOSE_TARGET || 'play'] };
if (process.env.COMPOSE_CROP) target.crop = Number(process.env.COMPOSE_CROP);
const scale = target.width / 1080;
const pageHeight = Math.round(target.height / scale);
const FONTS = path.resolve(__dirname, '../../node_modules/.pnpm');
function findFont(glob) {
  const hit = require('child_process').execSync(`find ${FONTS} -path '*${glob}' -maxdepth 6 | head -1`).toString().trim();
  return hit;
}
const fraunces = findFont('@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf');
const literata = findFont('@expo-google-fonts/literata/400Regular/Literata_400Regular.ttf');
const nunitoMedium = findFont('@expo-google-fonts/nunito/500Medium/Nunito_500Medium.ttf');
const html = `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: Display; src: url('file://${fraunces}'); }
  @font-face { font-family: DisplayCyr; src: url('file://${literata}'); }
  @font-face { font-family: Body; src: url('file://${nunitoMedium}'); }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1080px; height: ${pageHeight}px; overflow: hidden; position: relative; -webkit-font-smoothing: antialiased;
         background:
           radial-gradient(900px 700px at 0% 0%, rgba(255,196,120,.75), rgba(255,196,120,0) 70%),
           radial-gradient(800px 800px at 100% 30%, rgba(160,236,210,.65), rgba(160,236,210,0) 70%),
           radial-gradient(900px 700px at 20% 100%, rgba(255,190,160,.5), rgba(255,190,160,0) 70%),
           #fff6ec; }
  h1 { position: absolute; left: 100px; top: 112px; width: 900px;
       font-family: Display, DisplayCyr, Body, Georgia, serif; font-weight: 400;
       font-size: 92px; line-height: 98px; letter-spacing: -1.5px; color: #31261e; white-space: pre-line; }
  p  { position: absolute; left: 100px; top: 326px; width: 900px;
       font-family: Body, system-ui, sans-serif; font-weight: 500; font-size: 34px; line-height: 42px;
       color: #4f3f31; }
  .bar { position: absolute; left: 100px; top: 400px; width: 96px; height: 7px; border-radius: 4px;
         background: linear-gradient(90deg, #12b76a, #23d3b0); box-shadow: 0 0 14px rgba(18,183,106,.5); }
  .card { position: absolute; left: 73px; top: 480px; width: 934px; height: ${pageHeight - 420}px; border-radius: 36px; z-index: 1;
          overflow: hidden; background: rgb(255,246,236); box-shadow: 0 40px 90px -30px rgba(90,60,20,.55), 0 0 0 2px rgba(120,80,20,.10); }
  .card img { width: 934px; display: block; margin-top: -${target.crop}px; }  /* crop the status bar */
</style>
<h1>${headline.replace(/\\n/g, '\n')}</h1><p>${sub}</p><div class="bar"></div>
<div class="card"><img src="file://${path.resolve(capture)}"></div>`;
(async () => {
  const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium`, headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: pageHeight }, deviceScaleFactor: scale });
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
