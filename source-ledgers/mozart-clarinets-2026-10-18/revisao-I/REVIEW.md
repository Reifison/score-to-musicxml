# Clarinetto I in La/A - revisão da fonte

Saída: `output/mozart-clarinets-2026-10-18/Clarinet-I-reviewed.musicxml`.

SHA-256 final: `ff6c04bd144ee5c2dd3d1e2b14c5c6f76cee1b43292e60dbac5e98208c34d40d`.

Fonte visual: páginas 1 a 5 de `Mozart-Pariser-Sinfonie-Clarinets-original.pdf`, renderizadas a 300 dpi. As cinco páginas e os recortes por sistema foram inspecionados; o OMR foi usado apenas como auxílio para sequências rápidas. A numeração e as medidas ausentes do OMR foram reconstruídas pela fonte, sem usar a numeração raw como autoridade.

## Conteúdo

| Trecho | Compassos | Página da fonte |
| --- | ---: | --- |
| I - Allegro assai | 1-89 | 1 |
| I - Allegro assai | 90-193 | 2 |
| I - Allegro assai | 194-295 | 3 |
| II - Andante | tacet; sem duração fornecida | 3 |
| III - Allegro | 1-118 | 4 |
| III - Allegro | 119-243 | 5 |

São 538 compassos, cada um com quatro semínimas: I em 4/4; III em 2/2. A última linha da página 5 começa em 237 e contém sete compassos, terminando em 243. Não foi inventado um compasso 244 nem uma duração para o Andante.

Uma parte, uma pauta, armadura de um bemol, alturas escritas para clarinete em Lá e transposição diatônica -2/cromática -3 desde o início. Todas as alterações em `pitch/alter` são absolutas, inclusive os Si bemóis da armadura.

O validador conta 716 cabeças principais, 274 cabeças de cue (incluindo os tons dos acordes), nove notas de graça, 61 inícios de ligadura de prolongamento e 80 inícios de ligadura de expressão. Os cues ocupam 59 compassos e usam a voz 2 e `<cue/>`. As pausas de contagem realmente impressas foram expandidas; 27 grupos também conservam a indicação visual de pausa múltipla.

Os cues de I-66 a I-69 usam as alturas reais na oitava aguda e a indicação de oitava correspondente, encerrada antes de I-70. As dinâmicas impressas nos cues pertencem à voz 2 e não incluem `<sound>`. Pausas apenas de preenchimento no final dos cues I-56, I-137, I-210, I-246 e I-265 são invisíveis; não representam novas pausas principais ou material inventado.

## Validação e limites

`validate.mjs` passou: todos os compassos e todas as vozes somam quatro semínimas; os 61 prolongamentos têm alturas e continuidade temporal compatíveis; todas as ligações de expressão estão balanceadas. O arquivo passou em `xmllint` contra o XSD MusicXML fornecido pelo root. A auditoria reproduzível está em `structural-validation.json`.

Os cinco previews em `previews/` foram gerados e inspecionados. O Verovio informa quatro prolongamentos abertos em grupos cromáticos, apesar de `pitch/alter`, `<tie>` e `<tied>` estarem coerentes e de o validador independente fechar todos eles. Trata-se de uma limitação do importador ao encontrar prolongamentos cromáticos sem repetição gráfica do acidente. O XML final preserva o dado canônico, sem cores artificiais nem atributos inválidos. `print-object` não é permitido em `<accidental>` pelo XSD local.

A leitura visual foi feita por sistema e consolidada no ledger; não houve uma segunda conferência independente de cada cabeça de nota. Pequenos arcos de entrada que aparecem truncados antes do começo de um excerto de cue não foram transformados em ligações sem início conhecido. A posição gráfica de textos, hastes e articulações pode variar conforme o aplicativo de notação; o MusicXML não é um fac-símile da página impressa.

## Reprodução

Executar, nesta ordem, a partir da raiz do projeto:

```sh
node source-ledgers/mozart-clarinets-2026-10-18/revisao-I/build.mjs
node source-ledgers/mozart-clarinets-2026-10-18/revisao-I/validate.mjs
xmllint --noout --schema source-ledgers/mozart-clarinets-2026-10-18/schema/musicxml.xsd output/mozart-clarinets-2026-10-18/Clarinet-I-reviewed.musicxml
node source-ledgers/mozart-clarinets-2026-10-18/revisao-I/render.mjs
```

O MIDI final é responsabilidade do montador das duas partes. Ao produzi-lo, ignorar todas as notas `<cue/>` e direções de dinâmica da voz 2.
