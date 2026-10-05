---
name: 'Leitor de Almoxarifado'
description: 'Sistema visual operacional para leitura e associação de produtos a endereços.'
colors:
  surface: '#f8f7fa'
  surface-elevated: '#ffffff'
  surface-muted: '#f1eef5'
  text-primary: '#1e1430'
  text-secondary: '#5f5770'
  border: '#e4dfeb'
  primary: '#3b1a5a'
  primary-hover: '#2b1044'
  primary-soft: '#efe9f6'
  success: '#176646'
  warning: '#855309'
  warning-soft: '#fff4dc'
  danger: '#b53636'
  danger-soft: '#fff0ee'
  camera: '#170d24'
  accent: '#c2410c'
  accent-hover: '#9a3412'
  accent-soft: '#fff1e8'
  surface-dark: '#14201c'
  surface-elevated-dark: '#1c2b25'
  surface-muted-dark: '#25372e'
  text-primary-dark: '#edf5ef'
  text-secondary-dark: '#b5c8bc'
  border-dark: '#3a4e42'
  primary-dark: '#78cdb2'
  primary-hover-dark: '#9bddc6'
  primary-soft-dark: '#254536'
  success-dark: '#8bddae'
  warning-dark: '#f7cc88'
  warning-soft-dark: '#423523'
  danger-dark: '#ffaaa4'
  danger-soft-dark: '#442c2c'
  camera-dark: '#0c1612'
  on-primary-dark: '#122b20'
  on-danger-dark: '#31100e'
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 'clamp(26px, 3vw, 34px)'
    fontWeight: 680
    lineHeight: 1.18
    letterSpacing: '-0.025em'
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '20px'
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: '-0.015em'
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '15px'
    lineHeight: 1.5
  paragraph:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '15px'
    lineHeight: 1.6
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '14px'
    fontWeight: 550
    lineHeight: 1.5
  button:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '15px'
    fontWeight: 600
    lineHeight: 1.35
  helper:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.5
  address-code:
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
    fontSize: 'clamp(24px, 2.6vw, 36px)'
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  address-code-mobile:
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
    fontSize: 'clamp(23px, 6.5vw, 32px)'
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  record-code:
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
    fontSize: '12px'
    lineHeight: 1.5
  recent-code:
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
    fontSize: '13px'
    fontWeight: 550
    lineHeight: 1.5
rounded:
  radius: '14px'
  radius-sm: '8px'
  issue-tag: '4px'
  count-badge: '5px'
  brand-mark: '10px'
spacing:
  space-1: '4px'
  space-2: '8px'
  space-3: '12px'
  space-4: '16px'
  space-5: '20px'
  space-6: '24px'
  space-8: '32px'
  space-10: '40px'
  space-12: '48px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface-elevated}'
    typography: '{typography.button}'
    rounded: '{rounded.radius-sm}'
    padding: '10px 16px'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
  button-primary-dark:
    backgroundColor: '{colors.primary-dark}'
    textColor: '{colors.on-primary-dark}'
  button-primary-hover-dark:
    backgroundColor: '{colors.primary-hover-dark}'
  button-secondary:
    backgroundColor: '{colors.surface-elevated}'
    textColor: '{colors.text-primary}'
    typography: '{typography.button}'
    rounded: '{rounded.radius-sm}'
    padding: '10px 16px'
  button-secondary-hover:
    backgroundColor: '{colors.surface-muted}'
  button-danger:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.surface-elevated}'
    typography: '{typography.button}'
    rounded: '{rounded.radius-sm}'
    padding: '10px 16px'
  button-danger-dark:
    backgroundColor: '{colors.danger-dark}'
    textColor: '{colors.on-danger-dark}'
  button-icon:
    backgroundColor: 'transparent'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.radius-sm}'
    padding: '10px'
    width: '44px'
    height: '44px'
  button-text:
    backgroundColor: 'transparent'
    textColor: '{colors.primary}'
    typography: '{typography.button}'
    rounded: '{rounded.radius-sm}'
    padding: '10px 0'
  input:
    backgroundColor: '{colors.surface-elevated}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.radius-sm}'
    padding: '11px 12px'
    width: '100%'
  nav-item:
    backgroundColor: 'transparent'
    textColor: '{colors.text-secondary}'
    rounded: '0'
    padding: '10px 16px'
  nav-item-active:
    textColor: '{colors.primary}'
  tab-selected:
    backgroundColor: '{colors.primary-soft}'
    textColor: '{colors.primary}'
    rounded: '{rounded.radius-sm}'
    padding: '10px 16px'
  issue-tag:
    backgroundColor: '{colors.warning-soft}'
    textColor: '{colors.warning}'
    rounded: '{rounded.issue-tag}'
    padding: '3px 6px'
  session-card:
    backgroundColor: '{colors.surface-elevated}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.radius}'
  active-address:
    backgroundColor: '{colors.primary-soft}'
    textColor: '{colors.primary}'
    rounded: '{rounded.radius}'
    padding: '20px 24px'
  camera-view:
    backgroundColor: '{colors.camera}'
    rounded: '{rounded.radius}'
    width: '100%'
  modal:
    backgroundColor: '{colors.surface-elevated}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.radius}'
    padding: '28px'
    width: 'min(520px, calc(100% - 32px))'
