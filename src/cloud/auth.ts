import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cloudError, supabase } from './client';
import { SUPABASE_KEY, SUPABASE_URL, sectors, type Sector } from './config';

const NAME_KEY = 'scanlog-operador';
export type CloudAuth =
  | { status: 'loading' }
  | { status: 'out' }
  /** Aparelho na conta compartilhada do almoxarifado passando para a conta da pessoa. */
  | { status: 'migrating'; error?: string; retry?: boolean }
  | { status: 'in'; sector: Sector; name: string; userId: string };

let state: CloudAuth = { status: 'loading' },
  started = false;
const listeners = new Set<() => void>();
function set(next: CloudAuth) {
  state = next;
  listeners.forEach((l) => l());
}
function readName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function sectorOf(session: Session | null): Sector | null {
  const role = session?.user.app_metadata?.role;
  return role === 'almoxarifado' || role === 'estrutura' || role === 'admin'
    ? role
    : null;
}
function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* nome fica só nesta sessão */
  }
}
/** Conta compartilhada do almoxarifado: só serve para trocar de conta. */
export const isSharedStock = (session: Session | null) =>
  sectorOf(session) === 'almoxarifado' &&
  session?.user.email?.toLowerCase() === sectors.almoxarifado.email;
function apply(session: Session | null) {
  const sector = sectorOf(session);
  if (session && isSharedStock(session)) {
    // Entrar pela tela com a conta do setor é recusado em signIn.
    if (!signingIn) void migrate();
    return;
  }
  // Conta da pessoa: o nome vem do cadastro, não do aparelho.
  const own = session?.user.app_metadata?.nome;
  if (typeof own === 'string' && own) saveName(own);
  set(
    session && sector
      ? {
          status: 'in',
          sector,
          name:
            (typeof own === 'string' && own) ||
            readName() ||
            sectors[sector].label,
          userId: session.user.id,
        }
      : { status: 'out' },
  );
}

const migrateErrors: Record<string, string> = {
  sem_pessoa:
    'Agora cada pessoa do almoxarifado tem o próprio acesso. Peça ao administrador o seu usuário e senha.',
  sessao_nova: 'Entre com o seu usuário e senha.',
  sessao_usada: 'Entre com o seu usuário e senha.',
  migracao_encerrada: 'Entre com o seu usuário e senha.',
};
let migrating = false,
  signingIn = false;
/**
 * Troca o aparelho da conta compartilhada para a conta da pessoa, pelo nome
 * já salvo nele, sem pedir senha (função "pessoas" no Supabase).
 */
export async function migrate() {
  if (migrating) return;
  migrating = true;
  set({ status: 'migrating' });
  try {
    const client = await supabase();
    const session = (await client.auth.getSession()).data.session;
    if (!session || !isSharedStock(session)) return;
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/pessoas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tipo: 'migrar', nome: readName() }),
      });
    } catch {
      set({
        status: 'migrating',
        error: 'Sem conexão para atualizar o seu acesso. Tente de novo.',
        retry: true,
      });
      return;
    }
    const body = (await res.json().catch(() => ({}))) as {
      token_hash?: string;
      erro?: string;
    };
    if (!res.ok || !body.token_hash) {
      const known = body.erro ? migrateErrors[body.erro] : undefined;
      set({
        status: 'migrating',
        error:
          known ?? 'Não foi possível atualizar o seu acesso. Tente de novo.',
        retry: !known,
      });
      return;
    }
    const { error } = await client.auth.verifyOtp({
      token_hash: body.token_hash,
      type: 'email',
    });
    if (error)
      set({
        status: 'migrating',
        error: 'Não foi possível atualizar o seu acesso. Tente de novo.',
        retry: true,
      });
    // Deu certo: onAuthStateChange aplica a conta nova.
  } finally {
    migrating = false;
  }
}
/** Liga a sessão salva no aparelho, só quando a Identificação é aberta. */
export function startAuth() {
  if (started) return;
  started = true;
  void supabase()
    .then(async (client) => {
      client.auth.onAuthStateChange((_event, session) => apply(session));
      apply((await client.auth.getSession()).data.session);
    })
    .catch(() => set({ status: 'out' }));
}
export function useCloudAuth() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      startAuth();
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
/** Usuário digitado → e-mail da conta da pessoa (ilidio → ilidio@scanlog.app). */
export function personEmail(user: string) {
  const login = user.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(login))
    throw new Error('Usuário inválido. Use só letras minúsculas e números.');
  return `${login}@${sectors.almoxarifado.email.split('@')[1]}`;
}
/**
 * Almoxarifado entra com o próprio usuário; estrutura com a senha do setor e o
 * nome. A senha do administrador entra como admin em qualquer um.
 */
export async function signIn(sector: Sector, password: string, name: string) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 60)
    throw new Error(
      sector === 'almoxarifado' ? 'Informe seu usuário.' : 'Informe seu nome.',
    );
  const own = sector === 'almoxarifado';
  signingIn = true;
  try {
    await enter(sector, password, clean, own);
  } finally {
    signingIn = false;
  }
}
async function enter(
  sector: Sector,
  password: string,
  clean: string,
  own: boolean,
) {
  const client = await supabase();
  let email = sectors[sector].email;
  if (own)
    try {
      email = personEmail(clean);
    } catch {
      email = sectors.admin.email; // só a senha do administrador entra
    }
  let { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  // Senha do administrador digitada em qualquer setor: entra como admin.
  if (error && /Invalid login credentials/i.test(error.message)) {
    const admin = await client.auth.signInWithPassword({
      email: sectors.admin.email,
      password,
    });
    if (!admin.error) ({ data, error } = admin);
  }
  if (error && own && /Invalid login credentials/i.test(error.message))
    throw new Error('Usuário ou senha incorretos.');
  if (error && /banned/i.test(error.message))
    throw new Error('Este acesso foi desativado. Fale com o administrador.');
  if (error) throw cloudError(error);
  const got = sectorOf(data.session);
  if ((got !== sector && got !== 'admin') || isSharedStock(data.session)) {
    await client.auth.signOut();
    throw new Error(
      isSharedStock(data.session)
        ? 'Entre com o seu usuário, não com a conta do setor.'
        : 'Esta conta não tem o setor configurado no Supabase.',
    );
  }
  if (!own || got === 'admin') saveName(clean);
  apply(data.session);
}
export async function signOut() {
  // Aparelho que sai do setor para de receber os avisos dele.
  await import('./push').then((m) => m.forgetPush()).catch(() => {});
  await (await supabase()).auth.signOut();
  set({ status: 'out' });
}
/** Nome de quem está usando o aparelho, gravado em cada ação. */
export function operatorName() {
  return state.status === 'in' ? state.name : readName() || 'Sem nome';
}
