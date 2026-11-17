import { test, expect, type Page } from '@playwright/test';
import { SupabaseMock, people, sessionFor } from './supabase-mock';

const base = 'http://127.0.0.1:4173/teste-subpasta/';
test.use({ serviceWorkers: 'block' });

const lot = (id: string, name: string, dono: string, created_by: string) => {
  const now = new Date().toISOString();
  return {
    id,
    name,
    dono,
    created_by,
    status: 'rascunho',
    item_count: 0,
    coded_count: 0,
    confirmed_count: 0,
    created_at: now,
    updated_at: now,
    sent_at: null,
    coded_at: null,
    confirmed_at: null,
  };
};
/** Aparelho que já estava logado na conta compartilhada do almoxarifado. */
async function oldDevice(page: Page, name: string) {
  const session = sessionFor('almoxarifado');
  await page.addInitScript(
    ([s, n]) => {
      if (sessionStorage.getItem('semeado')) return;
      sessionStorage.setItem('semeado', '1');
      localStorage.setItem('scanlog-auth', s);
      localStorage.setItem('scanlog-operador', n);
    },
    [JSON.stringify(session), name],
  );
}

test('aparelho logado na conta do setor troca sozinho para a conta da pessoa', async ({
  page,
}) => {
  const cloud = new SupabaseMock();
  cloud.lots.push(
    lot(
      'a0000000-0000-4000-8000-000000000001',
      'Lote do Ilídio',
      people.ilidio.id,
      people.ilidio.nome,
    ),
    lot(
      'a0000000-0000-4000-8000-000000000002',
      'Lote do Caio',
      people.caio.id,
      'Caio',
    ),
  );
  await cloud.install(page);
  await oldDevice(page, 'Ilídio Nascimento Alves');
  await page.goto(base + '#/identificacao');

  // Sem digitar nada: entra como Ilídio e vê só o lote dele.
  await expect(page.getByText('Lote do Ilídio')).toBeVisible();
  await expect(page.getByText('Lote do Caio')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Almoxarifado/ })).toHaveCount(
    0,
  );
  expect(cloud.migrated).toEqual(['ilidio']);

  // Recarregar mantém a conta própria, sem trocar de novo.
  await page.reload();
  await expect(page.getByText('Lote do Ilídio')).toBeVisible();
  expect(cloud.migrated).toEqual(['ilidio']);
  await page
    .getByRole('button', { name: 'Configurações', exact: true })
    .click();
  await expect(page.getByText('Ilídio Nascimento Alves')).toBeVisible();
  await expect(page.getByText('você vê só os seus lotes')).toBeVisible();
});

test('nome sem cadastro: pede usuário e senha, e cada pessoa vê só os seus lotes', async ({
  page,
}) => {
  const cloud = new SupabaseMock();
  cloud.lots.push(
    lot(
      'a0000000-0000-4000-8000-000000000001',
      'Lote do Ilídio',
      people.ilidio.id,
      people.ilidio.nome,
    ),
  );
  await cloud.install(page);
  await oldDevice(page, 'Fulano');
  await page.goto(base + '#/identificacao');
  await expect(page.getByRole('alert')).toContainText('Peça ao administrador');
  await page
    .getByRole('button', { name: 'Entrar com usuário e senha' })
    .click();

  await page.getByRole('radio', { name: /Almoxarifado/ }).click();
  // A conta do setor não entra mais pela tela.
  await page.getByLabel('Usuário').fill('almoxarifado');
  await page.getByLabel('Sua senha').fill('senha-setor');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'não com a conta do setor',
  );

  await page.getByLabel('Usuário').fill('caio');
  await page.getByLabel('Sua senha').fill(people.caio.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Identificação', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Lote do Ilídio')).toHaveCount(0);
});
