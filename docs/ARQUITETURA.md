# Arquitetura

Aplicação React 19 + TypeScript strict + Vite 8. A interface é dividida em sessões, scanner, registros, exportação e configurações. CSS com tokens define superfícies claras/escuras, cores de estado, áreas de toque, tipografia do sistema e fonte monoespaçada para identificadores.

## Fluxo dos dados

Todas as entradas passam pelo mesmo parser: Unicode NFKC → identificação de envelope GS1 251/37 → remoção de espaços, controles e invisíveis → identificador AIM conhecido → maiúsculas → remoção do prefixo de site antes de um endereço completo → wrapper configurado → classificação → regra opcional de endereço → associação.

O padrão aceita códigos industriais normalizados sem lista fixa de prefixos. Uma posição completa tem precedência e segue `R<rua>A<andar>C<coluna><lado>P<prateleira>` ou o formato simples de bombona. Os lados D e E, além de outros identificadores de letra única, são aceitos. O envelope de endereço `A1;` é removido apenas quando o restante forma uma posição completa. Data Matrix GS1 em apresentação HRI, texto simples com separador GS ou representação escapada têm os AIs 251/37 removidos automaticamente; wrappers configurados continuam disponíveis para outros leitores. Não há inferência de caracteres ausentes.

O modo fixo guarda `activeAddress`. Uma posição diferente exige confirmação, sem alterar o endereço ou par pendente. A confirmação revalida endereço anterior, modo e par na transação; cancelar mantém o estado original. A fila de leituras fica bloqueada durante a decisão, e um latch impede confirmação dupla. A proteção também vale nos modos pareados. Ler um produto sem endereço retorna erro sem registro. Os modos pareados guardam um primeiro elemento em `pending`, exigem a ordem escolhida e limpam o par apenas após registro ou cancelamento. Outro elemento do mesmo tipo não substitui silenciosamente o primeiro.

## Persistência e concorrência

Dexie abstrai IndexedDB, com schema versão 4 e tabelas `sessions`, `records`, `settings` e `history`. As migrações ampliam apenas regras padrão publicadas anteriormente; sessões, registros, preferências e regras personalizadas são preservados. A restauração das configurações de um backup antigo usa a mesma correção. Os índices incluem sessão/ordem, sessão/código/endereço e sessão/horário. Cada leitura executa transação atômica envolvendo registro, contador, estado do par/endereço e histórico. A sequência monotônica não é reutilizada após desfazer. Alterações não dependem de servidor.

Backup JSON validado com Zod verifica estrutura, versão, referências, identificadores repetidos e regras. A restauração é transacional e usa novos IDs; quantidades e próxima ordem são recalculadas. Câmeras e IDs de dispositivo importados podem precisar ser escolhidos novamente em outro aparelho.

A migração v4 acrescenta `cameraCapture: button` quando ausente, preservando os dados e as regras da versão GS1.

## Leitura e repetição

`ScannerService` gerencia câmera, seleção de dispositivo, foco contínuo quando suportado, zoom, lanterna, ciclo de decodificação e liberação de `MediaStream`. Usa a câmera traseira com resolução ideal de 1920×1080 e preserva até 1920 px de largura para Data Matrix pequenos, processando no máximo um frame por vez, com pausa de 160 ms entre tentativas. A decodificação WASM roda em Web Worker.

O padrão é captura por botão: preview ativo sem decodificação até o toque; uma tentativa dura até 5 segundos e consome no máximo um resultado. Cancelamento, pausa, mudança de modo e expiração invalidam resultados em andamento por um identificador de tentativa. Resultados de antes de um redimensionamento também são descartados. A opção contínua dispensa o botão e fica salva no dispositivo. `cameraRegion` calcula um recorte central de 72% da largura e 60% da altura da imagem; a mira usa a mesma geometria convertida para o vídeo com `object-fit: contain`, incluindo as faixas laterais/superiores. Tanto o detector nativo como o WASM recebem somente esse recorte. Backups anteriores recebem captura por botão quando não incluem a preferência.

