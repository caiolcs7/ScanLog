import ExcelJS from 'exceljs';
import type { InventoryRecord, Session } from '../core/models';
import { extractStreet } from '../core/parser';

export type ExportOptions = {
  sort: 'order' | 'address' | 'code';
  splitStreets: boolean;
  format: 'xlsx' | 'csv';
};
export const defaultExport: ExportOptions = {
  sort: 'order',
  splitStreets: false,
  format: 'xlsx',
};
export function sortRecords(
  records: InventoryRecord[],
  sort: ExportOptions['sort'],
) {
  return [...records].sort((a, b) =>
    sort === 'order'
      ? a.order - b.order
      : a[sort].localeCompare(b[sort], 'pt-BR', { numeric: true }) ||
        a.order - b.order,
  );
}
export function reportFilename(session: Session, format = 'xlsx') {
  const name = session.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 60);
  const date = new Date(session.createdAt);
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `Relatorio_Almoxarifado_${name}_${localDate}.${format}`;
}
export function exportColumns(records: InventoryRecord[]) {
  const headers = ['Código do Produto', 'Endereço', 'Galão'];
  const withDescription = records.some((r) => r.description);
  if (withDescription) headers.push('Descritivo');
  return {
    headers,
    row: (r: InventoryRecord) =>
      withDescription
        ? [r.code, r.address, r.galao ?? '', r.description ?? '']
        : [r.code, r.address, r.galao ?? ''],
  };
}
export function createWorkbook(
  session: Session,
  records: InventoryRecord[],
  options: ExportOptions = defaultExport,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Leitor de Almoxarifado';
  workbook.created = new Date();
  const sorted = sortRecords(records, options.sort);
  const columns = exportColumns(records);
  const last = String.fromCharCode(64 + columns.headers.length);
  const groups = new Map<string, InventoryRecord[]>([
    ['Todos os registros', sorted],
  ]);
  if (options.splitStreets)
    for (const record of sorted) {
      const street = extractStreet(record.address);
      if (!groups.has(street)) groups.set(street, []);
      groups.get(street)!.push(record);
    }
  for (const [name, rows] of groups) {
    const sheet = workbook.addWorksheet(name.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 5 }],
      pageSetup: {
        paperSize: 9,
        orientation: 'portrait',
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
          rows.reduce((width, r) => Math.max(width, r.code.length + 3), 39),
        ),
      },
      {
        key: 'address',
        width: Math.min(
          65,
          rows.reduce((width, r) => Math.max(width, r.address.length + 3), 27),
        ),
      },
      { key: 'galao', width: 16 },
      ...(columns.headers.length > 3
        ? [{ key: 'description', width: 60 }]
        : []),
    ];
    sheet.mergeCells(`A1:${last}1`);
    sheet.getCell('A1').value = 'RELATÓRIO DE LOCALIZAÇÃO DE MATERIAIS';
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
      fgColor: { argb: 'FF3B1A5A' },
    };
    sheet.mergeCells(`A2:${last}2`);
    sheet.getCell('A2').value = session.name;
    sheet.getRow(2).height = 26;
    sheet.getCell('A2').font = {
      name: 'Calibri',
      size: 12,
      bold: true,
      color: { argb: 'FF3B1A5A' },
    };
    sheet.mergeCells(`A3:${last}3`);
    sheet.getCell('A3').value =
      `${new Date(session.createdAt).toLocaleDateString('pt-BR')}  •  ${rows.length} registros`;
    sheet.getRow(3).height = 22;
    sheet.getCell('A3').font = {
      name: 'Calibri',
      size: 10,
      color: { argb: 'FF6B6178' },
    };
    sheet.getRow(4).height = 10;
    sheet.getRow(5).values = columns.headers;
    sheet.getRow(5).height = 28;
    sheet.getRow(5).eachCell((cell) => {
      cell.font = {
        name: 'Calibri',
        bold: true,
        color: { argb: 'FFFFFFFF' },
        size: 11,
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3B1A5A' },
      };
      cell.alignment = { vertical: 'middle', indent: 1 };
    });
    rows.forEach((record, index) => {
      const row = sheet.addRow(columns.row(record));
      row.height = 24;
      row.eachCell((cell, column) => {
        cell.numFmt = '@';
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF3B1A5A' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'left',
          indent: 1,
          wrapText: column === 4,
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF7F3FB' },
        };
        cell.border = {
          bottom: { style: 'hair', color: { argb: 'FFE6DEEF' } },
        };
      });
    });
    sheet.autoFilter = {
      from: 'A5',
      to: `${last}${Math.max(5, rows.length + 5)}`,
    };
    sheet.pageSetup.printTitlesRow = '1:5';
    sheet.pageSetup.printArea = `A1:${last}${Math.max(5, rows.length + 5)}`;
    sheet.headerFooter.oddFooter = 'Leitor de Almoxarifado &R Página &P de &N';
    for (let row = 1; row <= 3; row++)
      sheet.getCell(`A${row}`).alignment = {
        vertical: 'middle',
        indent: 1,
        wrapText: true,
      };
  }
  return workbook;
}
export function createCsv(
  records: InventoryRecord[],
  sort: ExportOptions['sort'],
) {
  const safe = (value: string) =>
    `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  return (
    '\uFEFF' +
    [
      exportColumns(records).headers,
      ...sortRecords(records, sort).map(exportColumns(records).row),
    ]
      .map((row) => row.map(safe).join(';'))
      .join('\r\n')
  );
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function exportSession(
  session: Session,
  records: InventoryRecord[],
  options: ExportOptions,
) {
  if (options.format === 'csv') {
    downloadBlob(
      new Blob([createCsv(records, options.sort)], {
        type: 'text/csv;charset=utf-8;',
      }),
      reportFilename(session, 'csv'),
    );
    return;
  }
  const buffer = await createWorkbook(
    session,
    records,
    options,
  ).xlsx.writeBuffer();
  downloadBlob(
    new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    reportFilename(session),
  );
}
