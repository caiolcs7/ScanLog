import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
const base = 'http://127.0.0.1:4173/teste-subpasta/';
async function create(page: Page, name = 'Teste R01') {
  await page.goto(base);
  await page
    .getByRole('heading', { name: 'Levantamentos', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'Novo levantamento', exact: true })
    .first()
    .click();
  await page.getByLabel('Nome do levantamento').fill(name);
  await page.getByRole('button', { name: 'Criar levantamento' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function hid(page: Page, value: string) {
  await page
    .getByRole('button', { name: 'Leitor físico', exact: true })
    .click();
  const input = page.getByRole('textbox', { name: 'Entrada do leitor' });
  await input.fill(value);
  await input.press('Enter');
}
async function imageScan(page: Page, name: string) {
  const filename = name.includes('.') ? name : `${name}.png`;
  await page
    .getByLabel('Selecionar imagem da etiqueta')
    .setInputFiles(path.resolve(`tests/fixtures/${filename}`));
}
async function readyOffline(page: Page) {
  await expect(
    page.getByText('Pronto para uso offline', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}
async function exportXlsx(page: Page) {
  await page
    .getByRole('button', { name: 'Exportar levantamento', exact: true })
    .click();
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Exportar arquivo', exact: true })
    .click();
  const download = await downloaded;
  await mkdir('artifacts', { recursive: true });
  const filename = path.resolve('artifacts', download.suggestedFilename());
  await download.saveAs(filename);
  return filename;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test('button capture, actual reticle crop, continuous option, cancellation and offline preference', async ({
  page,
  context,
}) => {
  await create(page, 'Captura protegida');
  await readyOffline(page);
  await hid(page, 'R01A1C02DP01');
  await page.getByRole('button', { name: 'Câmera', exact: true }).click();
  await expect(page.getByLabel('Captura pela câmera')).toHaveValue('button');
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 640, 480);
    // Canvas streams emit fresh frames only when painted, like a live camera.
    setInterval(() => ctx.fillRect(0, 0, 1, 1), 100);
    (window as unknown as { testCamera: HTMLCanvasElement }).testCamera =
      canvas;
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(8);
    navigator.mediaDevices.enumerateDevices = async () => [];
  });
  const frame = async (
    labels: { name: string; x: number; y: number; size: number }[],
  ) => {
    await page.evaluate(
      async (labels) => {
        const canvas = (window as unknown as { testCamera: HTMLCanvasElement })
          .testCamera;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 640, 480);
        for (const label of labels) {
          const image = new Image();
          image.src = label.url;
          await image.decode();
          ctx.drawImage(image, label.x, label.y, label.size, label.size);
        }
      },
      await Promise.all(
        labels.map(async (l) => ({
          ...l,
          url: `data:image/png;base64,${(await readFile(`tests/fixtures/${l.name}.png`)).toString('base64')}`,
        })),
      ),
    );
  };
  await page
    .getByRole('button', { name: 'Iniciar câmera', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Ler código', exact: true }),
  ).toBeVisible();
  await frame([{ name: 'product-ml', x: 240, y: 160, size: 160 }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Captura pela câmera').focus();
  await page.screenshot({
    path: '.impeccable/review/button-mobile.png',
    fullPage: true,
  });
  await page.waitForTimeout(1200);
  await expect(page.locator('.session-heading p')).toContainText('0 registros');
  await page.getByRole('button', { name: 'Ler código', exact: true }).click();
  await expect(page.locator('.session-heading p')).toContainText('1 registros');
  await frame([{ name: 'product-mpc', x: 240, y: 160, size: 160 }]);
  await page.waitForTimeout(1200);
  await expect(page.locator('.session-heading p')).toContainText('1 registros');
  await frame([]);
  await page.getByRole('button', { name: 'Ler código', exact: true }).click();
  await page
    .getByRole('button', { name: 'Cancelar leitura', exact: true })
    .click();
  await frame([{ name: 'product-mpc', x: 240, y: 160, size: 160 }]);
  await page.waitForTimeout(600);
  await expect(page.locator('.session-heading p')).toContainText('1 registros');
  // A full label outside the reticle and a partial label crossing its left edge.
  await frame([{ name: 'product-mpc', x: 0, y: 170, size: 40 }]);
  // Let the synthetic camera publish the new blank/out-of-reticle frame before arming.
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Ler código', exact: true }).click();
  await expect(page.locator('.scanner-hint')).toContainText('Tempo esgotado', {
    timeout: 8000,
  });
  await expect(page.locator('.session-heading p')).toContainText('1 registros');
  await page.getByLabel('Captura pela câmera').selectOption('continuous');
  await expect(
    page.getByRole('button', { name: 'Ler código', exact: true }),
  ).toHaveCount(0);
  await frame([{ name: 'product-mpc', x: 20, y: 160, size: 160 }]);
  await page.waitForTimeout(1200);
  await expect(page.locator('.session-heading p')).toContainText('1 registros');
  await frame([
    { name: 'product-mpc', x: 150, y: 160, size: 150 },
    { name: 'product-stc', x: 330, y: 160, size: 150 },
  ]);
  await expect(page.locator('.scanner-hint')).toContainText('várias etiquetas');
  await expect(page.locator('.session-heading p')).toContainText('1 registros');
  await frame([{ name: 'product-mpc', x: 240, y: 160, size: 160 }]);
  await expect(page.locator('.session-heading p')).toContainText('2 registros');
  await page.waitForTimeout(1200);
  await expect(
    page.getByRole('button', { name: 'Adicionar novamente' }),
  ).toHaveCount(0);
  for (const [width, height] of [
    [390, 844],
    [1366, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(async () => {
        const video = await page.locator('video').boundingBox();
        const reticle = await page.locator('.scan-reticle').boundingBox();
        return Math.abs(
          video!.x + video!.width / 2 - reticle!.x - reticle!.width / 2,
        );
      })
      .toBeLessThan(2);
    await page.getByLabel('Captura pela câmera').focus();
    await noOverflow(page);
    await page.screenshot({
      path: `.impeccable/review/capture-${width}.png`,
      fullPage: true,
    });
  }
  // Camera address change interrupts capture; cancellation preserves the old association.
  await frame([{ name: 'address2', x: 240, y: 160, size: 160 }]);
  await expect(
    page.getByRole('dialog', { name: 'Trocar endereço?' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.impeccable/review/address-change-mobile.png',
    fullPage: true,
  });
  await expect(page.locator('.address-value')).toHaveText('R01A1C02DP01');
  await page
    .getByRole('button', { name: 'Manter endereço', exact: true })
    .click();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await frame([]);
  await page.waitForTimeout(1200);
  await frame([{ name: 'address2', x: 240, y: 160, size: 160 }]);
  await page
    .getByRole('button', { name: 'Confirmar troca', exact: true })
    .click();
  await expect(page.locator('.address-value')).toHaveText('R01A1C04DP02');
  await frame([{ name: 'product-stc', x: 240, y: 160, size: 160 }]);
  await expect(page.locator('.session-heading p')).toContainText('3 registros');
  await expect(page.locator('.scan-feedback')).toContainText('STC003');
  await expect(page.locator('.scan-feedback')).toContainText('R01A1C04DP02');
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(page.locator('.session-heading p')).toContainText('2 registros');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel('Captura pela câmera')).toHaveValue(
    'continuous',
  );
  await expect(page.locator('.session-heading p')).toContainText('2 registros');
});

test('address confirmation blocks queued HID scans and double acceptance', async ({
  page,
}) => {
  await create(page, 'Troca de rua');
  await hid(page, 'R14B77');
  await page
    .getByRole('textbox', { name: 'Entrada do leitor' })
    .evaluate((input) => {
      for (const value of ['R14B78', 'ML12345']) {
        (input as HTMLInputElement).value = value;
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );
      }
    });
  await expect(
    page.getByRole('dialog', { name: 'Trocar endereço?' }),
  ).toBeVisible();
  await expect(page.locator('.session-heading p')).toContainText('0 registros');
  await page.getByRole('button', { name: 'Manter endereço' }).click();
  await expect(page.locator('.address-value')).toHaveText('R14B77');
  await hid(page, 'ML12345');
  await hid(page, 'R14B78');
  await page
    .getByRole('button', { name: 'Confirmar troca' })
    .evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.address-value')).toHaveText('R14B78');
  await expect(page.locator('.session-heading p')).toContainText('1 registros');
});

test('multiple product prefixes work through Data Matrix, HID, manual entry and XLSX offline', async ({
  page,
  context,
}) => {
  await create(page, 'Novos prefixos');
  await readyOffline(page);
  await context.setOffline(true);
  await hid(page, 'R01A1C02DP01');
  const families = ['product-ml', 'product-mpc', 'product-stc', 'product-mpl'];
  for (const [index, name] of families.entries()) {
    await imageScan(page, name);
    await expect(page.locator('.session-heading p')).toContainText(
      `${index + 1} registros`,
    );
  }
  await hid(page, 'R01A1C04DP03');
  await page
    .getByRole('button', { name: 'Confirmar troca', exact: true })
    .click();
  await hid(page, 'zx123');
  await expect(page.locator('.session-heading p')).toContainText('5 registros');
  await expect(page.locator('.address-value')).toHaveText('R01A1C04DP03');
  await page
    .getByRole('button', { name: 'Entrada manual', exact: true })
    .click();
  await page.getByLabel('Código do Produto', { exact: true }).fill('Ml999');
  await page
    .getByRole('button', { name: 'Adicionar registro', exact: true })
    .click();
  await expect(page.locator('.session-heading p')).toContainText('6 registros');
  await page.reload();
  await expect(page.locator('.session-heading p')).toContainText('6 registros');
  const filename = await exportXlsx(page);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const sheet = workbook.getWorksheet('Todos os registros')!;
  expect(sheet.columnCount).toBe(3);
  expect(
    [6, 7, 8, 9, 10, 11].map((row) => [
      sheet.getCell(`A${row}`).value,
      sheet.getCell(`B${row}`).value,
    ]),
  ).toEqual([
    ['ML12345', 'R01A1C02DP01'],
    ['MPCABC01', 'R01A1C02DP01'],
    ['STC003', 'R01A1C02DP01'],
    ['MPL012', 'R01A1C02DP01'],
    ['ZX123', 'R01A1C04DP03'],
    ['ML999', 'R01A1C04DP03'],
  ]);
});

test('real GS1 product and prefixed address labels work with special manual records', async ({
  page,
}) => {
  await create(page, 'Etiquetas reais');
  await imageScan(page, 'address-prefixed-real.jpg');
  await expect(page.locator('.address-value')).toHaveText('R02A1C01EP02');
  await imageScan(page, 'product-gs1-real.jpg');
  await expect(page.locator('.session-heading p')).toContainText('1 registros');

  await page
    .getByRole('button', { name: 'Entrada manual', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Endereço', exact: true }),
  ).toHaveValue('R02A1C01EP02');
  await page.getByLabel('SEM CÓDIGO', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Adicionar registro', exact: true })
    .click();

  await page
    .getByRole('button', { name: 'Entrada manual', exact: true })
    .click();
  await page.getByLabel('VAZIO', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Adicionar registro', exact: true })
    .click();
  await expect(page.locator('.session-heading p')).toContainText('3 registros');

  await page.getByRole('button', { name: 'Registros 3', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('MPC149M050P6');
  await expect(page.locator('tbody')).toContainText('SEM CODIGO');
  await expect(page.locator('tbody')).toContainText('VAZIO');
  await expect(page.locator('tbody')).toContainText('R02A1C01EP02');
});

test('acceptance: Data Matrix images, browser restart, offline WASM and actual XLSX download', async () => {
  // Chromium on Windows fails to register its service worker with very long profile paths.
  // Use a short, isolated OS temporary profile, preserving it across the real browser restart.
  const profile = await mkdtemp(path.join(tmpdir(), 'almox-e2e-'));
  let context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1366, height: 900 },
  });
  let page = await context.newPage();
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(base) && /^https?:/.test(request.url()))
      external.push(request.url());
  });
  try {
    await create(page);
    await readyOffline(page);
    await imageScan(page, 'address');
    await expect(page.locator('.address-value')).toHaveText('R01A1C03DP02');
    await imageScan(page, 'product');
    await expect(page.locator('.session-heading p')).toContainText(
      '1 registros',
    );
    await imageScan(page, 'product2');
    await expect(page.locator('.session-heading p')).toContainText(
      '2 registros',
    );
    await imageScan(page, 'address2');
    await page
      .getByRole('button', { name: 'Confirmar troca', exact: true })
      .click();
    await expect(page.locator('.address-value')).toHaveText('R01A1C04DP02');
    await imageScan(page, 'product3');
    await expect(page.locator('.session-heading p')).toContainText(
      '3 registros',
    );
    const url = page.url();
    expect(external).toEqual([]);
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: { width: 1366, height: 900 },
    });
    await context.setOffline(true);
    page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('.session-heading p')).toContainText(
      '3 registros',
    );
    await expect(page.locator('.address-value')).toHaveText('R01A1C04DP02');
    await imageScan(page, 'address');
    await page
      .getByRole('button', { name: 'Confirmar troca', exact: true })
      .click();
    await expect(page.locator('.address-value')).toHaveText('R01A1C03DP02');
    const filename = await exportXlsx(page);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filename);
    const sheet = workbook.getWorksheet('Todos os registros')!;
    expect(sheet.columnCount).toBe(3);
    expect(
      [6, 7, 8].map((n) => [
        sheet.getCell(`A${n}`).value,
        sheet.getCell(`B${n}`).value,
      ]),
    ).toEqual([
      ['ITPFPHM510ESAI4', 'R01A1C03DP02'],
      ['ITPRCSEM03AI4', 'R01A1C03DP02'],
      ['ITARSRM003AI4', 'R01A1C04DP02'],
    ]);
    await page
      .getByRole('button', { name: 'Registros 3', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Editar registro 3', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'Endereço', exact: true })
      .fill('R14B077');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('tbody')).toContainText('R14B077');
    await page.reload();
    await expect(page.locator('tbody')).toContainText('R14B077');
    await page.getByRole('button', { name: 'Leitura', exact: true }).click();
    await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
    await expect(page.locator('.session-heading p')).toContainText(
      '2 registros',
    );
    await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
    await expect(page.locator('.session-heading p')).toContainText(
      '3 registros',
    );
    await page
      .getByRole('button', { name: 'Registros 3', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Excluir registro 3', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await expect(page.locator('.session-heading p')).toContainText(
      '2 registros',
    );
    await page.reload();
    await expect(page.locator('.session-heading p')).toContainText(
      '2 registros',
    );
  } finally {
    await context.close();
  }
});

test('HID, duplicate controls, paired order, batch edits, session actions and backup restore', async ({
  page,
}) => {
  await create(page);
  await hid(page, 'ITPFPHM510ESAI4');
  await expect(
    page.getByText('Leia um endereço antes de adicionar produtos.', {
      exact: true,
    }),
  ).toBeVisible();
  await hid(page, 'R01A1C03DP02');
  await hid(page, 'ITPFPHM510ESAI4');
  await expect(page.locator('.session-heading p')).toContainText('1 registros');
  await hid(page, 'ITPFPHM510ESAI4');
  await expect(
    page.getByRole('button', { name: 'Adicionar novamente' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ignorar', exact: true }).click();
  await expect(page.locator('.session-heading p')).toContainText('1 registros');
  await hid(page, 'ITPFPHM510ESAI4');
  await page.getByRole('button', { name: 'Adicionar novamente' }).click();
  await expect(page.locator('.session-heading p')).toContainText('2 registros');
  await page
    .getByLabel('Modo de leitura', { exact: true })
    .selectOption('product-address');
  await hid(page, 'ITPRCSEM03AI4');
  await expect(
    page.getByText('Aguardando endereço', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Aguardando endereço', { exact: true }),
  ).toBeVisible();
  await hid(page, 'R14B77');
  await page
    .getByRole('button', { name: 'Confirmar troca', exact: true })
    .click();
  await expect(page.locator('.session-heading p')).toContainText('3 registros');
  await page.getByRole('button', { name: 'Registros 3', exact: true }).click();
  await page.getByLabel('Selecionar registros desta página').check();
  await page
    .getByRole('button', { name: 'Alterar endereço', exact: true })
    .click();
  await page.getByLabel('Novo endereço').fill('R14B077');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody')).toContainText('R14B077');
  await page.getByLabel('Buscar código ou endereço').fill('itprc');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Buscar código ou endereço').fill('');
  await page
    .getByRole('button', { name: 'Configurações', exact: true })
    .click();
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Exportar backup', exact: true })
    .click();
  const backup = await downloadEvent;
  const backupPath = path.resolve('artifacts/backup-test.json');
  await backup.saveAs(backupPath);
  const json = JSON.parse(await readFile(backupPath, 'utf8'));
  expect(json.records).toHaveLength(3);
  await page.getByLabel('Selecionar backup JSON').setInputFiles(backupPath);
  await expect(
    page.getByRole('button', { name: 'Adicionar cópias' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar cópias' }).click();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Opções de Teste R01', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Duplicar', exact: true }).click();
  await expect(page.locator('.session-row')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Opções de Teste R01', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Nome e observações' }).click();
  await page.getByLabel('Nome do levantamento').fill('Inventário conferido');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(
    page.getByRole('button', { name: 'Inventário conferido', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Opções de Inventário conferido' })
    .click();
  await page.getByRole('menuitem', { name: 'Arquivar', exact: true }).click();
  await expect(page.locator('.session-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Arquivados', exact: true }).click();
  await expect(page.locator('.session-row')).toHaveCount(1);
});

test('synthetic camera decodes Data Matrix once while continuously visible and releases its stream', async () => {
  const context = await chromium.launchPersistentContext(
    await mkdtemp(path.join(tmpdir(), 'almox-camera-')),
    {
      headless: true,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${path.resolve('tests/fixtures/product.y4m')}`,
      ],
    },
  );
  try {
    const page = await context.newPage();
    await create(page, 'Câmera sintética');
    await hid(page, 'R01A1C03DP02');
    await page.getByRole('button', { name: 'Câmera', exact: true }).click();
    await page.getByLabel('Captura pela câmera').selectOption('continuous');
    await page
      .getByRole('button', { name: 'Iniciar câmera', exact: true })
      .click();
    await expect(page.locator('.session-heading p')).toContainText(
      '1 registros',
      { timeout: 30000 },
    );
    // A bounded dwell proves continuous frames do not create more records.
    await page.waitForTimeout(4000);
    await expect(page.locator('.session-heading p')).toContainText(
      '1 registros',
    );
    await expect(
      page.getByRole('button', { name: 'Adicionar novamente' }),
    ).toHaveCount(0);
    const track = await page.evaluateHandle(
      () =>
        (
          document.querySelector('video')!.srcObject as MediaStream
        ).getVideoTracks()[0],
    );
    await page
      .getByRole('button', { name: 'Registros 1', exact: true })
      .click();
    await expect.poll(() => track.evaluate((t) => t.readyState)).toBe('ended');
    await track.dispose();
  } finally {
    await context.close();
  }
});

test('camera failure is actionable; backup schema rejects bad data; clear requires strong confirmation', async ({
  page,
}) => {
  await create(page);
  await page
    .getByRole('button', { name: 'Iniciar câmera', exact: true })
    .click();
  await expect(page.locator('.scanner-hint')).toContainText(
    /Permissão|Nenhuma câmera|Câmera ocupada|Câmera não suportada/,
  );
  await page
    .getByRole('button', { name: 'Configurações', exact: true })
    .click();
  await page.getByLabel('Selecionar backup JSON').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole('alert')).toContainText('Backup inválido');
  await page.getByRole('button', { name: 'Limpar todos os dados' }).click();
  await expect(
    page.getByRole('button', { name: 'Confirmar exclusão' }),
  ).toBeDisabled();
  await page
    .getByLabel('Digite APAGAR TUDO para confirmar')
    .fill('APAGAR TUDO');
  await expect(
    page.getByRole('button', { name: 'Confirmar exclusão' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('responsive surfaces at all required widths and local manifest/assets under subpath', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await create(page, 'Teste R01');
  await hid(page, 'R01A1C03DP02');
  await hid(page, 'ITPFPHM510ESAI4');
  await page.getByRole('button', { name: 'Câmera', exact: true }).click();
  await mkdir('.impeccable/review', { recursive: true });
  const widths = [320, 360, 375, 390, 412, 430, 768, 1024, 1366, 1920];
  const findings: unknown[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    findings.push({ surface: 'scanner', width, overflow: false });
    if (width < 768) {
      const feedback = await page.locator('.operation-feedback').boundingBox();
      expect(feedback!.y + feedback!.height).toBeLessThan(900);
    }
    if (width === 390 || width === 1366)
      await page.screenshot({
        path: `.impeccable/review/${width === 390 ? 'mobile' : 'desktop'}.png`,
        fullPage: true,
      });
  }
  await page.getByRole('button', { name: 'Registros 1', exact: true }).click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    findings.push({ surface: 'records', width, overflow: false });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.impeccable/review/records-mobile.png',
    fullPage: true,
  });
  const selectionTarget = await page
    .locator('tbody .check-target')
    .first()
    .boundingBox();
  expect(selectionTarget!.width).toBeGreaterThanOrEqual(44);
  expect(selectionTarget!.height).toBeGreaterThanOrEqual(44);
  await page
    .getByRole('button', { name: 'Configurações', exact: true })
    .click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    findings.push({ surface: 'settings', width, overflow: false });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.impeccable/review/settings-mobile.png',
    fullPage: true,
  });
  await page
    .getByRole('combobox', { name: 'Tema', exact: true })
    .selectOption('dark');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await noOverflow(page);
  await page
    .getByRole('combobox', { name: 'Tema', exact: true })
    .selectOption('light');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await page
    .getByRole('button', { name: 'Levantamentos', exact: true })
    .click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    findings.push({ surface: 'home', width, overflow: false });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({
    path: '.impeccable/review/home-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await page
    .getByRole('button', { name: 'Novo levantamento', exact: true })
    .click();
  await noOverflow(page);
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const manifestUrl = await page
    .locator('link[rel=manifest]')
    .getAttribute('href');
  const response = await page.request.get(new URL(manifestUrl!, base).href);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.start_url).toBe('./');
  for (const icon of manifest.icons)
    expect((await page.request.get(new URL(icon.src, base).href)).ok()).toBe(
      true,
    );
  expect(errors).toEqual([]);
  await writeFile(
    'artifacts/responsive-checks.json',
    JSON.stringify(findings, null, 2),
  );
});

test('rapid HID readings are queued and repeated confirmation cannot create extra duplicates', async ({
  page,
}) => {
  await create(page);
  await hid(page, 'R01A1C03DP02');
  await page
    .getByRole('textbox', { name: 'Entrada do leitor' })
    .evaluate((input) => {
      for (const value of [
        'ITPFPHM510ESAI4',
        'ITPRCSEM03AI4',
        'ITARSRM003AI4',
      ]) {
        (input as HTMLInputElement).value = value;
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );
      }
    });
  await expect(page.locator('.session-heading p')).toContainText('3 registros');
  await page.setViewportSize({ width: 390, height: 844 });
  await hid(page, 'ITARSRM003AI4');
  const choice = page.getByRole('button', { name: 'Adicionar novamente' });
  await expect(choice).toBeVisible();
  const decision = await page.locator('.duplicate-warning').boundingBox();
  expect(decision!.y + decision!.height).toBeLessThan(844);
  await page.screenshot({
    path: '.impeccable/review/duplicate-mobile.png',
    fullPage: true,
  });
  await choice.evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('.session-heading p')).toContainText('4 registros');
  await page
    .getByRole('button', { name: 'Finalizar levantamento', exact: true })
    .click();
  await expect(
    page.getByText('Possíveis duplicados', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(page.locator('.status.completed')).toHaveText('Concluído');
});

test('a waiting PWA update requires a click and preserves the active session', async ({
  page,
}) => {
  await create(page, 'Atualização segura');
  await readyOffline(page);
  await hid(page, 'R01A1C03DP02');
  await hid(page, 'ITPFPHM510ESAI4');
  const workerPath = path.resolve('dist-test/sw.js');
  const original = await readFile(workerPath, 'utf8');
  try {
    await writeFile(workerPath, original + `\n// Test release ${Date.now()}\n`);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    await expect(
      page.getByText(
        'Nova versão disponível. Seus levantamentos serão preservados.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('.session-heading p')).toContainText(
      '1 registros',
    );
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Atualização segura', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.address-value')).toHaveText('R01A1C03DP02');
    await expect(page.locator('.session-heading p')).toContainText(
      '1 registros',
    );
  } finally {
    await writeFile(workerPath, original);
  }
});
