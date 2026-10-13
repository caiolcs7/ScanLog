import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  createIdentifyWorkbook,
  identifyHeaders,
} from '../src/services/identify-xlsx';
import { createFindDocument } from '../src/services/identify-export';
import { mergeItems } from '../src/features/identify/items';
import { checkCode } from '../src/features/identify/CodeEntry';
import { db } from '../src/core/database';
import { queueItem } from '../src/cloud/outbox';
import { defaultSettings } from '../src/core/models';
import type { CloudItem, CloudLot } from '../src/cloud/types';

const lot: CloudLot = {
  id: crypto.randomUUID(),
  name: 'Sem código 13/10',
  status: 'codificado',
  item_count: 2,
  coded_count: 2,
  confirmed_count: 0,
  created_at: '2026-10-13T12:00:00Z',
  created_by: 'Caio',
  sent_at: null,
  coded_at: null,
  confirmed_at: null,
  updated_at: '2026-10-13T12:00:00Z',
};
function item(ord: number, extra: Partial<CloudItem> = {}): CloudItem {
  return {
    id: crypto.randomUUID(),
    lot_id: lot.id,
    ord,
    status: 'codificado',
    address: null,
    bombona: null,
    weight_g: null,
    note: null,
    photos: [],
    thumb_path: null,
    created_at: '2026-10-13T12:00:00Z',
    created_by: 'Caio',
    code: null,
    code_note: null,
    coded_at: '2026-10-13T15:30:00Z',
    coded_by: 'Ana',
    confirmed_at: null,
    confirmed_by: null,
    photos_deleted_at: null,
    thumb_expires_at: null,
    updated_at: '2026-10-13T12:00:00Z',
    ...extra,
  };
}

describe('planilha da identificação', () => {
  it('segue as colunas do levantamento com o código novo e o peso em kg', async () => {
    const workbook = createIdentifyWorkbook(
      lot.name,
      [lot],
      [
        item(2, { code: '000123', bombona: 'R15G03', weight_g: 10 }),
        item(1, { code: 'ABC-9', address: 'R07A1C01DP01' }),
      ],
    );
    const buffer = await workbook.xlsx.writeBuffer();
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(buffer as ArrayBuffer);
    const sheet = read.getWorksheet('Identificação')!;
    expect(identifyHeaders.slice(0, 4)).toEqual([
      'Código do Produto',
      'Endereço',
      'Galão',
      'Peso',
    ]);
    expect(sheet.getRow(5).values).toEqual([undefined, ...identifyHeaders]);
    // Ordenado pelo número do item; código como texto preserva o zero.
    expect(sheet.getCell('A6').value).toBe('ABC-9');
    expect(sheet.getCell('B6').value).toBe('R07A1C01DP01');
    expect(sheet.getCell('A7').value).toBe('000123');
    expect(sheet.getCell('C7').value).toBe('R15G03');
    expect(sheet.getCell('D7').value).toBe(0.01);
    expect(sheet.getCell('D7').numFmt).toBe('0.000" kg"');
    expect(sheet.getCell('D6').value).toBe('');
    expect(sheet.getCell('I7').value).toBe('13/10/2026, 12:30');
  });
});

describe('Word da identificação', () => {
  it('traz o código preenchido e aceita item sem foto', async () => {
    const blob = await createFindDocument(
      { name: lot.name, createdAt: Date.parse(lot.created_at) },
      [
        {
          id: '1',
          lotId: lot.id,
          order: 1,
          createdAt: 1,
          photos: [],
          code: 'XYZ-77',
        },
      ],
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('XYZ-77');
    expect(xml).toContain('Foto removida');
  });
});

describe('itens na tela', () => {
  it('junta a nuvem com o que ainda está na fila do aparelho', () => {
    const cloud = [item(1, { status: 'pendente' }), item(2)];
    const merged = mergeItems(lot.id, cloud, [
      {
        id: 'e1',
        createdAt: 1,
        kind: 'item',
        lotId: lot.id,
        itemId: 'novo',
        isNew: true,
        createdBy: 'Caio',
        fields: { address: null, bombona: 'R01G01', weight_g: 5, note: null },
        photos: [{ path: 'p.jpg', width: 10, height: 10 }],
        attempts: 0,
      },
      {
        id: 'e2',
        createdAt: 2,
        kind: 'item',
        lotId: lot.id,
        itemId: cloud[0].id,
        isNew: false,
        createdBy: 'Caio',
        fields: { address: 'R02A1', bombona: null, weight_g: null, note: 'x' },
        photos: [],
        attempts: 0,
      },
    ]);
    expect(merged.map((i) => i.ord)).toEqual([1, 2, 3]);
    expect(merged[0].address).toBe('R02A1');
    expect(merged[0].pending?.id).toBe('e2');
    expect(merged[2]).toMatchObject({
      id: 'novo',
      bombona: 'R01G01',
      status: 'pendente',
    });
  });
});

describe('código digitado pela estrutura', () => {
  it('usa as regras do levantamento', () => {
    expect(checkCode(' abc-123 ', defaultSettings)).toEqual({
      code: 'ABC-123',
    });
    expect(checkCode('R07A1C01DP01', defaultSettings).error).toMatch(
      /endereço/,
    );
    expect(checkCode('', defaultSettings).error).toBeTruthy();
  });
});

describe('fila de envio', () => {
  it('edição de um item ainda não enviado substitui o pendente', async () => {
    const lotId = crypto.randomUUID(),
      itemId = crypto.randomUUID();
    const fields = { address: null, bombona: null, weight_g: null, note: null };
    await queueItem({
      lotId,
      itemId,
      isNew: true,
      fields,
      photos: [{ path: 'a.jpg', width: 1, height: 1, blob: new Blob(['a']) }],
      removePaths: [],
    });
    await queueItem({
      lotId,
      itemId,
      isNew: false,
      fields: { ...fields, note: 'editado' },
      photos: [{ path: 'b.jpg', width: 1, height: 1, blob: new Blob(['b']) }],
      removePaths: ['a.jpg'],
    });
    const entries = await db.outbox.where('itemId').equals(itemId).toArray();
    expect(entries).toHaveLength(1);
    // Continua sendo um cadastro novo; a foto que nunca subiu não precisa ser apagada.
    expect(entries[0]).toMatchObject({ isNew: true, removePaths: [] });
    expect(entries[0].fields?.note).toBe('editado');
    expect(entries[0].photos?.map((p) => p.path)).toEqual(['b.jpg']);
  });
});
