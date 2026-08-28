# Fase 0 — matriz de fixtures MusicXML → MIDI

Data da investigação: 2026-08-26
Versão observada: Verovio 6.1.0, parser `@tonejs/midi` 2.0.28.

## Evidência já disponível

As fixtures existentes em `apps/api/src/tests/fixtures/midi` foram ampliadas
para cobrir os casos que tornam a associação parte↔trilha ambígua. A
homologação confirmou que `multiple-parts.musicxml` produz duas trilhas
sonoras e dois canais distintos (Piano C4 e Flauta G4), enquanto a fixture de
acordes/ligaduras produz uma única trilha sonora com as notas preservadas.

O parser web atualmente expõe `trackIndex`, `channel`, `program` e `voiceId`
por evento. `trackIndex` é identidade técnica da saída MIDI, não identidade
confiável da parte MusicXML; portanto a matriz abaixo deve ser executada antes
de exibir nomes de instrumentos.

## Matriz de casos

| ID | Caso | Entrada essencial | Expectativa de saída | Confiança | Decisão |
| --- | --- | --- | --- | --- | --- |
| M01 | Duas partes normais | P1 Piano ch 1 prog 1; P2 Flauta ch 2 prog 74; ambas com notas | Duas trilhas sonoras, cada uma com notas separáveis | exact | Usar canal+programa quando únicos |
| M02 | Canal reutilizado | P1/P2 com canal 1, programas 1 e 74 | Duas vozes; nunca fundir só por canal | heuristic/fallback | Programa diferencia; se faltar programa, manter vozes neutras distintas |
| M03 | Canal e programa reutilizados | P1/P2 com ch 1 e prog 1 | Duas vozes ou associação ambígua explícita | fallback | Não afirmar nome; preservar cada trilha como `Faixa N` |
| M04 | Programa repetido, canais distintos | P1/P2 prog 1, ch 1/2 | Duas vozes | exact | Canal+programa continua determinístico |
| M05 | Parte sem notas | score-part P3 sem `<note>` tocável e part P3 vazia/rests | P3 não entra no catálogo reproduzível; notas de outras partes intactas | exact | Não criar mute para parte sem áudio |
| M06 | Nome ausente | `<score-part>` sem `part-name` e sem `instrument-name` | Parte ainda reproduzível com `Faixa N` | exact/fallback | Rótulo sanitizado neutro |
| M07 | Nome duplicado | P1/P2 ambos `part-name=Violino` | Duas vozes, rótulos distinguíveis na UI (`Violino 1/2` ou fallback) | heuristic | Nunca fundir por nome |
| M08 | Uma parte em múltiplas trilhas | Fixture `verovio-phase0-edge-cases.musicxml` com duas vozes e dois `midi-instrument` em P1 | Limitação comprovada: Verovio emite uma única trilha sonora (sem evento no canal 1); vozes internas não são separáveis no SMF | limitation | Unidade mínima segura é a parte; não prometer mute por voz/instrumento interno |
| M09 | Múltiplos instrumentos na parte | Fixture `verovio-phase0-edge-cases.musicxml`: P1 declara Piano (ch 1/prog 1) e Flute (ch 2/prog 74) | Verovio emite **uma** trilha sonora, nome da parte `Dueto na mesma parte`, canal 0, programa 0 (primeiro instrumento); não emite uma trilha por `midi-instrument` | exact (comportamento observado) | Tratar `score-instrument` como metadado; não criar duas faixas. Só uma nova parte MusicXML garante voz separada |
| M10 | Acordes e vozes internas | acordes, `<backup>`/`<forward>` ou vozes 1/2 | Eventos simultâneos permanecem na mesma parte/trilha quando Verovio assim emitir | exact/heuristic | Matching não pode depender da contagem de notas |
| M11 | Ligaduras e rests | tie atravessando compassos e rests | Uma nota MIDI sustentada; rests não contam como áudio | exact | `hasPlayableNotes` olha notas reais |
| M12 | Repetições/voltas | Fixture `verovio-phase0-edge-cases.musicxml`: repeat forward na medida 1 e backward `times=2` na medida 2 | Uma trilha; eventos repetidos em janelas 0/2/4/6 s (8 notas), preservando a identidade da parte | exact (expansão observada) | Matching ignora duração e usa metadados; repetição não cria voz nova |
| M13 | Três ou mais partes | P1/P2/P3 com ch/prog distintos | Todas as vozes aparecem na ordem do `part-list` | exact | Ordem MusicXML para apresentação |
| M14 | Canal/programa ausentes na saída | Limitação comprovada: sem `<midi-instrument>`, Verovio emite defaults canal 0/programa 0; SMF sem program-change/canal explícito também chega ao `@tonejs/midi` como 0/0 | O parser preserva a nota e expõe 0/0, mas esses valores não distinguem ausência de uma declaração MusicXML 1/1 | limitation + fallback | Nunca descartar eventos; o mapper deve tratar 0/0 como ambíguo quando não houver evidência do XML |
| M15 | Trilhas sem notas | MIDI contém trilha de meta/controle sem notas | Não criar faixa reproduzível para trilha vazia | exact | Filtrar somente no catálogo, não no parser bruto |

## Normalização congelada

