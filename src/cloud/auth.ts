import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cloudError, supabase } from './client';
import { sectors, type Sector } from './config';

const NAME_KEY = 'scanlog-operador';
export type CloudAuth =
  | { status: 'loading' }
  | { status: 'out' }
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
function apply(session: Session | null) {
  const sector = sectorOf(session);
  set(
    session && sector
      ? {
          status: 'in',
          sector,
          name: readName() || sectors[sector].label,
          userId: session.user.id,
        }
      : { status: 'out' },
  );
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
export async function signIn(sector: Sector, password: string, name: string) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 60)
    throw new Error('Informe seu nome.');
  const client = await supabase();
  let { data, error } = await client.auth.signInWithPassword({
    email: sectors[sector].email,
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
  if (error) throw cloudError(error);
  const got = sectorOf(data.session);
  if (got !== sector && got !== 'admin') {
    await client.auth.signOut();
    throw new Error('Esta conta não tem o setor configurado no Supabase.');
  }
  try {
    localStorage.setItem(NAME_KEY, clean);
  } catch {
    /* nome fica só nesta sessão */
  }
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
