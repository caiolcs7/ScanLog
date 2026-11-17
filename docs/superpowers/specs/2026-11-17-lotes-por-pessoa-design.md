# Identificação: lotes por pessoa (2026-11-17)

## Por quê
Todo o almoxarifado entra na mesma conta (`almoxarifado@scanlog.app`) e vê
todos os lotes, o que vira confusão. caio quer que cada pessoa (ex.: Ilídio)
veja só os lotes que ela criou, que só o login dele (admin) veja todos, e que
nada se perca. Quem já está logado não deve precisar entrar de novo.

## Decisões do caio
- Login próprio por pessoa (usuário + senha), segurança no banco (RLS).
- Quem já está logado troca sozinho para o login próprio, sem digitar nada.
- Depois da troca, caio muda a senha antiga do almoxarifado.
- A Estrutura continua como hoje (conta do setor, vê todos os lotes enviados).

## Abordagens
1. **Conta do Supabase por pessoa + troca automática (escolhida).** Cada pessoa
   tem usuário no Supabase Auth; o banco sabe o dono de cada lote. O celular
   ainda na conta compartilhada chama a função `pessoas`, que devolve um token
   de entrada da pessoa (pelo nome já salvo no aparelho).
2. Só filtrar pelo nome digitado: rápido, mas qualquer um troca o nome e vê os
   lotes do outro. Recusada pelo caio.
3. Sessão anônima + senha própria em tabela: tudo em SQL, mas exige ligar
   login anônimo no projeto (abre contas anônimas para todo o Supabase).

## Desenho
- Tabela `pessoas` (nome, login, papel `almoxarifado`, user_id, ativo).
  Semeada com os nomes que já criaram lotes (Leandro, Ilídio, Paulo).
- `lots.dono` → `pessoas.id`; lotes antigos ganham dono pelo `created_by`.
- `minha_pessoa()` = pessoa ativa da conta logada. RLS: almoxarifado só lê e
  mexe nos lotes/itens/mensagens/fotos dos lotes dele; admin vê tudo; estrutura
  igual a hoje. Conta compartilhada do almoxarifado (sem pessoa) não vê nada.
- Gatilho do lote grava `dono` e `created_by` da pessoa no cadastro; só o admin
  muda o dono.
- Função Edge `pessoas`:
  - `migrar`: só a conta compartilhada, só sessão criada antes da migração,
    uma vez por sessão, até 45 dias. Acha a pessoa pelo nome do aparelho,
    cria a conta dela se faltar e devolve `token_hash` (magic link, sem e-mail).
  - `salvar` (admin): cria/edita pessoa, usuário, senha, ativa/desativa.
- Login do almoxarifado: Usuário + Senha (`<usuario>@scanlog.app`). Senha do
  admin continua entrando como admin em qualquer setor.
- Avisos (push) do almoxarifado só para o dono do lote; admin recebe tudo.
- Configurações (admin): seção "Pessoas do almoxarifado" para cadastrar e
  trocar senha. Lista do admin mostra filtro por pessoa.

## Fora do escopo
- Contas individuais na Estrutura.
