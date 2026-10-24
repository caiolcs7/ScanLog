import ExcelJS from 'exceljs';
import type { Fornecedor, Material } from './api';
import { emOrdem, emReais, MOEDAS, type Cambio } from './format';

const origem = (f?: Fornecedor) =>
  f ? (f.origem === 'nacional' ? 'Nacional' : 'Internacional') : '';

const TINTA = 'FF14181B',
  LARANJA = 'FFE0560F';
const quando = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(v))
    : '';

export const colunas = [
  'Código',
  'Descrição',
  'Tipo',
  'Peso (kg)',
  'Endereço completo',
  'Fornecedor 1',
  'Nacional / Internacional 1',
  'Preço unitário 1',
  'Moeda 1',
  'Fornecedor 2',
  'Nacional / Internacional 2',
  'Preço unitário 2',
  'Moeda 2',
  'Preço em R$ (do 1º com preço)',
  'Quantidade',
  'Valor total em R$',
  'Atualizado em',
  'Atualizado por',
];

/** Uma linha por material, na ordem da lista que está na tela. */
export function linha(m: Material, porId: Map<number, Fornecedor>, c: Cambio) {
  const f = m.fornecedor_id != null ? porId.get(m.fornecedor_id) : undefined,
    f2 = m.fornecedor2_id != null ? porId.get(m.fornecedor2_id) : undefined,
    r = emReais(m, c);
  return [
    m.codigo,
    m.descricao ?? '',
    m.tipo ?? '',
    m.peso_g != null ? m.peso_g / 1000 : '',
    emOrdem(m.locais).join(', '),
    f?.nome ?? '',
    origem(f),
    m.preco ?? '',
    m.moeda ? MOEDAS[m.moeda].nome : '',
    f2?.nome ?? '',
    origem(f2),
    m.preco2 ?? '',
    m.moeda2 ? MOEDAS[m.moeda2].nome : '',
    r != null && Number.isFinite(r) ? Math.round(r * 100) / 100 : '',
    m.quantidade ?? '',
    r != null && Number.isFinite(r) && m.quantidade != null
      ? Math.round(r * m.quantidade * 100) / 100
      : '',
    quando(m.atualizado_em),
    m.atualizado_por ?? '',
  ];
}

export async function planilha(
  materiais: Material[],
  fornecedores: Fornecedor[],
  c: Cambio,
  filtro: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ScanLog';
  wb.created = new Date();
  const porId = new Map(fornecedores.map((f) => [f.id, f]));
  const ultima = String.fromCharCode(64 + colunas.length);
  const ws = wb.addWorksheet('Materiais', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  ws.columns = [
    16, 52, 7, 11, 30, 28, 14, 14, 9, 28, 14, 14, 9, 14, 12, 16, 17, 18,
  ].map((width) => ({ width }));
  ws.mergeCells(`A1:${ultima}1`);
  const t = ws.getCell('A1');
  t.value = 'PAINEL DE MATERIAIS';
  t.font = {
    name: 'Calibri',
    size: 14,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
  ws.getRow(1).height = 30;
  ws.mergeCells(`A2:${ultima}2`);
  const cot = (['USD', 'CNY'] as const)
    .filter((m) => Number.isFinite(c[m].valor))
    .map(
      (m) =>
        `${MOEDAS[m].nome} R$ ${c[m].valor.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`,
    )
    .join(' · ');
  ws.getCell('A2').value =
    `${filtro} · ${materiais.length} materiais · gerado em ${quando(new Date().toISOString())}` +
    (cot ? ` · cotação do Banco Central: ${cot}` : '');
  ws.getCell('A2').font = {
    name: 'Calibri',
    size: 10,
    color: { argb: 'FF5A6267' },
  };
  const cab = ws.getRow(4);
  cab.values = colunas;
  cab.height = 22;
  cab.eachCell((cell) => {
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: LARANJA },
    };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  for (const m of materiais) ws.addRow(linha(m, porId, c));
  ws.getColumn(4).numFmt = '0.000';
  ws.getColumn(8).numFmt = '#,##0.00##';
  ws.getColumn(12).numFmt = '#,##0.00##';
  ws.getColumn(14).numFmt = '"R$" #,##0.00';
  ws.getColumn(15).numFmt = '#,##0.###';
  ws.getColumn(16).numFmt = '"R$" #,##0.00';
  ws.autoFilter = { from: 'A4', to: `${ultima}4` };
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
