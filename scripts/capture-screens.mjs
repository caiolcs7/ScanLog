// Captures the main ScanLog screens (desktop + mobile, light + dark) with demo
// data that exists only in a throwaway browser profile. Used to publish design
// references (e.g. Figma). Requires `npm run dev` on port 5173 and Microsoft Edge.
// Usage: node scripts/capture-screens.mjs <output-dir>
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const out = process.argv[2] ?? 'artifacts/screens';
fs.mkdirSync(out, { recursive: true });
const base = 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'msedge' });

async function seed(page) {
  await page.goto(base);
  return page.evaluate(async () => {
    const d = await import('/src/core/database.ts');
    const e = await import('/src/core/scan-engine.ts');
    const m = await import('/src/core/models.ts');
    await d.initializeDatabase();
    const st = { ...m.defaultSettings, autoGalao: true };
    await d.db.settings.update('main', { autoGalao: true });
    await d.createSession('Rua 07 — Inventário mensal', 'fixed');
    const s = await d.createSession('Rua 15 — Almoxarifado central', 'fixed');
    await e.processScan(s.id, 'R15A1C01DP02', 'hid', st);
    for (const c of ['ITCP001M0016A', 'ITPFPHM510ESAI4', 'MPC00412'])
      await e.processScan(s.id, c, 'hid', st);
    const change = {
      sessionId: s.id,
      raw: 'R15A2C01DP02',
      source: 'hid',
      from: 'R15A1C01DP02',
      to: 'R15A2C01DP02',
      mode: 'fixed',
      pending: null,
    };
    await e.processScan(s.id, 'R15A2C01DP02', 'hid', st, change);
    for (const c of ['ITPRCSEM03AI4', 'ITARSRM003AI4', 'STPC0091B'])
      await e.processScan(s.id, c, 'hid', st);
    return s.id;
  });
}

const shots = [];
for (const [device, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const id = await seed(page);
    await page.evaluate(async (t) => {
      const d = await import('/src/core/database.ts');
      await d.db.settings.update('main', { theme: t });
    }, theme);
    for (const [name, route] of [
      ['home', '#/'],
      ['coleta', `#/session/${id}/scanner`],
      ['registros', `#/session/${id}/records`],
      ['configuracoes', '#/settings'],
    ]) {
      await page.goto(base + route);
      await page.waitForTimeout(600);
      const file = `${out}/${device}-${theme}-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      shots.push(file);
    }
    await context.close();
  }
}
await browser.close();
console.log(shots.join('\n'));
