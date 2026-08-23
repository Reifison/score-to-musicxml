# Sistema visual do Conversor de Partituras

## Direction

Cena de uso: um músico ou professor abre o conversor sob luz clara, entre ensaio e estudo, e precisa reconhecer rapidamente onde enviar, acompanhar e baixar a partitura.

Tema claro com estratégia de cor restrita para o produto. O gradiente laranja e coral pertence ao símbolo da marca; controles usam um laranja sólido para manter contraste e previsibilidade.

## Brand assets

- Fonte principal: `ID/branding_assets/`.
- Símbolo: arquivo PDF, seta de transformação e clave de sol em branco sobre laranja.
- Nome oficial: Conversor de Partituras.
- Tela de abertura: somente o símbolo da marca, centralizado sobre o fundo Canvas.

## Color tokens

| Role | CSS OKLCH | Native fallback | Use |
|---|---|---|---|
| Brand | `oklch(0.68 0.19 42)` | `#F06432` | Ação principal e seleção |
| Brand strong | `oklch(0.59 0.20 33)` | `#D9472E` | Hover e ação pressionada |
| Brand soft | `oklch(0.95 0.035 55)` | `#FFF0E7` | Fundo de seleção e destaque |
| Canvas | `oklch(0.975 0.008 75)` | `#FAF8F4` | Fundo do app |
| Surface | `oklch(0.995 0.004 75)` | `#FFFDF9` | Painéis e campos |
| Surface muted | `oklch(0.955 0.010 70)` | `#F3EFE9` | Áreas secundárias |
| Ink | `oklch(0.29 0.020 45)` | `#3C332F` | Texto principal |
| Muted | `oklch(0.52 0.025 45)` | `#766963` | Texto secundário |
| Line | `oklch(0.90 0.015 60)` | `#E5DDD5` | Bordas e divisores |
| Success | `oklch(0.53 0.12 155)` | `#277A57` | Conversão concluída |
| Warning | `oklch(0.60 0.13 75)` | `#A96513` | Fila e atenção |
| Danger | `oklch(0.53 0.18 27)` | `#B73D32` | Falhas e exclusão |

## Typography

Usar a pilha nativa: SF Pro no iOS, Segoe UI no Windows e system-ui no web. Escala compacta de produto, com títulos entre 28 e 32 px, subtítulos entre 17 e 20 px, corpo em 15 ou 16 px e rótulos em 13 ou 14 px.

## Shape and elevation

- Raio de controles: 12 px no web e 14 px no mobile.
- Raio de painéis: 18 a 24 px.
- Botões primários com altura mínima de 48 px no web e 52 px no mobile.
- Sombras quentes, suaves e raras. Bordas definem a maior parte da hierarquia.

## Components

- Botão principal: laranja sólido, texto marfim, foco visível e estado ocupado com rótulo explícito.
- Botão secundário: superfície clara, borda quente e texto escuro.
- Navegação ativa: fundo laranja suave e ícone laranja, sem faixa lateral.
- Estado vazio: explicar como criar a primeira conversão.
- Carregamento: marca visível na inicialização e skeleton ou progresso próximo ao conteúdo durante tarefas.
- Status: cores semânticas sempre acompanhadas por texto.

## Responsive behavior

- Web: sidebar em telas largas; barra inferior em telas estreitas; ações de upload empilham sem rolagem horizontal.
- Mobile: respeitar safe areas, alvos mínimos de 44 px, conteúdo rolável e navegação inferior com no máximo cinco ações visíveis.
- Partituras e tabelas devem reordenar conteúdo em vez de apenas reduzir a tipografia.

## Motion

Transições de estado entre 160 e 220 ms, com `cubic-bezier(0.16, 1, 0.3, 1)`. Não animar layout nem usar movimento decorativo no fluxo principal.
