import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ITableCellOptions,
} from 'docx';
import { itemLabel } from '../core/identify';
import type { FindItem, FindPhoto } from '../core/models';

/** Dados do lote usados no documento (lote local ou da nuvem). */
export type DocLot = { name: string; createdAt: number };
import { formatKg } from '../core/weight';

const FONT = 'Calibri',
  INK = '1A0B2E',
  MUTED = '5D5270',
  BRAND = '4C007D',
  LINE = 'CBBFDB',
  FILL = 'FFF2E8',
  ACCENT = 'E8590C';
/** Largura útil do A4 (11906) menos as margens de 1,8 cm, em twips. */
const CONTENT_TWIPS = 9866;
const border = { style: BorderStyle.SINGLE, size: 6, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function text(
  value: string,
  options: Partial<{ bold: boolean; size: number; color: string }> = {},
) {
  return new TextRun({
    text: value,
    font: FONT,
    size: options.size ?? 20,
    bold: options.bold,
    color: options.color ?? INK,
  });
}
function cell(children: Paragraph[], options: Partial<ITableCellOptions> = {}) {
  return new TableCell({
    borders,
    margins: { top: 90, bottom: 90, left: 140, right: 140 },
    ...options,
    children,
  });
}
function fit(photo: FindPhoto, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / photo.width, maxHeight / photo.height, 1);
  return {
    width: Math.round(photo.width * scale),
    height: Math.round(photo.height * scale),
  };
}
async function image(photo: FindPhoto, box: { w: number; h: number }) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    children: [
      new ImageRun({
        type: 'jpg',
        data: new Uint8Array(await photo.blob.arrayBuffer()),
        transformation: fit(photo, box.w, box.h),
      }),
    ],
  });
}
function field(label: string, value: string) {
  return [
    text(`${label}: `, { color: MUTED, size: 18 }),
    text(`${value || '—'}     `, { bold: true }),
  ];
}
/** Altura máxima das fotos: mantém 2 itens por página A4. */
const PHOTO_H = 280;
async function itemTable(item: FindItem, index: number) {
  // Uma coluna por foto: todas as fotos do item ficam lado a lado.
  const columns = Math.max(item.photos.length, 1),
    photoW = Math.floor(CONTENT_TWIPS / 15 / columns) - 14;
  const rows: TableRow[] = [
    new TableRow({
      cantSplit: true,
      children: [
        cell(
          [
            new Paragraph({
              keepNext: true,
              children: [
                text(`ITEM ${itemLabel(index + 1)}`, {
                  bold: true,
                  size: 24,
                  color: 'FFFFFF',
                }),
                text(
                  `   ${item.photos.length} foto${item.photos.length > 1 ? 's' : ''}`,
                  { size: 18, color: 'E9DDF5' },
                ),
              ],
            }),
          ],
          {
            columnSpan: columns,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: BRAND },
          },
        ),
      ],
    }),
    new TableRow({
      cantSplit: true,
      children: [
        cell(
          [
            new Paragraph({
              keepNext: true,
              children: [
                ...field('Endereço', item.address ?? ''),
                ...field('Bombona', item.bombona ?? ''),
                ...field('Peso', item.weight ? formatKg(item.weight) : ''),
                ...(item.note ? field('Obs.', item.note) : []),
              ],
            }),
          ],
          { columnSpan: columns },
        ),
      ],
    }),
    new TableRow({
      cantSplit: true,
      children: item.photos.length
        ? await Promise.all(
            item.photos.map(async (photo) =>
              cell([await image(photo, { w: photoW, h: PHOTO_H })], {
                margins: { top: 60, bottom: 60, left: 60, right: 60 },
              }),
            ),
          )
        : [
            cell(
              [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    text('Foto removida após 5 meses', { color: MUTED }),
                  ],
                }),
              ],
              { margins: { top: 240, bottom: 240, left: 60, right: 60 } },
            ),
          ],
    }),
    new TableRow({
      cantSplit: true,
      height: { value: 720, rule: 'atLeast' },
      children: [
        cell(
          [
            new Paragraph({
              spacing: { before: 60 },
              children: [
                text('CODIGO : ', { bold: true, size: 28 }),
                ...(item.code ? [text(item.code, { size: 28 })] : []),
              ],
            }),
          ],
          {
            columnSpan: columns,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: FILL },
            borders: {
              ...borders,
              left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT },
            },
          },
        ),
      ],
    }),
  ];
  return new Table({
    width: { size: CONTENT_TWIPS, type: WidthType.DXA },
    columnWidths: Array.from({ length: columns }, () =>
      Math.floor(CONTENT_TWIPS / columns),
    ),
    rows,
  });
}
/** Documento Word com fotos de cada item e o campo "CODIGO : " editável. */
export async function createFindDocument(lot: DocLot, items: FindItem[]) {
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
    Date.now(),
  );
  const body: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        text('IDENTIFICAÇÃO DE CÓDIGOS', {
          bold: true,
          size: 18,
          color: ACCENT,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [text(lot.name, { bold: true, size: 36 })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        text(
          `Almoxarifado · ${date} · ${items.length} ${items.length === 1 ? 'item' : 'itens'}`,
          { color: MUTED },
        ),
      ],
    }),
    new Paragraph({
      spacing: { after: 280 },
      border: {
        left: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 8 },
      },
      children: [
        text('Escreva o código de cada produto ao lado de ', { color: MUTED }),
        text('CODIGO :', { bold: true }),
        text(' e devolva este arquivo ao almoxarifado.', { color: MUTED }),
      ],
    }),
  ];
  // 2 itens por página: quebra antes do 3º, 5º, 7º…
  for (const [index, item] of items.entries()) {
    if (index && index % 2 === 0)
      body.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    else if (index)
      body.push(new Paragraph({ spacing: { after: 280 }, children: [] }));
    body.push(await itemTable(item, index));
  }
  const doc = new Document({
    creator: 'ScanLog',
    title: `Identificação de códigos — ${lot.name}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1020, bottom: 1020, left: 1020, right: 1020 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { top: { ...none } },
                children: [
                  new TextRun({
                    font: FONT,
                    size: 16,
                    color: MUTED,
                    children: [
                      `${lot.name} · Página `,
                      PageNumber.CURRENT,
                      ' de ',
                      PageNumber.TOTAL_PAGES,
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBlob(doc);
}
export function findFilename(lot: DocLot) {
  const name = lot.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 60);
  const d = new Date(lot.createdAt);
  return `Identificacao_Codigos_${name}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.docx`;
}
