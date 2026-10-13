import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import sharp from 'sharp';
import {
  createFindDocument,
  findFilename,
} from '../src/services/identify-export';
import type { FindItem, FindLot } from '../src/core/models';

const lot: FindLot = {
  id: crypto.randomUUID(),
  name: 'Sem código 13/10',
  createdAt: new Date(2026, 9, 13).getTime(),
  updatedAt: Date.now(),
  count: 2,
  nextOrder: 3,
};
async function photo(width: number, height: number, background = '#e8590c') {
  const data = await sharp({
    create: { width, height, channels: 3, background },
  })
    .jpeg()
    .toBuffer();
  return { blob: new Blob([new Uint8Array(data)]), width, height };
}

describe('documento de identificação', () => {
  it('traz fotos, dados e o campo CODIGO em cada item', async () => {
    const items: FindItem[] = [
      {
        id: crypto.randomUUID(),
        lotId: lot.id,
        order: 1,
        createdAt: 1,
        photos: [await photo(800, 600)],
        address: 'R07A1C01DP01',
        bombona: 'R07G03',
        weight: 0.24,
      },
      {
        id: crypto.randomUUID(),
        lotId: lot.id,
        order: 2,
        createdAt: 2,
        photos: await Promise.all(
          ['#111111', '#222222', '#333333'].map((c) => photo(600, 800, c)),
        ),
        note: 'conector azul',
      },
    ];
    const blob = await createFindDocument(lot, items);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/CODIGO : /g)).toHaveLength(2);
    expect(xml).toContain('ITEM 01');
    expect(xml).toContain('ITEM 02');
    expect(xml).toContain('R07A1C01DP01');
    expect(xml).toContain('0,00024 kg');
    expect(xml).toContain('conector azul');
    expect(
      Object.keys(zip.files).filter((f) => /^word\/media\/.+/.test(f)),
    ).toHaveLength(4);
  });
  it('nomeia o arquivo sem acentos', () => {
    expect(findFilename(lot)).toBe(
      'Identificacao_Codigos_Sem_codigo_13_10_2026-10-13.docx',
    );
  });
});
