/**
 * Checks store/ads/google-app-campaign.json against Google Ads' App campaign
 * limits before any of it is pasted into the console, which truncates nothing
 * and just refuses the asset.
 *
 *   node store/tools/check-ad-copy.cjs
 *
 * Exits 1 on the first campaign with a problem, after printing every problem.
 * Lengths are counted in code points: Google counts „ “ « » ’ as one each.
 */
const fs = require('fs');
const path = require('path');

const ADS = path.resolve(__dirname, '../ads');
const LIMITS = { headlines: { count: 5, max: 30 }, descriptions: { count: 5, max: 90 } };
const SIZES = { landscape: [1200, 628], square: [1200, 1200], portrait: [1200, 1500] };
const MAX_IMAGE_BYTES = 1024 * 1024;

const { campaigns } = JSON.parse(fs.readFileSync(path.join(ADS, 'google-app-campaign.json'), 'utf8'));
const problems = [];

for (const [locale, c] of Object.entries(campaigns)) {
  for (const [field, { count, max }] of Object.entries(LIMITS)) {
    const lines = c[field] ?? [];
    if (lines.length > count) problems.push(`${locale} ${field}: ${lines.length} given, at most ${count}`);
    if (new Set(lines).size !== lines.length) problems.push(`${locale} ${field}: duplicates`);
    for (const line of lines) {
      const n = [...line].length;
      console.log(`${locale} ${field.slice(0, 4)} ${String(n).padStart(2)}/${max}  ${line}`);
      if (n > max) problems.push(`${locale} ${field}: ${n} > ${max} — "${line}"`);
      // Headlines may not end in or contain "!" (Google editorial policy).
      if (field === 'headlines' && line.includes('!')) problems.push(`${locale} headline has "!" — "${line}"`);
    }
  }
  for (const rel of c.images ?? []) {
    const file = path.join(ADS, rel);
    if (!fs.existsSync(file)) { problems.push(`${locale} image missing: ${rel}`); continue; }
    const b = fs.readFileSync(file);
    const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
    const ratio = Object.keys(SIZES).find((k) => rel.includes(k));
    const want = SIZES[ratio];
    if (!want || want[0] !== w || want[1] !== h) problems.push(`${locale} ${rel}: ${w}×${h}, expected ${want?.join('×')}`);
    if (b.length > MAX_IMAGE_BYTES) problems.push(`${locale} ${rel}: ${Math.round(b.length / 1024)} KB > 1024 KB`);
  }
}

if (problems.length) {
  console.error('\n' + problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('\n✓ copy and images within limits');