---

# Design System: Leitor de Almoxarifado

## Overview

**Creative North Star: "Painel de coleta industrial"**

Um painel prático, limpo e profissional para trabalhar entre prateleiras. Branco e superfícies minerais sustentam a leitura; verde profundo identifica ações e contexto operacional. A presença visual vem da precisão dos contornos, do ritmo entre grupos e da clareza dos identificadores.

A tipografia do sistema mantém familiaridade e carregamento local. Códigos recebem uma família monoespaçada, números tabulares e quebra quando necessário. A densidade é funcional: informação próxima do controle correspondente, espaço suficiente para toque e nenhuma ornamentação que dispute atenção com a coleta. O tema escuro preserva os mesmos papéis com cores próprias.

**Key Characteristics:**

- Superfícies brancas e minerais, verde operacional e câmera escura.
- Identificadores monoespaçados com quebra segura e números tabulares.
- Separadores finos, cantos moderados e hierarquia por contraste tonal.
- Controles frequentes com alvos amplos e foco de teclado explícito.
- Movimento breve para reconhecer mudanças de estado.

## Colors

A paleta usa branco mineral e verdes contidos; âmbar e vermelho são sinais operacionais. Os valores do frontmatter são normativos e foram extraídos de `src/styles/app.css`.

### Primary

- **Verde operacional** (`primary`): ação principal, navegação ativa, foco e vínculo com o endereço atual.
- **Verde profundo** (`primary-hover`): resposta do botão principal ao ponteiro.
- **Verde de contexto** (`primary-soft`): seleção de abas, endereço atual, resumo de exportação e ações em lote.

### Neutral

- **Mineral de fundo** (`surface`): plano contínuo da aplicação.
- **Branco de trabalho** (`surface-elevated`): cabeçalho, campos, listas, tabelas e diálogos.
- **Mineral de apoio** (`surface-muted`): cabeçalhos de tabela e resposta de controles neutros ao ponteiro.
- **Tinta verde-escura** (`text-primary`): títulos e conteúdo de maior prioridade.
- **Tinta secundária** (`text-secondary`): instruções, metadados e rótulos auxiliares.
- **Linha mineral** (`border`): contornos e separadores.
- **Vidro da câmera** (`camera`): fundo estável do visor de captura, inclusive antes de iniciar a câmera.

### Operational states

- **Verde de aceite** (`success`): leituras aceitas e marcas de conclusão.
- **Âmbar de revisão** (`warning`, `warning-soft`): duplicidades, revisão, origem manual e conectividade indisponível.
- **Vermelho de falha** (`danger`, `danger-soft`): erro de formulário, aviso de falha e ação de exclusão.

### Dark theme

Os nomes com sufixo `-dark` documentam os valores observados em `:root[data-theme='dark']`; no CSS, eles substituem as mesmas propriedades sem o sufixo. As duas cores `on-primary-dark` e `on-danger-dark` correspondem às cores literais usadas sobre os botões dessas variantes. Não use o branco do tema claro como texto automático sobre o verde ou vermelho claros do tema escuro.

**The Operational Color Rule.** Use o verde para ações, seleção e associação atual. Reserve âmbar para revisão e vermelho para erro ou exclusão; acompanhe o estado com texto ou ícone.

