import { must, supabase } from './client';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/** Pessoa do almoxarifado com acesso próprio (só o administrador lista). */
export type Pessoa = {
  id: string;
  nome: string;
  login: string;
  ativo: boolean;
  user_id: string | null;
};

const RESERVED = ['almoxarifado', 'estrutura', 'admin'];

/** Usuário sugerido pelo primeiro nome: "Ilídio Alves" → "ilidio". */
export function suggestLogin(nome: string, taken: string[] = []) {
  const base =
    nome
      .trim()
      .split(/\s+/)[0]
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 28) || 'pessoa';
  const used = new Set([...RESERVED, ...taken]);
  if (!used.has(base) && base.length >= 2) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

export async function listPessoas() {
  const client = await supabase();
  return must<Pessoa[]>(
    client
      .from('pessoas')
      .select('id, nome, login, ativo, user_id')
      .order('nome'),
  );
}

/** Cadastra ou edita (nome, usuário, senha nova, ativo) pela função "pessoas". */
export async function savePessoa(input: {
  id?: string;
  nome: string;
  login: string;
  senha?: string;
  ativo: boolean;
}) {
  const client = await supabase();
  const token = (await client.auth.getSession()).data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/pessoas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token ?? ''}`,
      },
      body: JSON.stringify({ tipo: 'salvar', ...input }),
    });
  } catch {
    throw new Error('Sem conexão. Tente de novo.');
  }
  const body = (await res.json().catch(() => ({}))) as {
    pessoa?: Pessoa;
    erro?: string;
  };
  if (!res.ok || !body.pessoa)
    throw new Error(body.erro ?? 'Não foi possível salvar. Tente de novo.');
  return body.pessoa;
}

/** Quantos lotes cada pessoa tem (administrador vê todos). */
export async function countLotsByPessoa() {
  const client = await supabase();
  const rows = await must<{ dono: string | null }[]>(
    client.from('lots').select('dono').limit(5000),
  );
  const counts = new Map<string, number>();
  for (const r of rows)
    if (r.dono) counts.set(r.dono, (counts.get(r.dono) ?? 0) + 1);
  return counts;
}