Quando `BarcodeDetector.getSupportedFormats()` inclui `data_matrix`, a API nativa é usada. Após erros repetidos, o scanner passa para ZXing-C++; o fallback também é tentado periodicamente quando o nativo não encontra nada. Câmera e imagens rejeitam múltiplas etiquetas no mesmo enquadramento, para evitar associação por ordem arbitrária. Sequências estruturadas incompletas não são aceitas.

O módulo `zxing-wasm/reader` fornece Data Matrix, QR Code, Code 128, Code 39 e ITF. Seu WASM é empacotado localmente, substituindo o carregamento padrão por CDN. A escolha oferece decodificação nativa C++/WASM e opções de rotação/inversão; não representa uma afirmação de superioridade medida contra todas as bibliotecas ou etiquetas industriais. Referência: [repositório oficial zxing-wasm](https://github.com/Sec-ant/zxing-wasm).

No modo contínuo, o anti-repetição de câmera mantém a última etiqueta bloqueada enquanto visível. Libera ao detectar outro código ou após ausência confirmada por 900 ms. Tempo de processamento lento sozinho não libera a etiqueta. A trava permanece ao pausar para uma confirmação, evitando repetir o aviso ao retomar. No modo por botão, outro toque autoriza nova leitura, ainda sujeita à conferência de duplicados. Uma repetição de código/endereço já salvo gera aviso com Ignorar/Adicionar novamente; as entradas ficam pausadas até a escolha. O operador pode desativar esse aviso, mantendo a proteção contra frames repetidos.

A câmera para ao sair da tela, abrir uma operação modal, pausar ou ocultar a aba. Wake Lock é opcional e liberado ao sair. Som usa Web Audio iniciado após interação, com frequências distintas; vibração depende da API do dispositivo. Nenhum frame sai do navegador.

## PWA e atualização

`vite-plugin-pwa` e Workbox geram manifest e service worker. Todos os assets essenciais, incluindo módulos de exportação, Worker e WASM, entram no precache. A instalação só termina quando esses arquivos estão disponíveis. Rotas com hash e URLs relativas mantêm compatibilidade com subdiretórios do GitHub Pages.

Atualizações usam prompt: a nova versão espera a ação Atualizar. O botão desmonta o scanner e aguarda a transação do banco antes de solicitar SKIP_WAITING ao worker. A recarga preserva a rota e aguarda controllerchange, com tratamento de timeout; não depende da classificação isUpdate do Workbox. O schema não é removido. Migrações futuras devem usar `db.version(n).stores(...).upgrade(...)`.

## Relatórios

ExcelJS é carregado sob demanda e já está disponível no cache offline. O XLSX usa apenas A/B como colunas de dados: Código do Produto e Endereço. Há título mesclado, sessão/data, cabeçalhos na linha 5, linhas alternadas, texto explícito para identificadores, bordas, filtro, congelamento e impressão A4 ajustada à largura. Ordenação pode seguir leitura, endereço ou produto; opcionalmente há abas por rua, além da aba Todos os registros. CSV e backup JSON são recursos complementares.

Não foi implementada importação de XLSX, explicitamente opcional no pedido; restauração de backup JSON está disponível. Sincronização, login e serviços de nuvem ficam fora desta versão.

## Levantamento com peso

Sessões com `weighted: true` (aba Com peso) guardam `weight` em gramas por registro, aceitando valores abaixo de 1 g. Ao ler um produto, o peso é preenchido por `src/data/weights.json`, gerado com `node scripts/weights.mjs <caminho do localizador-de-materiais>` a partir dos descritivos com "PESO"; sem peso conhecido, o app pede o valor. O peso pode ser alterado na leitura e na lista de registros. A exportação acrescenta a coluna Peso em kg (10 g → 0,010 kg; 0,24 g → 0,00024 kg), como número no XLSX.