## Typography

**Interface Font:** família do sistema definida no frontmatter; sem fonte externa obrigatória.

**Code Font:** Cascadia Code, com as alternativas locais registradas nos tokens de código.

**Character:** títulos firmes, texto familiar e códigos de largura regular. Não há uma escala promocional independente: a hierarquia serve à orientação e à conferência.

### Hierarchy

- **Headline** (`headline`): título principal de página; tamanho fluido, peso forte e espaçamento levemente fechado.
- **Title** (`title`): títulos de seção. Diálogos, estados vazios e seções compactas possuem ajustes locais no CSS.
- **Body / Paragraph** (`body`, `paragraph`): texto de interface e explicações; parágrafos têm comprimento máximo de 72ch.
- **Label / Helper** (`label`, `helper`): rótulos acima de campos e texto de apoio. Rótulos usam caixa natural em português.
- **Button** (`button`): peso seminegrito, alinhamento central e altura de linha compacta.
- **Address code** (`address-code`, `address-code-mobile`): identificador de maior hierarquia. O estado vazio usa a família da interface.
- **Record / Recent code** (`record-code`, `recent-code`): conferência em tabelas e lista de leituras recentes. No celular, a lista recente aumenta seu código para 14px.

**The Identifier Integrity Rule.** Mantenha códigos em monoespaçada e permita quebra de linha. Não esconda caracteres necessários à conferência para encaixar o conteúdo.

## Layout

A página usa contêiner central com largura máxima de 1360px e margens internas de 28px no desktop. A escala compartilhada de espaçamento está no frontmatter; valores locais adicionais do CSS atendem alinhamentos e tamanhos de controle, sem constituir novos tokens globais.

Na superfície de coleta, o desktop usa duas colunas proporcionais (1.2fr e 1fr), com câmera à esquerda e endereço, resposta e registros recentes à direita. Os intervalos são 24px na vertical e 32px na horizontal. Configurações usam largura máxima de 1080px e seções divididas entre explicação e campos.

- A partir de 1600px, a coleta usa proporção 1.15fr/1fr e intervalos de 28px/42px.
- Até 1100px, os espaços laterais e o intervalo da coleta se ajustam para 24px e 20px; controles secundários ficam mais compactos.
- Até 767px, a página usa margens internas de 20px e uma coluna. A ordem de coleta é endereço, resposta da operação, câmera e registros recentes. A câmera usa altura fluida entre 190px e 260px para deixar os controles próximos. A tabela se converte em linhas de três colunas: seleção, identificadores e ações.
- Até 359px, as margens internas ficam em 14px e o seletor de modo empilha. A largura mínima global é 320px.

Botões têm altura mínima base de 44px; campos comuns, 46px. Os controles principais da câmera crescem para 50px no desktop e 52px no celular. Botões de ícone e áreas de seleção de registros preservam alvo de 44px. Descrições extensas e identificadores podem quebrar sem alargar o contêiner.

## Elevation & Depth

O sistema é predominantemente plano: branco, mineral e verde suave separam funções junto a contornos de 1px. A sombra compartilhada aparece em diálogos e avisos flutuantes, enquanto o fundo escurecido do diálogo concentra a atenção. A superfície da câmera é escura por função, sem simular relevo.

### Shadow Vocabulary

- **Sobreposição operacional**: a propriedade `--shadow` é compartilhada por diálogo e aviso; seu valor exato está em `extensions.shadows` do sidecar.
- **Fundo de diálogo**: a cor translúcida de `dialog::backdrop` está na entrada correspondente do sidecar.

**The Overlay Elevation Rule.** Use a sombra compartilhada em diálogos e avisos flutuantes. Listas, campos e áreas de trabalho se separam por borda e tom.

## Shapes

Contêineres usam o raio principal; botões e campos usam o raio menor. Tags de revisão e contadores têm raios próprios, registrados no frontmatter. A marca usa um quadrado de cantos moderados; pontos de estado e controles de alternância usam círculos somente quando a função pede.

Bordas são contínuas e finas. Linhas separam registros de uma mesma lista, evitando cartões elevados para cada item. O visor recorta a câmera aos cantos do contêiner; a mira usa quatro cantos de traço fino. Ícones lineares usam, em geral, 20px e traço de 1.8, com ajustes proporcionais para suas funções.

