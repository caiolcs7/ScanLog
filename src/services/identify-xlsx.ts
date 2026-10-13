import ExcelJS from 'exceljs';
import { itemLabel } from '../core/identify';
import { kgDecimals } from '../core/weight';
import { itemStatusLabel, type CloudItem, type CloudLot } from '../cloud/types';

const INK = 'FF3B1A5A',
  MUTED = 'FF6B6178';
/** Mesmas colunas do relatório do levantamento, seguidas dos dados da identificação. */
export const identifyHeaders = [
  'Código do Produto',
  'Endereço',
  'Galão',
  'Peso',
  'Item',
  'Lote',
  'Status',
  'Cadastrado em',
  'Codificado em',
  'Observação',
];
const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(value))
    : '';
export function identifyRow(item: CloudItem, lot?: CloudLot) {
  const notes = [item.note, item.code_note].filter(Boolean).join(' · ');
  return [
    item.code ?? '',
    item.address ?? '',
    item.bombona ?? '',
    item.weight_g ?? '',
    itemLabel(item.ord),
    lot?.name ?? '',
    itemStatusLabel[item.status],
    when(item.created_at),
    when(item.coded_at),
    notes,
  ];
}
/** Planilha da Identificação: um lote ou todos os lotes do período. */
export function createIdentifyWorkbook(
  title: string,
  lots: CloudLot[],
  items: CloudItem[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ScanLog';
  workbook.created = new Date();
  const byLot = new Map(lots.map((l) => [l.id, l]));
  const order = new Map(lots.map((l, i) => [l.id, i]));
  const rows = [...items].sort(
    (a, b) =>
      (order.get(a.lot_id) ?? 0) - (order.get(b.lot_id) ?? 0) || a.ord - b.ord,
  );
  const last = String.fromCharCode(64 + identifyHeaders.length);
  const sheet = workbook.addWorksheet('Identificação', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
  });
  sheet.columns = [
    {
      key: 'code',
      width: Math.min(
        65,
        rows.reduce((w, r) => Math.max(w, (r.code ?? '').length + 3), 24),
      ),
    },
    { key: 'address', width: 22 },
    { key: 'galao', width: 14 },
    { key: 'weight', width: 16 },
    { key: 'item', width: 8 },
    { key: 'lot', width: 26 },
    { key: 'status', width: 14 },
    { key: 'created', width: 18 },
    { key: 'coded', width: 18 },
    { key: 'note', width: 44 },
  ];
  sheet.mergeCells(`A1:${last}1`);
  sheet.getCell('A1').value = 'RELATÓRIO DE IDENTIFICAÇÃO DE MATERIAIS';
  sheet.getRow(1).height = 34;
  sheet.getCell('A1').font = {
    name: 'Calibri',
    size: 14,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  sheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: INK },
  };
  sheet.mergeCells(`A2:${last}2`);
  sheet.getCell('A2').value = title;
  sheet.getRow(2).height = 26;
  sheet.getCell('A2').font = {
    name: 'Calibri',
    size: 12,
    bold: true,
    color: { argb: INK },
  };
  sheet.mergeCells(`A3:${last}3`);
  sheet.getCell('A3').value =
    `${new Date().toLocaleDateString('pt-BR')}  •  ${rows.length} itens`;
  sheet.getRow(3).height = 22;
  sheet.getCell('A3').font = {
    name: 'Calibri',
    size: 10,
    color: { argb: MUTED },
  };
  sheet.getRow(4).height = 10;
  sheet.getRow(5).values = identifyHeaders;
  sheet.getRow(5).height = 28;
  sheet.getRow(5).eachCell((cell) => {
    cell.font = {
      name: 'Calibri',
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 11,
    };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.alignment = { vertical: 'middle', indent: 1 };
  });
  rows.forEach((item, index) => {
    const row = sheet.addRow(identifyRow(item, byLot.get(item.lot_id)));
    row.height = 24;
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.numFmt = '@';
      if (column === 4 && item.weight_g) {
        // Peso como número em kg, igual ao levantamento (10 g → 0,010 kg).
        cell.value = item.weight_g / 1000;
        cell.numFmt = `0.${'0'.repeat(kgDecimals(item.weight_g))}" kg"`;
      }
      cell.font = { name: 'Calibri', size: 11, color: { argb: INK } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        indent: 1,
        wrapText: column === identifyHeaders.length,
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF7F3FB' },
      };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE6DEEF' } } };
    });
  });
  const end = Math.max(5, rows.length + 5);
  sheet.autoFilter = { from: 'A5', to: `${last}${end}` };
  sheet.pageSetup.printTitlesRow = '1:5';
  sheet.pageSetup.printArea = `A1:${last}${end}`;
  sheet.headerFooter.oddFooter = 'ScanLog &R Página &P de &N';
  for (let row = 1; row <= 3; row++)
    sheet.getCell(`A${row}`).alignment = {
      vertical: 'middle',
      indent: 1,
      wrapText: true,
    };
  return workbook;
}
export function identifyFilename(title: string) {
  const name = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 60);
  const d = new Date();
  return `Identificacao_${name}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`;
}
export async function identifyXlsx(
  title: string,
  lots: CloudLot[],
  items: CloudItem[],
) {
  const buffer = await createIdentifyWorkbook(
    title,
    lots,
    items,
  ).xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
