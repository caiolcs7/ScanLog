<p align="center"><img src="docs/marca/scanlog-logo.png" alt="ScanLog" width="420" /></p>

# ScanLog

PWA local para ler etiquetas Data Matrix, associar produtos a endereços e exportar relatórios Excel. Sem backend, login, serviços de análise ou envio de imagens.

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

Leia primeiro um endereço. Cada produto seguinte é salvo nele. Ao ler uma posição diferente, escolha **Confirmar troca** ou **Manter endereço**; nenhuma leitura adicional é aceita durante essa decisão, e registros anteriores mantêm seus endereços. O modo pareado permite produto → endereço ou endereço → produto, também com confirmação quando a posição muda. O código e o endereço registrados aparecem no feedback; **Desfazer** remove o último registro e permite restaurá-lo. O estado do par e o endereço atual sobrevivem ao fechamento do navegador.

Também há leitor físico (teclado com Enter/Tab), leitura de uma imagem por vez e entrada manual. A entrada manual já recebe o último endereço lido e permite registrar **SEM CODIGO** ou **VAZIO** sem digitar um código. Em Registros, use busca, filtros, revisão, edição, seleção e alteração de endereço em lote. `Ctrl+Z` desfaz, `Ctrl+F` abre a busca e `Ctrl+E` exporta; atalhos não interferem com campos de texto. Esc fecha diálogos.

Configurações contém regras de produto/endereço, wrapper completo, preenchimento opcional B, som, vibração, câmera, tema e backup. O padrão não impõe lista de prefixos aos produtos. Endereços completos têm prioridade e reconhecem rua, andar, coluna, lado e prateleira, incluindo etiquetas como `A1;R02A1C01EP02`, normalizadas para `R02A1C01EP02`. Data Matrix GS1 com AI 251 e 37 são normalizados automaticamente, por exemplo `(251)MPC149M050P6(37)1` vira `MPC149M050P6`. Letras minúsculas viram maiúsculas sem trocar letras por outras. A migração substitui automaticamente as antigas regras padrão e preserva regras realmente personalizadas; backups antigos recebem a mesma correção quando restaurados.

Exporte um backup JSON regularmente. Restaurar adiciona cópias e só substitui configurações se essa opção for marcada. Dados são separados por navegador e origem do site. Limpar os dados do navegador pode removê-los. Exportar Excel não apaga o levantamento.

Veja [arquitetura](docs/ARQUITETURA.md), [validação e limitações](docs/VALIDACAO.md) e [sistema visual](DESIGN.md).
