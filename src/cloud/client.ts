import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

let client: Promise<SupabaseClient> | null = null;
/** Carregado sob demanda: Levantamentos não baixam nem abrem conexão. */
export function supabase() {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'scanlog-auth',
      },
    }),
  );
  return client;
}
/** Converte o erro do Supabase em mensagem para o operador. */
export function cloudError(error: unknown): Error {
  if (!navigator.onLine)
    return new Error('Sem conexão. Tente de novo quando houver sinal.');
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  if (/Invalid login credentials/i.test(message))
    return new Error('Senha incorreta.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(message))
    return new Error('Servidor fora do ar ou sem conexão. Tente de novo.');
  if (/JWT|session/i.test(message))
    return new Error('Sua sessão expirou. Entre de novo.');
  return new Error(message || 'Não foi possível falar com o servidor.');
}
export async function must<T>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw cloudError(error);
  return data as T;
}
