import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllData,
  createSession,
  db,
  initializeDatabase,
} from '../src/core/database';
import { defaultSettings } from '../src/core/models';
import { parseGalao } from '../src/core/parser';
import { extractDescription } from '../src/core/description';
import {
  editRecords,
  processScan,
  setActiveGalao,
  setRecordDescription,
} from '../src/core/scan-engine';

const settings = defaultSettings;
beforeEach(async () => {
  await initializeDatabase();
  await clearAllData();
});
afterAll(() => db.close());

describe('galão as sticky context', () => {
  it('recognizes galão labels without mistaking addresses or products', () => {
    expect(parseGalao('R16G01')).toBe('R16G01');
    expect(parseGalao(' r16-g01 ')).toBe('R16G01');
    expect(parseGalao('R16A1C01DP02')).toBeNull();
    expect(parseGalao('ITCP001M0016A')).toBeNull();
  });
  it('tags every following product with the active galão', async () => {
    const s = await createSession('Galões', 'fixed');
    await processScan(s.id, 'R16A1C01DP02', 'hid', settings);
    const galao = await processScan(s.id, 'R16G01', 'hid', settings);
    expect(galao).toMatchObject({ kind: 'galao', value: 'R16G01' });
    for (const code of ['ITA001', 'ITA002', 'ITA003'])
      await processScan(s.id, code, 'hid', settings);
    await processScan(s.id, 'R16G02', 'hid', settings);
    await processScan(s.id, 'ITA004', 'hid', settings);
    const rows = await db.records
      .where('sessionId')
      .equals(s.id)
      .sortBy('order');
    expect(rows.map((r) => [r.code, r.address, r.galao])).toEqual([
      ['ITA001', 'R16A1C01DP02', 'R16G01'],
      ['ITA002', 'R16A1C01DP02', 'R16G01'],
      ['ITA003', 'R16A1C01DP02', 'R16G01'],
      ['ITA004', 'R16A1C01DP02', 'R16G02'],
    ]);
    await setActiveGalao(s.id, '');
    await processScan(s.id, 'ITA005', 'hid', settings);
    const after = await db.records
      .where('sessionId')
      .equals(s.id)
      .sortBy('order');
    expect(after.at(-1)!.galao).toBeUndefined();
  });
  it('edits galão and stores a description', async () => {
    const s = await createSession('Editar', 'fixed');
    await processScan(s.id, 'R16A1C01DP02', 'hid', settings);
    const { record } = await processScan(s.id, 'ITA001', 'hid', settings);
    await editRecords(
      s.id,
      [record!.id],
      'R16A1C01DP02',
      settings,
      undefined,
      'r16g09',
    );
    await setRecordDescription(record!.id, 'CONTRA PORCA');
    expect(await db.records.get(record!.id)).toMatchObject({
      galao: 'R16G09',
      description: 'CONTRA PORCA',
    });
  });
});

describe('label description from OCR text', () => {
  const ocr = [
    'ITCPOO1M0016A',
    'CONTRA PORCA TL.CP.EXE.001 METRICA 16 FABR',
    'ICACAO AL',
    '',
    '© | %] 5 ¥ #',
    'C Maccomevap',
  ].join('\n');
  it('takes the lines after the product code until the symbol area', () => {
    expect(extractDescription(ocr, 'ITCP001M0016A')).toBe(
      'CONTRA PORCA TL.CP.EXE.001 METRICA 16 FABR ICACAO AL',
    );
  });
  it('handles real Tesseract output from a Macomevap label photo', () => {
    const real =
      'UA O\né\nak TESES EAN E ERAS\n— ITCPOO1MOO16A\nCONTRA PORCA TL.CP.EXE.001 METRICA 16 FABR\nJCACÃO AL\ní. : e lo |\n| 3\n| toMaceTemAA i\n';
    expect(extractDescription(real, 'ITCP001M0016A')).toBe(
      'CONTRA PORCA TL.CP.EXE.001 METRICA 16 FABR JCACAO AL',
    );
  });
  it('falls back to the first text lines when the code is not recognized', () => {
    expect(extractDescription('PARAFUSO SEXTAVADO M8\n|| ¥ ®', 'ITX999')).toBe(
      'PARAFUSO SEXTAVADO M8',
    );
  });
  it('returns empty text when nothing readable is present', () => {
    expect(extractDescription('| ¥ ® ~\n', 'ITX999')).toBe('');
  });
});
