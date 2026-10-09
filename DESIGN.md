---
name: 'ScanLog'
description: 'Sistema visual operacional para leitura e associação de produtos a endereços.'
colors:
  surface: '#f6f4f9'
  surface-elevated: '#ffffff'
  surface-muted: '#f0ebf6'
  surface-sunken: '#e9e3f1'
  text-primary: '#1a0b2e'
  text-secondary: '#5d5270'
  text-tertiary: '#776c8a'
  border: '#e4dcee'
  border-strong: '#cbbfdb'
  primary: '#4c007d'
  primary-hover: '#3a0061'
  primary-soft: '#f2e9fa'
  primary-line: '#d9c4ee'
  primary-deep: '#1f0036'
  accent: '#e8590c'
  accent-hover: '#c94a06'
  accent-soft: '#fff2e8'
  accent-ink: '#b5440a'
  success: '#1b7347'
  success-soft: '#e8f6ee'
  warning: '#8a5300'
  warning-soft: '#fff5df'
  danger: '#b42318'
  danger-soft: '#fef0ee'
  camera: '#140b20'
  sheet: '#1d6b42'
  surface-dark: '#100a17'
  surface-elevated-dark: '#19121f'
  surface-muted-dark: '#231a2d'
  text-primary-dark: '#f3eff8'
  text-secondary-dark: '#bcb2ca'
  border-dark: '#2f2540'
  primary-dark: '#cfa8f5'
  primary-hover-dark: '#e0c6fa'
  primary-soft-dark: '#2a1a40'
  accent-dark: '#ff8a3d'
  success-dark: '#7fd8a6'
  warning-dark: '#f5c77e'
  danger-dark: '#ffa59c'
  on-primary-dark: '#1e1430'
  on-danger-dark: '#31100e'
typography:
  headline:
    fontFamily: "'Geist Variable', -apple-system, 'Segoe UI', sans-serif"
    fontSize: 'clamp(27px, 2.9vw, 36px)'
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: '-0.032em'
  title:
    fontFamily: "'Geist Variable', -apple-system, 'Segoe UI', sans-serif"
    fontSize: '20px'
    fontWeight: 620
    lineHeight: 1.3
    letterSpacing: '-0.018em'
  body:
    fontFamily: "'Geist Variable', -apple-system, 'Segoe UI', sans-serif"
    fontSize: '15px'
    lineHeight: 1.5
  label:
    fontFamily: "'Geist Variable', -apple-system, 'Segoe UI', sans-serif"
    fontSize: '14px'
    fontWeight: 540
    lineHeight: 1.5
  button:
    fontFamily: "'Geist Variable', -apple-system, 'Segoe UI', sans-serif"
    fontSize: '14.5px'
    fontWeight: 560
    lineHeight: 1.3
  helper:
    fontFamily: "'Geist Variable', -apple-system, 'Segoe UI', sans-serif"
    fontSize: '13px'
    lineHeight: 1.5
  overline:
    fontFamily: "'Geist Variable', -apple-system, 'Segoe UI', sans-serif"
    fontSize: '11px'
    fontWeight: 600
    letterSpacing: '0.06em'
    textTransform: 'uppercase'
  address-code:
    fontFamily: "'Geist Mono Variable', 'Cascadia Code', Consolas, monospace"
    fontSize: 'clamp(26px, 2.8vw, 40px)'
    fontWeight: 560
    lineHeight: 1.15
    letterSpacing: '-0.03em'
  galao-code:
    fontFamily: "'Geist Mono Variable', 'Cascadia Code', Consolas, monospace"
    fontSize: '19px'
    fontWeight: 600
  record-code:
    fontFamily: "'Geist Mono Variable', 'Cascadia Code', Consolas, monospace"
    fontSize: '12.5px'
    lineHeight: 1.5
rounded:
  radius-lg: '16px'
  radius: '12px'
  radius-sm: '8px'
  radius-xs: '5px'
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
motion:
  ease-out: 'cubic-bezier(0.16, 1, 0.3, 1)'
  ease-in-out: 'cubic-bezier(0.65, 0, 0.35, 1)'
  ease-pop: 'cubic-bezier(0.22, 1, 0.36, 1)'
  dur-1: '120ms'
  dur-2: '200ms'
  dur-3: '320ms'
  dur-4: '520ms'
---

# Design System: ScanLog

## Overview

**Creative North Star: "Painel de coleta industrial"**

Um painel prático e preciso para trabalhar entre prateleiras. Superfícies minerais brancas sustentam a leitura; berinjela profunda (`primary`) dá estrutura e identidade; laranja de sinal (`accent`) marca ação, foco e o que acabou de acontecer. A presença visual vem da precisão dos contornos, do ritmo entre grupos e da clareza dos identificadores.

**Key Characteristics:**

- Superfícies minerais com leve matiz berinjela; nenhum cinza neutro frio.
- Geist para interface e Geist Mono para códigos, ambas empacotadas localmente (funcionam offline e entram no precache do PWA).
- Elevação discreta e tingida pela cor da marca; bordas de 1px separam listas.
- Um único momento de movimento por evento: a leitura aceita, a troca de endereço, a varredura da mira.
- Controles frequentes com alvo mínimo de 44px e foco de teclado sempre visível.

## Colors

Os valores do frontmatter são normativos e espelham `:root` em `src/styles/app.css`. O tema escuro substitui as mesmas propriedades em `:root[data-theme='dark']`, mantendo a identidade berinjela/laranja.

