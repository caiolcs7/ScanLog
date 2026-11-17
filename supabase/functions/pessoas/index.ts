// Contas das pessoas do almoxarifado. Deploy com verify_jwt = false (o
// navegador faz pré-checagem CORS sem token); o token é conferido aqui.
//   { tipo: 'migrar', nome }  → conta compartilhada do almoxarifado: troca o
//       aparelho para a conta da pessoa com esse nome, sem senha. Só sessões
//       abertas antes da migração 0013 (regras em pessoas_para_migrar).
//       Devolve { token_hash } para supabase.auth.verifyOtp({ type: 'email' }).
//   { tipo: 'salvar', id?, nome, login, senha?, ativo? } → só o administrador:
//       cadastra ou edita a pessoa, a senha e se ela pode entrar.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const DOMINIO = 'scanlog.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGIN = /^[a-z0-9][a-z0-9._-]{1,29}$/;
const RESERVADOS = ['almoxarifado', 'estrutura', 'admin'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Pessoa = { id: string; nome: string; login: string; user_id: string | null; ativo: boolean };
class Erro extends Error {
  constructor(msg: string, readonly status = 400) {
    super(msg);
  }
}

/** Usuário do token, conferido no servidor de autenticação. */
async function quem(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Erro('Entre de novo.', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Erro('Entre de novo.', 401);
  let sessao = '';
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    sessao = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))).session_id ?? '';
  } catch {
    /* sem sessão */
  }
  return { user: data.user, sessao };
}

const metadados = (p: Pessoa) => ({ role: 'almoxarifado', nome: p.nome });

/** Conta do Auth da pessoa; cria na primeira vez. */
async function garantirConta(p: Pessoa, senha?: string): Promise<string> {
  if (p.user_id) return p.user_id;
  const email = `${p.login}@${DOMINIO}`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: senha ?? crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    app_metadata: metadados(p),
  });
  let id = data.user?.id ?? null;
  if (error || !id) {
    // Já existe (dois aparelhos ao mesmo tempo ou cadastro anterior).
    const { data: existente } = await db.rpc('pessoas_conta_por_email', { p_email: email });
    if (!existente) throw error ?? new Error('conta não criada');
    id = existente as string;
    const { error: e2 } = await db.auth.admin.updateUserById(id, {
      app_metadata: metadados(p),
      ...(senha ? { password: senha } : {}),
    });
    if (e2) throw e2;
  }
  await db.from('pessoas').update({ user_id: id }).eq('id', p.id).is('user_id', null);
  const { data: atual } = await db.from('pessoas').select('user_id').eq('id', p.id).single();
  return (atual?.user_id as string) ?? id;
}

async function migrar(req: Request, corpo: { nome?: unknown }) {
  const { user, sessao } = await quem(req);
  if (user.email?.toLowerCase() !== `almoxarifado@${DOMINIO}`) throw new Erro('Esta conta já é individual.');
  if (!UUID.test(sessao)) throw new Erro('Entre de novo.', 401);
  const nome = typeof corpo.nome === 'string' ? corpo.nome.slice(0, 60) : '';
  const { data, error } = await db.rpc('pessoas_para_migrar', {
    p_user: user.id,
    p_session: sessao,
    p_nome: nome,
  });
  if (error) {
    const codigo = ['sem_pessoa', 'sessao_nova', 'sessao_usada', 'migracao_encerrada'].find((c) =>
      error.message.includes(c)
    );
    if (codigo) return json({ erro: codigo }, 409);
    throw error;
  }
  const p = { ...(data as Pessoa[])[0], ativo: true };
  const userId = await garantirConta(p);
  const { data: link, error: e2 } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: `${p.login}@${DOMINIO}`,
  });
  if (e2 || !link.properties?.hashed_token) throw e2 ?? new Error('sem link');
  return json({ token_hash: link.properties.hashed_token, nome: p.nome, login: p.login, user_id: userId });
}

async function salvar(req: Request, corpo: Record<string, unknown>) {
  const { user } = await quem(req);
  if (user.app_metadata?.role !== 'admin') throw new Erro('Só o administrador cadastra pessoas.', 403);
  const nome = String(corpo.nome ?? '').trim().replace(/\s+/g, ' ');
  const login = String(corpo.login ?? '').trim().toLowerCase();
  const senha = typeof corpo.senha === 'string' && corpo.senha ? corpo.senha : undefined;
  const ativo = corpo.ativo !== false;
  const id = typeof corpo.id === 'string' && UUID.test(corpo.id) ? corpo.id : null;
  if (nome.length < 2 || nome.length > 60) throw new Erro('Informe o nome (2 a 60 letras).');
  if (!LOGIN.test(login) || RESERVADOS.includes(login))
    throw new Erro('Usuário: 2 a 30 letras minúsculas ou números, sem espaço nem acento.');
  if (senha && (senha.length < 6 || senha.length > 72)) throw new Erro('A senha precisa de 6 a 72 caracteres.');
  if (!id && !senha) throw new Erro('Defina uma senha para a pessoa nova.');

  let antes: Pessoa | null = null;
  if (id) {
    const { data } = await db.from('pessoas').select('*').eq('id', id).maybeSingle();
    if (!data) throw new Erro('Pessoa não encontrada.', 404);
    antes = data as Pessoa;
  }
  const valores = { nome, login, ativo, atualizado_em: new Date().toISOString() };
  const { data: salva, error } = id
    ? await db.from('pessoas').update(valores).eq('id', id).select('*').single()
    : await db.from('pessoas').insert(valores).select('*').single();
  if (error) {
    if (error.code === '23505')
      throw new Erro(error.message.includes('login') ? 'Este usuário já existe.' : 'Já existe uma pessoa com este nome.');
    throw error;
  }
  const p = salva as Pessoa;
  const userId = await garantirConta(p, senha);
  // Usuário, nome no app, senha e bloqueio (desativada não entra mais).
  const { error: e2 } = await db.auth.admin.updateUserById(userId, {
    ...(antes && antes.login !== p.login ? { email: `${p.login}@${DOMINIO}`, email_confirm: true } : {}),
    app_metadata: metadados(p),
    ban_duration: ativo ? 'none' : '876000h',
    ...(senha ? { password: senha } : {}),
  });
  if (e2) throw e2;
  return json({ pessoa: { ...p, user_id: userId } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);
  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'JSON inválido' }, 400);
  }
  try {
    if (corpo.tipo === 'migrar') return await migrar(req, corpo);
    if (corpo.tipo === 'salvar') return await salvar(req, corpo);
    return json({ erro: 'tipo inválido' }, 400);
  } catch (e) {
    if (e instanceof Erro) return json({ erro: e.message }, e.status);
    console.error(e);
    return json({ erro: 'Falha no servidor. Tente de novo.' }, 500);
  }
});
