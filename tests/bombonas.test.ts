import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllData,
  createSession,
  db,
  initializeDatabase,
  removeRecords,
  restoreRecords,
} from '../src/core/database';
import { defaultSettings } from '../src/core/models';
import { addManual, processScan } from '../src/core/scan-engine';

const settings = { ...defaultSettings, autoGalao: true };
beforeEach(async () => {
  await initializeDatabase();
  await clearAllData();
});
afterAll(() => db.close());
const rows = async (id: string) =>
  (await db.records.where('sessionId').equals(id).sortBy('order')).map((r) => [
    r.code,
    r.galao,
  ]);

describe('automatic bombonas', () => {
  it('numbers per street, keeps the same bombona on request and renumbers after delete', async () => {
    const s = await createSession('Bombonas', 'fixed');
    await processScan(s.id, 'R14A1C05EP01', 'hid', settings);
    await processScan(s.id, 'ITA001', 'hid', settings);
    await processScan(s.id, 'ITA002', 'hid', settings, undefined, {
      sameGalao: true,
    });
    await processScan(s.id, 'ITA003', 'hid', settings);
    await processScan(s.id, 'ITA004', 'hid', settings);
    expect(await rows(s.id)).toEqual([
      ['ITA001', 'R14G01'],
      ['ITA002', 'R14G01'],
      ['ITA003', 'R14G02'],
      ['ITA004', 'R14G03'],
    ]);
    const target = (
      await db.records.where('sessionId').equals(s.id).toArray()
    ).find((r) => r.code === 'ITA003')!;
    const removed = await removeRecords(s.id, [target.id]);
    expect((await rows(s.id)).at(-1)).toEqual(['ITA004', 'R14G02']);
    await restoreRecords(removed);
    expect(await rows(s.id)).toEqual([
      ['ITA001', 'R14G01'],
      ['ITA002', 'R14G01'],
      ['ITA003', 'R14G02'],
      ['ITA004', 'R14G03'],
    ]);
    await processScan(s.id, 'R07A1C01DP01', 'hid', settings, {
      sessionId: s.id,
      raw: 'R07A1C01DP01',
      source: 'hid',
      from: 'R14A1C05EP01',
      to: 'R07A1C01DP01',
      mode: 'fixed',
      pending: null,
    });
    await processScan(s.id, 'ITB001', 'hid', settings);
    expect((await rows(s.id)).at(-1)).toEqual(['ITB001', 'R07G01']);
  });
  it('never asks to confirm repeated VAZIO but still guards real codes', async () => {
    const s = await createSession('Vazio', 'fixed');
    const strict = { ...defaultSettings, duplicates: true };
    await addManual(s.id, 'VAZIO', 'R14A1C05EP01', strict);
    expect((await addManual(s.id, 'VAZIO', 'R14A1C05EP01', strict)).kind).toBe(
      'product',
    );
    await addManual(s.id, 'ITA001', 'R14A1C05EP01', strict);
    expect((await addManual(s.id, 'ITA001', 'R14A1C05EP01', strict)).kind).toBe(
      'duplicate',
    );
  });
});
