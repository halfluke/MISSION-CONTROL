import { chromium } from 'playwright';
import { writeFileSync, statSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAME_DIR = join(__dirname, '.tmp-frames');
const TOTAL_FRAMES = 150; // 5s at 30fps
const TARGET_W = 720;
const TARGET_H = 400;

await mkdir(FRAME_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: TARGET_W, height: TARGET_H },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

await page.goto('http://localhost:5177', { waitUntil: 'networkidle' });
await page.waitForSelector('#canvas', { timeout: 10000 });
await new Promise(r => setTimeout(r, 3000));

console.log(`Capturing ${TOTAL_FRAMES} frames (5s at 30fps)...`);
for (let i = 0; i < TOTAL_FRAMES; i++) {
  const buf = await page.screenshot({ type: 'png' });
  writeFileSync(join(FRAME_DIR, `${String(i).padStart(4, '0')}.png`), buf);
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${TOTAL_FRAMES}`);
}
await browser.close();

console.log('Generating palette...');
const PALETTE = join(__dirname, '.tmp-palette.png');
await new Promise((resolve, reject) => {
  exec(
    `ffmpeg -y -framerate 30 -i ${FRAME_DIR}/%04d.png -vf "fps=30,scale=${TARGET_W}:${TARGET_H}:flags=lanczos,palettegen=stats_mode=diff" ${PALETTE}`,
    (err) => err ? reject(err) : resolve()
  );
});

console.log('Encoding GIF...');
const GIF_PATH = join(__dirname, 'docs/squid-viz-demo.gif');
await new Promise((resolve, reject) => {
  exec(
    `ffmpeg -y -framerate 30 -i ${FRAME_DIR}/%04d.png -i ${PALETTE} -lavfi "fps=30,scale=${TARGET_W}:${TARGET_H}:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 -preset slow ${GIF_PATH}`,
    (err) => err ? reject(err) : resolve()
  );
});

await rm(FRAME_DIR, { recursive: true, force: true });
await rm(PALETTE, { force: true });

const s = statSync(GIF_PATH);
console.log(`Done! GIF: ${(s.size / 1024).toFixed(0)}KB, ${(s.size / (1024*1024)).toFixed(1)}MB`);
