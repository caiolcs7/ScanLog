import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  clearAllData,
  createSession,
  db,
  initializeDatabase,
} from '../src/core/database';
import { defaultSettings } from '../src/core/models';
import { processScan } from '../src/core/scan-engine';
import {
  catalogWeight,
  formatKg,
  parseGrams,
  setRecordWeight,
} from '../src/core/weight';
import { createCsv, createWorkbook } from '../src/services/export';

beforeEach(async () => {
  await initializeDatabase();
  await clearAllData();
});
afterAll(() => db.close());

describe('peso em gramas', () => {
  it('converte gramas para kg na exportação', () => {
    expect(formatKg(10)).toBe('0,010 kg');
    expect(formatKg(0.24)).toBe('0,00024 kg');
    expect(formatKg(1500)).toBe('1,500 kg');
  });
  it('aceita pesos abaixo de 1 g e vírgula decimal', () => {
    expect(parseGrams('0,24')).toBe(0.24);
    expect(parseGrams('1.234,5')).toBe(1234.5);
    expect(parseGrams('12 g')).toBe(12);
    expect(parseGrams('0')).toBeNull();
    expect(parseGrams('abc')).toBeNull();
  });
  it('usa o PESO do localizador de materiais em gramas', () => {
    expect(catalogWeight('itarlsm003bc')).toBe(0.12);
    expect(catalogWeight('ITLAVF0051')).toBe(2);
    expect(catalogWeight('INEXISTENTE')).toBeUndefined();
  });
  it('preenche o peso do catálogo e permite alterar', async () => {
    const session = await createSession('Peso', 'fixed', true);
    await processScan(session.id, 'R01A1C03DP02', 'hid', defaultSettings);
    const known = await processScan(
      session.id,
      'ITARLSM003BC',
      'hid',
      defaultSettings,
    );
    expect(known.record?.weight).toBe(0.12);
    const unknown = await processScan(
      session.id,
      'ITSEMPESO01',
      'hid',
      defaultSettings,
    );
    expect(unknown.record?.weight).toBeUndefined();
    await setRecordWeight(unknown.record!.id, 0.5);
    const rows = await db.records
      .where('sessionId')
      .equals(session.id)
      .sortBy('order');
    expect(rows.map((r) => r.weight)).toEqual([0.12, 0.5]);

    const saved = (await db.sessions.get(session.id))!;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      await createWorkbook(saved, rows).xlsx.writeBuffer(),
    );
    const sheet = workbook.getWorksheet('Todos os registros')!;
    expect(sheet.getCell('D5').value).toBe('Peso');
    expect(sheet.getCell('D6').value).toBeCloseTo(0.00012, 10);
    expect(sheet.getCell('D6').numFmt).toBe('0.00000" kg"');
    expect(createCsv(rows, 'order', true)).toContain('"0,00012 kg"');
  });
  it('levantamento sem peso não ganha coluna Peso', async () => {
    const session = await createSession('Normal', 'fixed');
    await processScan(session.id, 'R01A1C03DP02', 'hid', defaultSettings);
    const result = await processScan(
      session.id,
      'ITARLSM003BC',
      'hid',
      defaultSettings,
    );
    expect(result.record?.weight).toBeUndefined();
    expect(createCsv([result.record!], 'order')).not.toContain('Peso');
  });
});