## Components

### Buttons

Controles firmes e diretos, com texto em caixa natural. O botão neutro tem superfície elevada, contorno mineral e as dimensões do frontmatter. O principal usa verde operacional; exclusão usa a variante de perigo. Botões de texto removem a superfície e o preenchimento lateral; botões de ícone mantêm área quadrada.

O ponteiro aplica a regra base de fundo mineral e borda de texto secundário. O botão principal possui uma regra específica de fundo verde profundo. Estados desabilitados usam opacidade de 0.5 e cursor indisponível. O foco visível tem contorno de 3px na cor primária, afastado 3px; campos reduzem esse afastamento para 2px. Transições de cor, borda e fundo usam `--transition`.

### Chips

Tags de revisão são rótulos de âmbar sobre fundo suave, com texto de 10px e sem aparência de botão. Abas selecionadas usam verde suave, enquanto a contagem aparece em uma pequena superfície elevada. Estado textual e contagem continuam distinguíveis da ação.

### Cards / Containers

A lista de levantamentos e a tabela compartilham superfície elevada, contorno mineral e raio principal. Linhas de levantamento têm preenchimento de 24px; no celular, 18px vertical e 16px horizontal. Estado vazio centraliza símbolo, título e instrução dentro de um contêiner delimitado. Não há elevação recorrente nos cartões.

### Inputs / Fields

Campos têm superfície elevada, contorno mineral, raio menor e rótulo visível acima. Placeholder usa a cor de texto secundário. Busca acrescenta ícone à esquerda e espaço próprio no campo. Erros aparecem em texto explícito sobre fundo de perigo suave. No celular, campos de diálogo usam fonte de 16px. Alternâncias usam trilho arredondado, verde quando ativo, e deslocamento curto do círculo interno.

### Navigation

O cabeçalho usa superfície elevada e borda inferior. A navegação tem ícone, rótulo e uma linha inferior na opção ativa; o texto ativo também fica verde. No celular, os rótulos visuais são ocultados, os nomes acessíveis permanecem e os alvos ficam quadrados. As abas de sessão e de entrada usam seleção por fundo verde suave.

### Active address

O endereço atual é o componente de assinatura: campo amplo verde suave, rótulo curto, identificador monoespaçado de grande escala e contexto da associação. O estado vazio mostra uma instrução legível na fonte da interface. A composição responsiva mantém esse contexto antes da câmera.

### Camera and reading feedback

O visor escuro contém a câmera sem cortar o vídeo: a imagem usa `object-fit: contain`. Uma mira de quatro cantos orienta o posicionamento. A ação de iniciar ou pausar fica imediatamente abaixo. Endereço aceito e produto aceito usam uma breve mudança de fundo de 500ms, junto de mensagem e ícone; falhas e revisão têm resposta explícita. A preferência `prefers-reduced-motion: reduce` desativa animações e transições.

### Dialogs and notices

Diálogos usam raio principal, superfície elevada, sombra compartilhada e fundo escurecido; a largura comum e o preenchimento estão no frontmatter. A variante ampla admite 720px. Avisos ficam centralizados junto à borda inferior, respeitando a área segura do dispositivo, e podem incluir uma ação. O conteúdo continua quebrável em telas estreitas.

## Do's and Don'ts

### Do:

- **Do** reutilizar os tokens semânticos e suas substituições do tema escuro.
- **Do** manter produtos e endereços em monoespaçada, com números tabulares e quebra de identificadores longos.
- **Do** manter o endereço atual visualmente destacado e a resposta da leitura junto ao fluxo operacional.
- **Do** preservar o foco visível e os alvos amplos dos controles frequentes.
- **Do** usar texto e ícones junto às cores de sucesso, revisão e erro.
- **Do** respeitar a preferência por movimento reduzido e a adaptação para telas estreitas.

### Don't:

- **Don't** adicionar gradientes ou ornamentação de dashboard genérico.
- **Don't** promover métricas decorativas acima da tarefa de coleta.
- **Don't** usar sombras como decoração em todas as superfícies.
- **Don't** truncar códigos que o operador precisa conferir.
- **Don't** usar dados fictícios como conteúdo de uma sessão real.