- **Berinjela** (`primary`, `primary-hover`, `primary-deep`): botão principal, navegação, cabeçalho e cartão do endereço atual.
- **Berinjela suave** (`primary-soft`, `primary-line`): seleção, resumo de exportação, ações em lote e realces de ícone.
- **Laranja de sinal** (`accent`): foco, aba ativa, botão de captura, bombonas automáticas ligadas e sufixo `S` do andar 2. Para texto pequeno sobre fundo claro use `accent-ink` (contraste ≥ 4.5:1).
- **Verde de aceite** (`success`): leitura aceita, levantamento concluído, dados salvos.
- **Âmbar de revisão** (`warning`) e **vermelho de falha** (`danger`): sempre acompanhados de texto ou ícone.
- **Verde planilha** (`sheet`): exclusivo do botão de exportação Excel.

**The Operational Color Rule.** Berinjela estrutura, laranja sinaliza, verde confirma. Âmbar e vermelho só para revisão e erro.

**Material Rule.** Gradientes existem apenas como material de controle (`--grad-primary`, `--grad-accent`, cabeçalho e cartão de endereço), com variação curta de tom para parecerem sólidos iluminados. Nunca em texto, fundos de página ou cartões comuns.

## Typography

- **Headline**: títulos de página, peso 650, tracking -0.032em.
- **Title**: títulos de seção e diálogos.
- **Overline**: rótulos curtos em caixa alta sobre o cartão do endereço, colunas de tabela e partes de código (rua, andar, coluna…). Não é usado como "eyebrow" acima de títulos.
- **Address / Galão / Record code**: Geist Mono com numerais tabulares e zero cortado. Identificadores quebram linha, nunca são truncados.

## Layout

Contêiner central de 1360px com margens de 28px no desktop. O cabeçalho é fixo (`--header-h`: 72px; 62px no celular). Na coleta, o desktop usa duas colunas (1.2fr câmera / 1fr contexto); no celular a ordem é endereço → resposta → câmera → registros recentes. Configurações usam 1080px, com o título de cada seção fixo ao rolar e o botão Salvar sempre alcançável.

## Elevation & Depth

Escala tingida: `shadow-xs` (campos e botões neutros), `shadow-sm` (listas, tabela, abas selecionadas), `shadow-md` (cartão do endereço, visor da câmera) e `shadow` (diálogos e avisos). Declare elevação uma vez: borda **ou** sombra forte, nunca ambas competindo.

## Components

### Active address (assinatura)
Cartão berinjela com luz laranja no canto, rótulo em overline, código em Geist Mono de grande escala e, para endereços no padrão `R<rua>A<andar>C<coluna><lado>P<prateleira>`, a decomposição em partes. A parte **Andar 2** é destacada em laranja, porque define o sufixo `S` das bombonas. Ao trocar o endereço, o código entra com fade e desfoque curto.

### Bombonas e galões
Bombonas automáticas são numeradas por rua **e por andar**: A1 gera `R15G01`, `R15G02`…; A2 gera uma série própria `R15G01S`, `R15G02S`…. O sufixo `S` aparece destacado em laranja (`GalaoCode`) e o próximo galão do andar 2 recebe a etiqueta "Andar 2".

### Buttons
Neutro (superfície elevada + borda), principal (berinjela), accent (laranja, ação de captura), perigo, texto e ícone. Todos têm resposta tátil em `:active` (1px para baixo, escala 0.985). Controles pedidos pelo usuário mantêm identidade própria e foram apenas refinados:

- **Levantamentos** (pílula de vidro com orbe) e **Configurações** (laranja, brilho que percorre o botão apenas ao passar o mouse ou focar, engrenagem gira meia volta).
- **Menu de ações** (hambúrguer berinjela que vira laranja e se transforma ao abrir).
- **Exportar Excel** (verde planilha com preenchimento lateral no hover).
- **Mesmo galão** (botão e alternância com estado pressionado laranja inequívoco).

### Tabs
Controle segmentado sobre `surface-muted`; a aba ativa é elevada com sublinhado laranja e contador em pílula.

### Camera
Visor escuro com mira de quatro cantos na região real de recorte. Durante a busca, uma linha de varredura percorre a mira — o único movimento contínuo da tela de coleta.

### Feedback de leitura
Cartão com ícone em bloco, tingido por estado (produto verde, endereço berinjela, galão/espera laranja, erro vermelho com leve tremor). Cada nova leitura reexecuta a entrada. O registro mais recente entra na lista com um lampejo verde.

### Dialogs and notices
Diálogos entram com fade e leve escala; fundo com desfoque de 3px. Avisos sobem da borda inferior respeitando a área segura.

## Do's and Don'ts

### Do
- Reutilizar tokens semânticos e os de movimento (`--ease-out`, `--dur-*`).
- Manter códigos em Geist Mono, tabulares e quebráveis.
- Respeitar `prefers-reduced-motion` (todas as animações e transições são desligadas).
- Usar texto e ícone junto de cor em todo estado.

### Don't
- Gradiente em texto, fundos de página ou cartões comuns.
- Easing com overshoot/bounce em novos componentes.
- Animações em loop fora de status vivo (câmera buscando, levantamento em andamento).
- Truncar códigos que o operador precisa conferir.
- Dados fictícios em sessões reais.
