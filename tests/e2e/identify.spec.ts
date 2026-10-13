import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { SupabaseMock, passwords } from './supabase-mock';

const base = 'http://127.0.0.1:4173/teste-subpasta/';
// O Supabase é simulado no navegador; o service worker ficaria no caminho.
test.use({ serviceWorkers: 'block' });

test('identificação na nuvem: almoxarifado cadastra, estrutura codifica, almoxarifado confirma e exporta', async ({
  page,
}) => {
  const photo = (name: string) => path.resolve(`tests/fixtures/${name}`);
  const cloud = new SupabaseMock();
  await cloud.install(page);
  await page.goto(base);
  await page
    .getByRole('button', { name: 'Identificação', exact: true })
    .click();
  const login = async (sector: 'Almoxarifado' | 'Estrutura', name: string) => {
    await page.getByRole('radio', { name: new RegExp(sector) }).click();
    await page.getByLabel('Seu nome').fill(name);
    await page
      .getByLabel(`Senha do ${sector.toLowerCase()}`)
      .fill(
        sector === 'Almoxarifado'
          ? passwords.almoxarifado
          : passwords.estrutura,
      );
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(
      page.getByRole('heading', { name: 'Identificação', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Seu nome')).toBeHidden();
  };
  const logout = async () => {
    await page
      .getByRole('button', { name: 'Configurações', exact: true })
      .click();
    await page.getByRole('button', { name: 'Sair da Identificação' }).click();
    await page
      .getByRole('button', { name: 'Identificação', exact: true })
      .click();
    await expect(
      page.getByRole('radio', { name: /Almoxarifado/ }),
    ).toBeVisible();
  };

  // Senha errada não entra.
  await page.getByRole('radio', { name: /Almoxarifado/ }).click();
  await page.getByLabel('Seu nome').fill('Caio');
  await page.getByLabel('Senha do almoxarifado').fill('errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('Senha incorreta');
  await login('Almoxarifado', 'Caio');

  await page
    .getByRole('button', { name: 'Nova identificação', exact: true })
    .first()
    .click();
  await page.getByLabel('Nome do lote').fill('Sem código R01');
  await page.getByRole('button', { name: 'Criar lote' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sem código R01', exact: true }),
  ).toBeVisible();

  // Item 1: duas fotos, endereço lido pelo scanner, bombona e peso.
  await page.getByRole('button', { name: 'Adicionar produto' }).first().click();
  const form = page.getByRole('dialog', { name: 'Produto sem código' });
  await expect(
    form.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeDisabled();
  await form
    .locator('input[type=file][multiple]')
    .setInputFiles([photo('blank.png'), photo('product-gs1-real.jpg')]);
  await expect(form.locator('.photo-slot.filled')).toHaveCount(2);
  await form.getByRole('radio', { name: 'Com endereço' }).click();
  await form.getByRole('button', { name: 'Ler', exact: true }).click();
  const reader = page.getByRole('dialog', { name: 'Ler endereço' });
  await reader
    .getByLabel('Selecionar imagem da etiqueta')
    .setInputFiles(photo('address.png'));
  await expect(reader).toBeHidden();
  await expect(form.getByRole('textbox', { name: 'Endereço' })).toHaveValue(
    'R01A1C03DP02',
  );
  await form.getByPlaceholder('R15G03').fill('r01g05');
  await form.getByPlaceholder('0,00').fill('12,5');
  await expect(form).toContainText('0,0125 kg');
  await form.getByRole('button', { name: 'Salvar e próximo' }).click();
  await expect(form.locator('.photo-slot.filled')).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: 'Endereço' })).toHaveValue(
    'R01A1C03DP02',
  );
  await expect(form.getByPlaceholder('R15G03')).toHaveValue('R01G05');

  // Item 2: quatro fotos é o limite.
  await form
    .locator('input[type=file][multiple]')
    .setInputFiles([
      photo('blank.png'),
      photo('address.png'),
      photo('address2.png'),
      photo('bombona.png'),
      photo('code128.png'),
    ]);
  await expect(form.locator('.photo-slot.filled')).toHaveCount(4);
  await expect(form.locator('.photo-slot.add')).toHaveCount(0);
  await form.getByRole('radio', { name: 'Sem endereço' }).click();
  await form.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.locator('.find-card')).toHaveCount(2);
  await expect(page.locator('.outbox-banner')).toBeHidden();
  await expect(page.locator('.find-card').first()).toContainText(
    'Cadastrado em',
  );
  await expect(page.locator('.find-card').first()).toContainText('por Caio');
  expect(cloud.items).toHaveLength(2);
  expect(cloud.items.map((i) => (i.photos as unknown[]).length)).toEqual([
    2, 4,
  ]);
  expect(
    [...cloud.files.keys()].filter((k) => k.startsWith('miniaturas/')),
  ).toHaveLength(2);
  for (const [key, file] of cloud.files)
    if (key.startsWith('miniaturas/'))
      expect(file.length).toBeLessThanOrEqual(20 * 1024);

  // Edição sobe para a nuvem e apaga a foto removida.
  await page.getByRole('button', { name: 'Editar item 02' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar item 02' });
  await edit.getByRole('button', { name: 'Remover foto 4' }).click();
  await edit.getByPlaceholder('Ex.: conector azul, 3 vias').fill('tampa azul');
  await edit.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('.find-card').nth(1)).toContainText('tampa azul');
  await expect.poll(() => (cloud.items[1].photos as unknown[]).length).toBe(3);
  await expect.poll(() => cloud.removed.length).toBe(1);

  await page.getByRole('button', { name: 'Enviar para a Estrutura' }).click();
  await expect(page.locator('.lot-meta')).toContainText('Na estrutura');

  // Estrutura preenche os códigos item por item.
  await logout();
  await login('Estrutura', 'Ana');
  await page.getByRole('button', { name: 'Sem código R01' }).click();
  await page.getByRole('button', { name: 'Preencher códigos' }).click();
  const entry = page.getByRole('dialog', { name: /Item 01/ });
  await expect(entry.locator('.code-photos img')).toHaveCount(2);
  const code = entry.locator('.code-input');
  await code.fill('r01a1c03dp02');
  await code.press('Enter');
  await expect(entry.getByRole('alert')).toContainText('endereço');
  await code.fill('000123');
  await code.press('Enter');
  const second = page.getByRole('dialog', { name: /Item 02/ });
  await second.getByRole('button', { name: 'Sem código' }).click();
  await second
    .getByLabel('Por que está sem código?')
    .fill('material não cadastrado');
  await second.getByRole('button', { name: 'Salvar sem código' }).click();
  await expect(second).toBeHidden();
  await expect(page.locator('.lot-meta')).toContainText('Para conferir');
  expect(cloud.items[0]).toMatchObject({
    code: '000123',
    status: 'codificado',
    coded_by: 'Ana',
  });

  // Almoxarifado confere e confirma: originais saem, fica a miniatura.
  await logout();
  await login('Almoxarifado', 'Caio');
  await page.getByRole('button', { name: 'Sem código R01' }).click();
  await expect(page.locator('.find-card').first()).toContainText(
    'CODIGO : 000123',
  );
  await page.getByRole('button', { name: 'Confirmar 2' }).click();
  await expect(page.locator('.lot-meta')).toContainText('Concluído');
  await expect(page.locator('.find-card').first()).toContainText(
    'Foto reduzida, será apagada em',
  );
  expect(cloud.items.every((i) => (i.photos as unknown[]).length === 0)).toBe(
    true,
  );
  expect(
    [...cloud.files.keys()].every((k) => k.startsWith('miniaturas/')),
  ).toBe(true);

  // Planilha igual à do levantamento, com o código novo.
  await page.getByRole('button', { name: 'Exportar lote' }).click();
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Planilha Excel/ }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await (await download).path())!);
  const sheet = workbook.getWorksheet('Identificação')!;
  expect(sheet.getCell('A5').value).toBe('Código do Produto');
  expect(sheet.getCell('A6').value).toBe('000123');
  expect(sheet.getCell('B6').value).toBe('R01A1C03DP02');
  expect(sheet.getCell('C6').value).toBe('R01G05');
  expect(sheet.getCell('D6').value).toBe(0.0125);
  expect(sheet.getCell('G7').value).toBe('Confirmado');
  expect(sheet.getCell('A7').value).toBe('');
  expect(sheet.getCell('J7').value).toContain('material não cadastrado');

  // Word continua como alternativa, com o código já preenchido.
  await page.getByRole('button', { name: 'Exportar lote' }).click();
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Documento Word/ }).click();
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(
    await readFile((await (await download).path())!),
  );
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('000123');
  expect(xml.match(/CODIGO : /g)).toHaveLength(2);
});
test('identificação: foto pela câmera do app, sem passar pela galeria', async () => {
  const context = await chromium.launchPersistentContext(
    await mkdtemp(path.join(tmpdir(), 'almox-foto-')),
    {
      headless: true,
      serviceWorkers: 'block',
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${path.resolve('tests/fixtures/product.y4m')}`,
      ],
    },
  );
  const page = await context.newPage();
  const cloud = new SupabaseMock();
  await cloud.install(page);
  await page.goto(base + '#/identificacao');
  await page.getByRole('radio', { name: /Almoxarifado/ }).click();
  await page.getByLabel('Seu nome').fill('Caio');
  await page.getByLabel('Senha do almoxarifado').fill(passwords.almoxarifado);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page
    .getByRole('button', { name: 'Nova identificação', exact: true })
    .first()
    .click();
  await page.getByRole('button', { name: 'Criar lote' }).click();
  await page.getByRole('button', { name: 'Adicionar produto' }).first().click();
  const form = page.getByRole('dialog', { name: 'Produto sem código' });
  // O input com capture (app de câmera do sistema) não é usado.
  let systemCamera = false;
  page.on('filechooser', () => (systemCamera = true));
  await form.getByRole('button', { name: 'Tirar foto' }).click();
  const camera = page.getByRole('dialog', { name: 'Tirar foto' });
  await camera.getByRole('button', { name: 'Tirar foto' }).click();
  await expect(form.locator('.photo-slot.filled')).toHaveCount(1);
  await camera.getByRole('button', { name: 'Concluir' }).click();
  await expect(camera).toBeHidden();
  // A câmera é liberada ao fechar.
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('video')].some(
          (v) => (v.srcObject as MediaStream | null)?.active,
        ),
      ),
    )
    .toBe(false);
  expect(systemCamera).toBe(false);
  await form.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.find-card')).toHaveCount(1);
  await expect.poll(() => cloud.items.length).toBe(1);
  await context.close();
});
