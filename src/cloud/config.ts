/**
 * Projeto Supabase da Identificação. A URL e a chave publicável são públicas
 * por natureza (vão no app); a segurança vem das regras RLS no banco.
 * Podem ser trocadas no build com VITE_SUPABASE_URL e VITE_SUPABASE_KEY.
 */
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL ??
  'https://pygedyytlcplfweibenv.supabase.co';
export const SUPABASE_KEY: string =
  import.meta.env.VITE_SUPABASE_KEY ??
  'sb_publishable_Wo0BJpc1B3O8Feog9to3yQ_PcBZfNcQ';
export const cloudConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;
export const BUCKET = 'identificacao';

export type Sector = 'almoxarifado' | 'estrutura';
export const sectors: Record<Sector, { label: string; email: string }> = {
  almoxarifado: {
    label: 'Almoxarifado',
    email:
      import.meta.env.VITE_EMAIL_ALMOXARIFADO ?? 'almoxarifado@scanlog.app',
  },
  estrutura: {
    label: 'Estrutura',
    email: import.meta.env.VITE_EMAIL_ESTRUTURA ?? 'estrutura@scanlog.app',
  },
};
/** Dias que a miniatura fica guardada depois da confirmação. */
export const THUMB_DAYS = 150;
