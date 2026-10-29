# Revisão — Clarinetto II in La/A

Fonte: PDF original, páginas 6–10, conservado em `tmp/pdfs/mozart-clarinets-2026-10-18/Mozart-Pariser-Sinfonie-Clarinets-original.pdf`.

- [x] Transcrição por sistemas de I-1–I-295, páginas 6–8.
- [x] Transcrição por sistemas de III-1–III-243, páginas 9–10.
- [x] Confirmação independente da contagem final: a última linha da página 10 começa em 236 e tem oito compassos, terminando em 243. O mapa preliminar que previa 244 estava incorreto.
- [x] Pausas múltiplas expandidas sem preencher faixas desconhecidas.
- [x] Cues preservados como voz 2 e `<cue/>`, incluindo acordes Ob. I/II, ornamentos e a oitava dos cues I-66–I-69.
- [x] Compasso, armadura e transposição escritos: I 4/4, III 2/2; um bemol; diatônica -2 e cromática -3.
- [x] Validação de estrutura e métrica: 538 compassos de quatro semínimas; nenhum erro de vozes, ties ou slurs no verificador próprio.
- [x] Validação contra o schema MusicXML 4.0: válida, sem erros.
- [x] Prévia importada e inspecionada em tiras para conferir estrutura, agrupamento de beams e separação entre notas principais e cues.
- [ ] Revisão independente de cada nota por outro leitor. Esta folha fez a transcrição e a revisão ampliada de passagens; não houve segundo revisor musical independente.

## Conteúdo e decisões

O `ledger.mjs` é a fonte reprodutível. O OMR foi usado apenas como apoio, pois omitiu semibreves, pausas, medidas e a maior parte dos cues. A numeração OMR não foi utilizada para alinhar a música. As páginas completas e os sistemas ampliados foram lidos visualmente; ampliações adicionais confirmaram, entre outras passagens, I-32/33, I-55/58, I-66/69, I-70/74, I-209/219, I-244/246 e III-52/60, III-81/84, III-117/124.

Resultado: 694 cabeças de notas principais, 274 cabeças de cues, 378 elementos de pausa principais, 72 pares de ligaduras de prolongamento (66 principais e seis nos cues) e 67 ligaduras de expressão (30 principais e 37 nos cues). Há uma única parte e uma única pauta. O segundo movimento é representado somente pelo texto `II Andante: tacet`: nenhuma duração foi inventada.

Todas as alturas são escritas. `pitch/alter` é explícito em cada nota, inclusive alter=0 para naturais; portanto o MIDI deve transpor a parte em -3 semitons e excluir os `<cue/>`. O MIDI conjunto é responsabilidade da montagem principal. Os acidentais impressos são gerados segundo a armadura e o estado dentro do compasso, com sinais de cautela observados na fonte. Não foram mantidos sinais editoriais extras em continuações ligadas apenas para contornar importadores.

Os beams seguem os agrupamentos observados: colcheias por meio-compasso e subdivisão por tempo nos grupos que contêm semicolcheias/fusas. A apresentação de pausas múltiplas foi expandida por exigência da conversão; a paginação e o espaçamento do XML não pretendem reproduzir a gravura original.

## Limitações e riscos explícitos

A fidelidade musical deriva de leitura visual manual, com apoio parcial do OMR, e não de uma edição digital independente. As verificações métricas e de schema não provam, por si sós, cada altura da fonte. O segundo passe ampliado corrigiu I-58 para E5–D5–C5 e confirmou os Bb dos cues I-33 e I-244/246, entre outras leituras.

O Verovio 6.1 usado para a prévia ignora o `pitch/alter` de algumas continuações ligadas sem novo glifo de acidente, aplicando a armadura novamente. Isso causa cinco avisos de ties abertos na importação canônica final (inícios I-70, I-138, III-59, III-73 e III-189), embora todos os 72 pares estejam completos, adjacentes e com a mesma altura no MusicXML. Não se corrigiu a partitura com acidentes redundantes para satisfazer esse renderer. A montagem principal tentou a importação independente no MuseScore instalado, que abortou na inicialização com `mutex lock failed`, portanto essa checagem não ocorreu. O renderer também comprime sistemas que agora contêm todas as pausas individuais; essa é uma limitação da prévia, não uma alteração da métrica.

## Reprodução

Executar da raiz do repositório:

```sh
node source-ledgers/mozart-clarinets-2026-10-18/revisao-II/export.mjs
node source-ledgers/mozart-clarinets-2026-10-18/revisao-II/validate.mjs
/Users/reifison/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 source-ledgers/mozart-clarinets-2026-10-18/validate-schema.py output/mozart-clarinets-2026-10-18/Clarinet-II-reviewed.musicxml --report source-ledgers/mozart-clarinets-2026-10-18/revisao-II/schema-validation.json
node source-ledgers/mozart-clarinets-2026-10-18/revisao-II/render.mjs
```

Saída final: `output/mozart-clarinets-2026-10-18/Clarinet-II-reviewed.musicxml`. Os relatórios `validation.json`, `structural-validation.json`, `schema-validation.json` e `render-report.json` permanecem nesta pasta.