- MusicXML `<midi-channel>` 1–16 → MIDI 0–15 (`n - 1`). Valores fora do
  intervalo ou ausentes tornam o campo desconhecido; não fazer clamp silencioso.
- MusicXML `<midi-program>` 1–128 → MIDI 0–127 (`n - 1`). Valores fora do
  intervalo ou ausentes tornam o campo desconhecido.
- `<part-name>` tem prioridade sobre o primeiro `<instrument-name>`; depois usar
  `Faixa N`. Remover whitespace externo, limitar comprimento e escapar texto
  antes de renderizar.
- `<rest>` não é nota tocável. Uma parte com apenas rests é considerada sem
  áudio para fins do seletor.

## Evidência adicional executada (M08/M09/M12/M14)

Com Verovio 6.1.0 (`inputFrom: xml`, `breaks: none`) e
`@tonejs/midi` 2.0.28, a fixture `verovio-phase0-edge-cases.musicxml` foi
carregada com sucesso e gerou SMF format 1 de 154 bytes, 2 chunks `MTrk`
(um condutor e uma trilha sonora). A trilha sonora foi:

```text
track efetiva 0 | nome "Dueto na mesma parte" | canal 0 | programa 0
notas MIDI 60,67,62,69,60,67,62,69 | inícios 0,0,2,2,4,4,6,6 s
```

Apesar de P1 declarar dois pares `score-instrument`/`midi-instrument`, o
Verovio usa somente o primeiro instrumento para a trilha da parte. As duas
vozes internas (`backup` + `voice`) permanecem na mesma trilha; portanto não
há base para mute independente entre elas nesta versão do Verovio. A volta
foi expandida como eventos adicionais, sem nova trilha.

Para M14, a remoção de `<midi-instrument>` da fixture mantém a trilha e faz o
Verovio emitir os defaults canal 0/programa 0. Isso não representa metadado
ausente de forma detectável no SMF. A cobertura correta é um teste sintético
do parser web que construa um SMF com notas, mas sem `program-change`/canal
associável (ou force campos ausentes no adaptador), esperando `unknown`, voz
neutra e eventos preservados. `(channel=0, program=0)` não deve ser tratado
como evidência de que a parte declarou MIDI 1/1.

## Algoritmo de associação validado na Fase 1

1. Associar por `(channel, program)` somente quando a combinação for única.
2. Se o canal estiver ausente, usar `program` somente quando único.
3. Usar nome de trilha/instrumento MIDI apenas se M01–M15 demonstrarem que a
   versão fixada do Verovio o preserva de modo estável.
4. Usar ordem apenas como fallback documentado.
5. Em qualquer empate, manter cada trilha em voz independente e marcar
   `mappingConfidence=fallback`; eventos sem correspondência continuam audíveis.

## Critério de aprovação da Fase 0

A fase só pode ser encerrada quando os casos M01–M15 tiverem fixture executável,
saída MIDI registrada (trilha, canal, programa, número de notas e janela
temporal) e uma decisão exact/heuristic/fallback. O revisor independente deve
reexecutar a matriz e confirmar principalmente M02, M03, M05, M08 e M14.

## Evidência executada nesta etapa

As fixtures `association-edge-cases.musicxml` e `three-parts-distinct.musicxml`,
mais os testes de homologação web, fecharam os seguintes casos:

- M02: dois canais MIDI 0 distintos por programa (0 e 73), sem fusão por canal;
- M03: duas partes com canal 0 e programa 0 iguais continuam em duas trilhas
  MIDI distintas; a associação deve usar fallback conservador, nunca fundir;
- M04: os metadados de canal/programa permanecem observáveis para decidir entre
  associação exata e fallback;
- M05: parte somente com rest não produz trilha sonora;
- M06: parte sem `part-name` continua produzindo áudio e depende de rótulo neutro;
- M07: nomes duplicados continuam em trilhas independentes;
- M10/M11: a fixture existente de acordes, rests, acidentes e ligaduras passou;
- M12: `verovio-phase0-edge-cases.musicxml` expande a repetição: C4 e G4
  aparecem duas vezes na trilha sonora, confirmado por contagem estrutural de
  note-on;
- M13: três partes produziram notas `[60, 64, 67]`, canais `[0, 1, 2]` e
  programas `[0, 40, 73]`, na ordem do `part-list`;
- M15: trilha MIDI vazia não produz evento, enquanto a trilha seguinte continua
  reproduzível.

Validação: `npm test -w apps/web -- --run src/audio/musicSemantics.integration.test.ts src/audio/parseMidi.test.ts` — 2 arquivos, 13 testes aprovados.

## Continuidade para a Fase 2

M08 e M14 são limitações comprovadas do formato emitido pelo Verovio/parser,
não pendências de investigação. O teste executável
`apps/api/src/tests/verovioPhase0.test.ts` confirma M08; o caso sintético de
SMF sem `program-change` está coberto em
`apps/web/src/audio/parseMidi.test.ts`.

O fallback conservador foi implementado e validado na Fase 1: nunca fundir
trilhas por 0/0 nem criar uma associação MusicXML afirmativa sem evidência
única. A Fase 2 deve apenas preservar a identidade e a decisão de associação
de cada voz ao encaminhar seu áudio para os canais individuais.
