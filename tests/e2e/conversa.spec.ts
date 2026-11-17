import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SupabaseMock, passwords, people } from './supabase-mock';

const base = 'http://127.0.0.1:4173/teste-subpasta/';
test.use({ serviceWorkers: 'block' });

/** Lote já enviado à estrutura, com dois itens fotografados. */
async function seed(cloud: SupabaseMock) {
  const now = new Date().toISOString();
  const lot = '11111111-1111-4111-8111-111111111111';
  const photo = await readFile(
    path.resolve('tests/fixtures/product-gs1-real.jpg'),
  );
  cloud.lots.push({
    id: lot,
    name: 'Peças R04',
    status: 'enviado',
    item_count: 2,
    coded_count: 0,
    confirmed_count: 0,
    pedidos_abertos: 0,
    novas_almox: 0,
    novas_estrutura: 0,
    created_at: now,
    created_by: 'Caio',
    dono: people.caio.id,
    sent_at: now,
    coded_at: null,
    confirmed_at: null,
    updated_at: now,
  });
  for (const ord of [1, 2]) {
    const id = `22222222-2222-4222-8222-00000000000${ord}`;
    const p = `originais/${lot}/${id}/a.jpg`;
    cloud.files.set(p, photo);
    cloud.items.push({
      id,
      lot_id: lot,
      ord,
      status: 'pendente',
      address: ord === 1 ? 'R04A1C02DP03' : null,
      bombona: ord === 1 ? 'R04G12' : null,
      weight_g: ord === 1 ? 84 : null,
      note: null,
      photos: [{ path: p, width: 800, height: 600 }],
      thumb_path: null,
      created_at: now,
      created_by: 'Caio',
      code: null,
      code_note: null,
      coded_at: null,
      coded_by: null,
      confirmed_at: null,
      confirmed_by: null,
      photos_deleted_at: null,
      thumb_expires_at: null,
      updated_at: now,
      msg_count: 0,
      pedidos_abertos: 0,
      ultima_msg: null,
      ultima_msg_em: null,
      ultima_msg_lado: null,
      lido_almox_em: null,
      lido_estrutura_em: null,
    });
  }
}

async function login(
  page: Page,
  sector: 'Almoxarifado' | 'Estrutura',
  name: string,
) {
  await page.getByRole('radio', { name: new RegExp(sector) }).click();
  if (sector === 'Almoxarifado') {
    await page.getByLabel('Usuário').fill(name.toLowerCase());
    await page.getByLabel('Sua senha').fill(passwords.almoxarifado);
  } else {
    await page.getByLabel('Seu nome').fill(name);
    await page.getByLabel('Senha do estrutura').fill(passwords.estrutura);
  }
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Identificação', exact: true }),
  ).toBeVisible();
}
async function logout(page: Page) {
  await page
    .getByRole('button', { name: 'Configurações', exact: true })
    .click();
  await page.getByRole('button', { name: 'Sair da Identificação' }).click();
  await page
    .getByRole('button', { name: 'Identificação', exact: true })
    .click();
  await expect(page.getByRole('radio', { name: /Almoxarifado/ })).toBeVisible();
}

