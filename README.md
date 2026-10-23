<p align="center"><img src="docs/marca/scanlog-logo.png" alt="ScanLog" width="420" /></p>

# ScanLog

PWA para ler etiquetas Data Matrix, associar produtos a endereços e exportar relatórios Excel. Os levantamentos ficam só no aparelho de cada pessoa. A aba Identificação (produtos sem código) é compartilhada entre almoxarifado e estrutura pelo Supabase.

**Aplicativo publicado:** [Abrir ScanLog](https://caiolcs7.github.io/ScanLog/).

## Instalar e executar

Requer Node.js 22.12 ou superior (Node 24 recomendado).

```sh
npm install
npm run dev
```

Abra o endereço informado pelo Vite. Câmera exige HTTPS ou `localhost`. O endereço HTTP da rede local não habilita câmera no celular; use o site publicado com HTTPS para isso.

## Testar

```sh
npm run test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes de ponta a ponta constroem `dist-test` e usam a porta 4173 e `/teste-subpasta/`, sem alterar o build de publicação em `dist`. Eles verificam Data Matrix por imagem, câmera sintética, HID, reinício real do navegador, offline, XLSX, backup e responsividade. As imagens de teste estão em `tests/fixtures`; podem ser regeneradas com `npm run test:fixtures`.

Para testar a PWA manualmente:

```sh
npm run build
npm run preview
```

Espere “Pronto para uso offline”, corte a conexão e recarregue. O modo de desenvolvimento não instala o service worker.

## Publicar no GitHub Pages

1. Envie este projeto para um repositório GitHub com branch `main`.
2. Em **Settings → Pages → Build and deployment**, escolha **GitHub Actions**.
3. Faça push para `main` ou execute o workflow **Testar e publicar no GitHub Pages**.

O workflow executa lint, testes, build e testes de navegador antes de publicar. O caminho do repositório é configurado automaticamente. Rotas usam hash, então recarregar uma sessão não exige configuração de redirecionamento.

O build padrão usa caminhos relativos. Para um caminho explícito no PowerShell:

```powershell
$env:BASE_PATH = '/nome-do-repositorio/'
npm run build
```

Para testar esse build com Vite Preview, passe o mesmo `--base`:

```sh
npm run preview -- --base=/nome-do-repositorio/
```

## Operação

Crie um levantamento e inicie a câmera. Em **Captura pela câmera**, o padrão é **Por botão**: enquadre a etiqueta inteira na mira e toque em **Ler código**. Cada toque permite uma única leitura, com até 5 segundos de busca e opção de cancelar. Para ler automaticamente, selecione **Contínua · sem botão**; a preferência fica salva neste dispositivo. Nos dois modos, somente a área dentro da mira é enviada ao decodificador.

No celular, as abas aparecem só nas telas iniciais; dentro de um levantamento ou lote, volte pelo link no topo. Leia primeiro um endereço. Cada produto seguinte é salvo nele. Ao ler uma posição diferente, escolha **Confirmar troca** ou **Manter endereço**; nenhuma leitura adicional é aceita durante essa decisão, e registros anteriores mantêm seus endereços. O modo pareado permite produto → endereço ou endereço → produto, também com confirmação quando a posição muda. O código e o endereço registrados aparecem no feedback; **Desfazer** remove o último registro e permite restaurá-lo. O estado do par e o endereço atual sobrevivem ao fechamento do navegador.

Também há leitor físico (teclado com Enter/Tab), leitura de uma imagem por vez e entrada manual. A entrada manual já recebe o último endereço lido e permite registrar **SEM CODIGO** ou **VAZIO** sem digitar um código. Em Registros, use busca, filtros, revisão, edição, seleção e alteração de endereço em lote. `Ctrl+Z` desfaz, `Ctrl+F` abre a busca e `Ctrl+E` exporta; atalhos não interferem com campos de texto. Esc fecha diálogos.

Configurações contém regras de produto/endereço, wrapper completo, preenchimento opcional B, som, vibração, câmera, tema e backup. O padrão não impõe lista de prefixos aos produtos. Endereços completos têm prioridade e reconhecem rua, andar, coluna, lado e prateleira, incluindo etiquetas como `A1;R02A1C01EP02`, normalizadas para `R02A1C01EP02`. Containers usam `EXT` + `A1` (ímpar) ou `A2` (par) + número (`C01` a `C52A`) + lado `0` + prateleira `P00`: o Data Matrix `A1;EXTA1C010P00` e o texto impresso `EXT A1 C01 0 P00 - CT01` viram `EXTA1C010P00`; A1/A2 trocado gera aviso. Containers não numeram bombonas automaticamente. Data Matrix GS1 com AI 251 e 37 são normalizados automaticamente, por exemplo `(251)MPC149M050P6(37)1` vira `MPC149M050P6`. Letras minúsculas viram maiúsculas sem trocar letras por outras. A migração substitui automaticamente as antigas regras padrão e preserva regras realmente personalizadas; backups antigos recebem a mesma correção quando restaurados.

Exporte um backup JSON regularmente. Restaurar adiciona cópias e só substitui configurações se essa opção for marcada. Dados são separados por navegador e origem do site. Limpar os dados do navegador pode removê-los. Exportar Excel não apaga o levantamento.

## Identificação (Supabase)

O almoxarifado fotografa os produtos sem código (1 a 4 fotos, endereço, bombona e peso opcionais) e envia o lote. A estrutura abre o lote e preenche o código item por item, ou marca **Sem código** com o motivo. O almoxarifado confere e confirma: as fotos originais são apagadas e fica só uma miniatura de até 20 KB, removida 150 dias depois pela limpeza diária. Os dois setores exportam a planilha Excel (Código do Produto, Endereço, Galão e Peso, como no levantamento) e o Word continua como alternativa.

As fotos são tiradas pela câmera dentro do app, sem passar pela galeria do celular. Sem sinal, o cadastro fica na fila do aparelho e sobe sozinho quando a conexão voltar.

**Acesso:** cada setor tem uma conta no Supabase (`almoxarifado@scanlog.app` e `estrutura@scanlog.app`). Na tela de entrada a pessoa escolhe o setor, digita a senha do setor e o próprio nome, que fica gravado em cada ação. As senhas ficam só no Supabase e podem ser trocadas no painel sem nova versão do app. As regras de quem pode fazer o quê estão no banco (RLS e gatilhos), não só na interface.

**Configuração (já aplicada no projeto `scanlog`):**

1. Rodar `supabase/migrations/*.sql` em ordem (tabelas, RLS, Storage, cron e papel por e-mail).
2. Publicar a Edge Function `supabase/functions/limpeza-fotos` com verificação de JWT desligada (ela confere um segredo guardado no Vault).
3. Em **Authentication → Users → Add user**, criar as duas contas com **Auto Confirm User**. O setor é definido pelo e-mail.
4. A URL e a chave publicável estão em `src/cloud/config.ts` e podem ser trocadas no build por `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` (veja `.env.example`). A chave `service_role` nunca vai para o app.

`supabase/tests/rls.sql` verifica as regras de acesso numa transação desfeita no final.

## Painel de Materiais

Página separada em `/painel/` (fora do PWA) com todos os códigos das ruas: fornecedor (nome, nacional ou internacional), preço unitário em Real, Dólar ou Yuan e quantidade opcional. Qualquer pessoa com o link vê tudo, sem login. Para editar, a pessoa digita a senha compartilhada e o próprio nome, que vai para o histórico. Toda gravação passa por **Cancelar / Confirmar**, cada mudança pode ser desfeita e nenhum código é apagado.

O dashboard mostra indicadores, andamento por tipo, mapa das ruas, cotação do dia, fornecedores, origem e moeda, os mais caros e as últimas mudanças. No topo, um filme curto da Maccomevap em 3D (three.js, `src/painel/luz.ts`): uma luminária à prova de explosão com a placa da marca acende e ilumina o corredor do estoque. Toca uma vez (6,4 s) quando aparece na tela, pausa fora dela e para no último quadro, sem laço; com "reduzir movimento" mostra só o quadro final. A aba Materiais tem busca, filtros e exportação para Excel. Os números das ruas usam Barlow Semi Condensed, separada da fonte do título.

**Banco:** `supabase/migrations/0005_painel_materiais.sql`. As tabelas `painel_*` são de leitura pública (RLS); escrita só pelas funções `painel_*`, que conferem a sessão criada por `painel_entrar`. A senha fica com hash bcrypt no esquema privado `painel_priv` e não está no repositório: troque no SQL Editor com `update painel_priv.config set senha_hash = extensions.crypt('nova', extensions.gen_salt('bf', 10));`. As cotações de Dólar e Yuan vêm do fechamento diário do Banco Central (taxa de venda), buscadas pelo `pg_cron` nos dias úteis depois das 13h.

**Códigos iniciais:** `src/painel/ruas.json` traz os 1.393 códigos das ruas do Relatório (descrição, tipo, peso e localização). No primeiro acesso com a senha, o botão **Carregar os códigos das ruas** grava todos; **Atualizar localizações das ruas** reaplica o arquivo sem mexer em preço, moeda ou fornecedor.

Veja [arquitetura](docs/ARQUITETURA.md), [validação e limitações](docs/VALIDACAO.md) e [sistema visual](DESIGN.md).
