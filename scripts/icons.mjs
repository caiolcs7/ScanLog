import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
await mkdir('public/icons', { recursive: true });
const svg = await readFile('public/favicon.svg');
for (const [name, size] of [
  ['icon-192', 192],
  ['icon-512', 512],
  ['apple-touch-icon', 180],
])
  await sharp(svg).resize(size, size).png().toFile(`public/icons/${name}.png`);
const padded = await sharp(svg).resize(320, 320).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#4c007d' },
})
  .composite([{ input: padded, gravity: 'centre' }])
  .png()
  .toFile('public/icons/maskable-512.png');