test('conversa: estrutura pede medida e foto, almoxarifado responde, estrutura vê e codifica', async ({
  page,
}) => {
  const cloud = new SupabaseMock();
  await seed(cloud);
  await cloud.install(page);
  await page.goto(base);
  await page
    .getByRole('button', { name: 'Identificação', exact: true })
    .click();

  // Estrutura pede uma medida pelo cartão do item.
  await login(page, 'Estrutura', 'Ana');
  await page.getByRole('button', { name: 'Peças R04' }).click();
  await page.getByRole('button', { name: 'Pedir ajuda no item 01' }).click();
  const chat = page.getByRole('dialog', { name: /Item 01/ });
  await expect(chat).toContainText('R04A1C02DP03');
  await chat.getByRole('tab', { name: 'Medida' }).click();
  await chat.getByRole('button', { name: 'Diâmetro externo' }).click();
  await expect(chat.getByRole('textbox', { name: 'O que medir?' })).toHaveValue(
    'Diâmetro externo',
  );
  await chat.getByRole('button', { name: 'Pedir medida' }).click();
  await expect(chat.locator('.chat-request')).toContainText(
    'Aguardando o almoxarifado',
  );
  // E uma foto da etiqueta.
  await chat.getByRole('button', { name: 'Pedir foto' }).click();
  await chat
    .getByRole('textbox', { name: 'Foto de quê?' })
    .fill('Etiqueta do lado de trás');
  await chat.getByRole('button', { name: 'Pedir foto' }).last().click();
  await expect(chat.locator('.chat-request.is-open')).toHaveCount(2);
  expect(cloud.messages).toHaveLength(2);
  // Estrutura manda um desenho em PDF pelo clipe.
  await chat.getByRole('button', { name: 'Anexar foto ou arquivo' }).click();
  await chat.getByRole('menuitem', { name: 'Arquivo' }).isVisible();
  await chat.getByLabel('Escolher arquivo').setInputFiles({
    name: 'desenho-tecnico.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 teste'),
  });
  await expect(chat.locator('.chat-draft-file')).toContainText(
    'desenho-tecnico.pdf',
  );
  await chat
    .getByRole('textbox', { name: 'Mensagem' })
    .fill('Parece este desenho?');
  await chat.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(chat.locator('.chat-file')).toContainText('desenho-tecnico.pdf');
  expect(
    [...cloud.files.keys()].some(
      (k) => k.startsWith('conversa/') && k.endsWith('.pdf'),
    ),
  ).toBe(true);
  await chat.getByRole('button', { name: 'Fechar conversa' }).click();
  await expect(page.locator('.find-card').first()).toContainText(
    'Aguardando o almoxarifado',
  );

  // Almoxarifado vê o aviso no lote e responde os dois pedidos.
  await logout(page);
  await login(page, 'Almoxarifado', 'Caio');
  await expect(page.locator('.find-lot')).toContainText('1 pedido de ajuda');
  await page.getByRole('button', { name: 'Peças R04' }).click();
  await expect(page.locator('.help-banner')).toContainText(
    'precisa de ajuda em 1 item',
  );
  await page
    .locator('.help-banner')
    .getByRole('button', { name: 'Responder' })
    .click();
  const answer = page.getByRole('dialog', { name: /Item 01/ });
  await expect(answer.locator('.chat-panel.answer')).toContainText(
    'Diâmetro externo',
  );
  await answer.getByPlaceholder('0,0').fill('12,5');
  await answer.getByRole('radio', { name: 'mm' }).click();
  await answer.getByRole('button', { name: 'Enviar resposta' }).click();
  await expect(answer.locator('.chat-measure')).toHaveText('12,5 mm');
  // O próximo pedido aberto (foto) entra no lugar.
  await expect(answer.locator('.chat-panel.answer')).toContainText(
    'Etiqueta do lado de trás',
  );
  await answer
    .getByLabel('Escolher foto')
    .setInputFiles(path.resolve('tests/fixtures/address.png'));
  await expect(answer.locator('.chat-draft-photo img')).toBeVisible();
  await answer.getByRole('textbox', { name: 'Resposta' }).fill('Tem só o lote');
  await answer.getByRole('button', { name: 'Enviar resposta' }).click();
  await expect(answer.locator('.chat-photo img')).toBeVisible();
  await expect(answer.locator('.chat-request.is-open')).toHaveCount(0);
  expect([...cloud.files.keys()].some((k) => k.startsWith('conversa/'))).toBe(
    true,
  );
  // Almoxarifado baixa o PDF da estrutura.
  const download = page.waitForEvent('download');
  await answer
    .getByRole('button', { name: 'Baixar desenho-tecnico.pdf' })
    .click();
  expect((await download).suggestedFilename()).toBe('desenho-tecnico.pdf');
  await answer.getByRole('button', { name: 'Fechar conversa' }).click();
  await expect(page.locator('.help-banner')).toBeHidden();

  // Estrutura vê a resposta nova e codifica com a medida à vista.
  await logout(page);
  await login(page, 'Estrutura', 'Ana');
  await expect(page.locator('.find-lot')).toContainText('1 resposta nova');
  await page.getByRole('button', { name: 'Peças R04' }).click();
  await expect(page.locator('.help-banner')).toContainText('Chegou resposta');
  await page.getByRole('button', { name: 'Preencher códigos' }).click();
  const entry = page.getByRole('dialog', { name: /Item 01 ·/ });
  await expect(entry.locator('.chat-strip')).toContainText(
    'Almoxarifado respondeu',
  );
  await entry.locator('.chat-strip').click();
  const seen = page.getByRole('dialog', { name: /^Item 01$/ });
  await expect(seen.locator('.chat-measure')).toHaveText('12,5 mm');
  await seen.getByRole('button', { name: 'Fechar conversa' }).click();
  await entry.locator('.code-input').fill('000123');
  await entry.locator('.code-input').press('Enter');
  await expect.poll(() => cloud.items[0].status).toBe('codificado');
  // Item 02: nenhum pedido; abre direto do preenchimento.
  const second = page.getByRole('dialog', { name: /Item 02 ·/ });
  await second.getByRole('button', { name: /Falta informação/ }).click();
  const chat2 = page.getByRole('dialog', { name: /^Item 02$/ });
  await chat2.getByRole('tab', { name: 'Pergunta' }).click();
  await chat2.getByRole('button', { name: 'Qual o material?' }).click();
  await chat2.getByRole('button', { name: 'Perguntar' }).last().click();
  await expect(chat2.locator('.chat-request.is-open')).toHaveCount(1);
  await chat2.getByRole('button', { name: 'Fechar conversa' }).click();
  await second.getByRole('button', { name: 'Sem código' }).click();
  await second.getByLabel('Por que está sem código?').fill('não cadastrado');
  await second.getByRole('button', { name: 'Salvar sem código' }).click();
  // Item codificado: o pedido deixa de ser necessário.
  await expect.poll(() => cloud.messages.at(-1)?.situacao).toBe('dispensado');
  await expect(page.locator('.help-banner')).toBeHidden();
});
