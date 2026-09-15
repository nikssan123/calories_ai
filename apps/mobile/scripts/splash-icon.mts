/**
 * The native splash image, drawn from the ring the app shows next.
 *
 * The splash is a picture held by the OS until JavaScript is up, and `Boot`
 * (components/Boot.tsx) takes over from it with `RingObject` turning. For that
 * hand-off to be invisible the picture has to be the ring's first frame, so this
 * builds that frame the way RN builds it — the same layers, the same transforms
 * in the same order, the same gradients and shadows — as a page, and has
 * headless Chrome photograph it on a transparent ground. CSS and RN share the
 * transform maths (`perspective()` is m34 = −1/d in both), so the result is the
 * component, not a drawing of it.
 *
 * The geometry below is copied from `RingObject.tsx` at clock 0. Change one and
 * run this again: `pnpm --filter @ct/mobile splash-icon`, then a native rebuild —
 * the image is baked in at prebuild.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dark, light, type Palette } from '../theme/colors.ts';

/* BOOT_RING and SPLASH_CANVAS in components/Boot.tsx; imageWidth in app.json is their product. */
const RING = 130;
const CANVAS = 1.7;
const SCALE = 4;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const LAYERS = 10;
const PERSPECTIVE = 800;
const ARC = 'M32 10.3A20 20 0 1 1 14.18 39.38';
const TAIL = 'M27.28 50.76Q19.36 54.29 14.51 56.45A1.9 1.9 0 0 0 11.49 54.15Q12.17 48.71 13.29 39.83Z';
const SPHERES = [
  { color: 'protein', offset: 0 },
  { color: 'carbs', offset: 1 / 3 },
  { color: 'fat', offset: 2 / 3 },
] as const;

function pose(t: number) {
  const phase = t * Math.PI * 2 * 2;
  return {
    a: ((34 + 8 * Math.sin(phase)) * Math.PI) / 180,
    b: ((24 * Math.sin(phase * 0.5)) * Math.PI) / 180,
    c: ((6 * Math.sin(phase * 0.5 + 1)) * Math.PI) / 180,
  };
}

function mix(hex: string, other: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const channel = (shift: number) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function layer(colors: Palette, index: number, clock: number): string {
  const size = RING;
  const thickness = size * 0.085;
  const d = thickness / 2 - (thickness * index) / (LAYERS - 1);
  const front = index === 0;
  const { a, b, c } = pose(clock);
  const z = d * Math.cos(a) * Math.cos(b);
  const s = PERSPECTIVE / (PERSPECTIVE - z);
  const transform = [
    `translateX(${d * Math.sin(b) * s}px)`,
    `translateY(${-d * Math.cos(b) * Math.sin(a) * s}px)`,
    `perspective(${PERSPECTIVE}px)`,
    `rotateX(${a}rad)`,
    `rotateY(${b}rad)`,
    `rotateZ(${c}rad)`,
    `scale(${s})`,
  ].join(' ');
  const shade = 1 - (index / (LAYERS - 1)) * 0.32;
  const id = `g${index}`;
  return `
    <div class="fill centre" style="transform: ${transform}">
      <svg width="${size}" height="${size}" viewBox="0 0 64 64">
        <defs>
          <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="8.5" y1="6.8" x2="55.5" y2="57.2">
            <stop offset="0" stop-color="${mix(colors.calories, '#0b3d27', 1 - shade)}" />
            <stop offset="1" stop-color="${mix(colors.logoRamp, '#0b3d2f', 1 - shade)}" />
          </linearGradient>
        </defs>
        ${front ? '<circle cx="32" cy="30.3" r="20" fill="none" stroke-width="7" stroke-opacity="0.22" stroke="#ffffff" />' : ''}
        <path d="${TAIL}" fill="url(#${id})" />
        <path d="${ARC}" fill="none" stroke="url(#${id})" stroke-width="7" stroke-linecap="round" />
        ${front ? `<path d="${ARC}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.4" stroke-linecap="round" transform="translate(-0.6 -1.6)" />` : ''}
      </svg>
    </div>`;
}

function sphere(colors: Palette, index: number, clock: number, front: boolean): string {
  const size = RING;
  const { color, offset } = SPHERES[index]!;
  const base = colors[color];
  const diameter = size * 0.13;
  const radius = size * 0.62;
  const tilt = (68 * Math.PI) / 180;
  const theta = (clock * 3 + offset) * Math.PI * 2;
  const x = radius * Math.cos(theta);
  const y = radius * Math.sin(theta) * Math.cos(tilt);
  const z = radius * Math.sin(theta) * Math.sin(tilt);
  const s = PERSPECTIVE / (PERSPECTIVE - z);
  if (z > 0 !== front) return '';
  return `
    <div style="
      position: absolute; left: 50%; top: 50%;
      width: ${diameter}px; height: ${diameter}px;
      margin: ${-diameter / 2}px 0 0 ${-diameter / 2}px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #ffffff 0%, ${base} 45%, ${mix(base, '#000000', 0.35)} 100%), ${base};
      box-shadow: 0px 0px ${Math.round(diameter * 0.8)}px ${mix(base, '#ffffff', 0.1)};
      transform: translateX(${x * s}px) translateY(${y * s + size * 0.02}px) scale(${s});
    "></div>`;
}

function page(colors: Palette): string {
  const clock = 0;
  const side = Math.round(RING * CANVAS);
  const spheres = (front: boolean) => SPHERES.map((_, i) => sphere(colors, i, clock, front)).join('');
  const layers = Array.from({ length: LAYERS }, (_, i) => LAYERS - 1 - i)
    .map((i) => layer(colors, i, clock))
    .join('');
  return `<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; }
    .fill { position: absolute; inset: 0; }
    .centre { display: flex; align-items: center; justify-content: center; }
  </style></head><body>
    <div class="centre" style="width: ${side}px; height: ${side}px;">
      <div style="position: relative; width: ${RING * 1.5}px; height: ${RING * 1.2}px;">
        ${spheres(false)}${layers}${spheres(true)}
      </div>
    </div>
  </body></html>`;
}

const dir = mkdtempSync(join(tmpdir(), 'splash-icon-'));
const side = Math.round(RING * CANVAS);
for (const [name, colors] of [
  ['splash-icon.png', light],
  ['splash-icon-dark.png', dark],
] as const) {
  const html = join(dir, `${name}.html`);
  writeFileSync(html, page(colors));
  const out = join(import.meta.dirname, '..', 'assets', name);
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    `--force-device-scale-factor=${SCALE}`,
    '--default-background-color=00000000',
    `--window-size=${side},${side}`,
    `--screenshot=${out}`,
    `file://${html}`,
  ], { stdio: 'ignore' });
  console.log(`${name}: ${side * SCALE}px, imageWidth ${side}`);
}
