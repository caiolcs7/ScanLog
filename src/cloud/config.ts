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

/** admin: conta do responsável, com os dois setores e permissão total. */
export type Sector = 'almoxarifado' | 'estrutura' | 'admin';
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
  admin: {
    label: 'Administrador',
    email: import.meta.env.VITE_EMAIL_ADMIN ?? 'admin@scanlog.app',
  },
};
/** Cadastra, envia, confere e exclui (almoxarifado ou administrador). */
export const canStock = (s: Sector) => s === 'almoxarifado' || s === 'admin';
/** Preenche o código (estrutura ou administrador). */
export const canCode = (s: Sector) => s === 'estrutura' || s === 'admin';
/** Dias que a miniatura fica guardada depois da confirmação. */
export const THUMB_DAYS = 150;
