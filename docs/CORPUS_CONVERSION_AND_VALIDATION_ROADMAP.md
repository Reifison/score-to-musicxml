# Conversão e validação do acervo de partituras

Atualizado em 7 de outubro de 2026. Fonte autorizada: `/Users/reifison/Downloads/partituras/`. Os originais permanecem somente leitura. **Feita?** registra evidência; preparar o mecanismo, executar a conversão e homologar notas são atividades diferentes.

O [relatório do lote](validation/corpus-partituras-2026-10-07/BATCH_RESULTS.md) mostra o retrato mais recente por arquivo. [Casos](validation/corpus-partituras-2026-10-07/cases.csv), [erros](validation/corpus-partituras-2026-10-07/errors.csv) e [dados completos](validation/corpus-partituras-2026-10-07/results.json) são gerados a partir das tentativas preservadas.

## Escopo

148 arquivos; 115 PDFs / 1.814 páginas físicas. Dois PDFs administrativos foram separados: o documento de viagem foi identificado pelo nome sem inspeção de conteúdo; o documento genérico foi revisado visualmente. O conjunto musical tem 113 PDFs / 1.807 páginas. Uma cópia idêntica reduz a fila a 112 PDFs únicos / 1.804 páginas. Os 14 PDFs nos ZIPs, com 186 páginas, são cópias byte a byte de PDFs físicos. HEIC e SVG são partituras adicionais com PNGs derivados rastreáveis.

Há 18 fontes nativas candidatas, incluindo MSCZ, MusicXML, GPX e formato ainda não identificado. Elas não são referências aprovadas só por existirem. O MusicXML de Sons de Carrilhões é idêntico à saída automática anterior; usá-lo como verdade independente produziria uma avaliação circular.

A conferência e as novas correções desta rodada foram limitadas pelo usuário aos **65 PDFs de até três páginas físicas (125 páginas)**. Os 47 PDFs maiores (1.679 páginas) permanecem no inventário histórico e fora desta rodada. A [seleção por hash](validation/acervo-review-2026-10-07/review-scope.json) e a [fila atual](validation/acervo-review-2026-10-07/APPROVAL_QUEUE.md) conservam essa restrição. Quatro dos 65 PDFs estão aprovados integralmente, um parcialmente; sete transcrições aprovadas somam 429 notas/pausas.

## Atividades

| ID | Atividade | Feita? Preparação/implementação | Feita? Execução/validação |
| --- | --- | --- | --- |
| C01 | Catalogar arquivos, hashes, páginas e formatos sem alterar fontes. | ☑ Sim | ☑ Sim — 148 arquivos; zero PDFs ilegíveis; avisos recuperáveis preservados |
| C02 | Deduplicar fontes físicas e membros dos ZIPs. | ☑ Sim | ☑ Sim — comparação por SHA; 14/14 PDFs internos já presentes |
| C03 | Renderizar e triar páginas musicais, capas/textos e incertezas. | ☑ Sim | ☑ Sim — 1.812 páginas renderizadas; 27 revisões visuais; triagem automática apenas indicativa |
| C04 | Excluir apenas capas/textos conferidos, preservando página física e obra. | ☑ Sim — política interna/API e apresentação web/mobile | ☑ Sim — 43 decisões em PDFs musicais aceitas; Sons de Carrilhões com capa excluída e música processada; Arue Arua com capa e página em branco excluídas |
| C05 | Registrar conflitos entre detector geométrico e revisão visual. | ☑ Sim | ☑ Sim — quatro conflitos administrativos e um em página de método, sem forçar exclusão |
| C06 | Executar OMR em todos os PDFs únicos; preservar movimentos/artefatos. | ☑ Sim — fila limitada, retomada e tentativas imutáveis | ☑ Sim — 112/112 tentativas finalizadas; falhas e resultados parciais preservados |
| C07 | Validar estrutura, cobertura observável, ritmo e navegação dos XMLs. | ☑ Sim | ☑ Sim — candidatos disponíveis conferidos automaticamente; alertas permanecem em revisão e não comprovam fidelidade |
| C08 | Reprocessar falhas de imagem grande; distinguir fluxo do app e leitura PDF controlada de livros. | ☑ Sim — dimensão máxima controlada e tentativas com proveniência | ☑ Sim — seis PDFs curtos recuperados; três livros tiveram reprocessamento/diagnóstico registrado, com limitações preservadas |
| C09 | Converter HEIC/SVG por entradas derivadas rastreáveis. | ☑ Sim — imagens e hashes preparados | ☑ Sim — duas prévias geradas; consistência e hashes registrados; fidelidade ainda pendente |
| C10a | Comparar os eventos escritos de Carinhoso com leitura assistida da fonte. | ☑ Sim — v5 com contexto de armadura e revisão cruzada, históricos preservados | ☑ Sim — 43 compassos/155 eventos; dez divergências originais corrigidas na nova cópia; zero contra essa referência assistida |
| C10b | Homologar referência e fidelidade completa de Carinhoso. | ☐ Não — texto/cifras OCR provisórios; nenhuma nota global | ☐ Não — conferência editorial humana e reprodução/navegação pendentes |
| C10c | Preparar dados OCR compatíveis e medir texto/cifras na mesma entrada. | ☑ Sim — modelos oficiais com commit/hashes fixados; tentativa isolada | ☑ Sim — Carinhoso: 97 entradas de letra/30 cifras; marcas indevidas 49→15; os dez erros de eventos não mudaram; generalização e homologação do texto pendentes |
| C11a | Mapear formatos, pares e exportar candidatos nativos. | ☑ Sim | ☑ Sim — 18 fontes, 17 com MusicXML candidato; 12 com falha após gravação; 4sc sem leitor |
| C11b | Comprovar equivalência musical e independência dos nativos. | ☐ Não | ☐ Não — sete grupos fortes por identidade; nenhuma referência homologada |
| C12 | Homologar alturas, acidentes, pausas, vozes, duração e navegação dos 65 PDFs de até três páginas. | ☐ Não — referências candidatas e avaliador disponíveis | ☐ Não — quatro PDFs aprovados integralmente e um parcial; consistência automática não comprova fidelidade |
| C13 | Separar livros/métodos/coleções em obras ou exercícios revisáveis. | ☐ Não — fora das novas correções desta rodada quando o PDF excede três páginas | ☐ Não — histórico preservado; atividade não executada nesta rodada |
| C14 | Disponibilizar editor de classificação de páginas e correções no produto. | ☐ Não — decisões internas verificadas e prévia existentes | ☐ Não — interface por trecho pendente |
| C15 | Usar erros conferidos em regressões e avaliação de melhorias. | ☐ Não — catálogo de erros e versões preparado | ☐ Não — conjunto independente por obra e comparação antes/depois pendentes |
| C16 | Treinar e promover novo modelo de reconhecimento. | ☐ Não | ☐ Não — aprovação de arquivo não autoriza automaticamente treinamento |
| C17 | Entregar pacote rastreável de prévias e pendências. | ☑ Sim — pacote v4 e histórico preservado | ☑ Sim — 183 variantes XML de 124 fontes; hashes/estrutura conferidos e ZIP validado; 148 originais intactos |
| C18 | Exigir duas leituras independentes completas, cobertura e versão exata antes de aprovar. | ☑ Sim — gate separa eventos, música escrita e edição completa; inclui pauta, ambiguidades e histórico de adjudicação | ☑ Sim — aprovações e bloqueios com provas e hashes; testes de alteração, circularidade e cobertura |
| C19 | Comparar integralmente os eventos de exportações MSCZ com duas implementações. | ☑ Sim — leitores JavaScript e Python independentes | ☑ Sim — 14 fontes examinadas; oito exportações/3.958 notas e pausas exatas; seis com recursos sem interpretação; equivalência com PDF continua pendente |
| C20a | Conferir e aprovar a música e letra impressas em Laudemus. | ☑ Sim — leituras seladas, erros dos revisores preservados e adjudicados | ☑ Sim — 37 notas/110 sílabas; três transcrições (duas versões de Laudemus e Splendens), sem realização das vozes adicionais do cânone |
| C20b | Conferir e aprovar O Cravo Brigou com a Rosa. | ☑ Sim — sete compassos de pausa e feixes restituídos em cópia | ☑ Sim — 71 eventos, 26 compassos lógicos; fonte compartilhada com Atirei não recebe aprovação integral |
| C20c | Conferir e aprovar Little Rondo. | ☑ Sim — duas leituras completas; referência inicial com quatro erros preservada e corrigida pela fonte | ☑ Sim — 135 eventos em duas pautas; dinâmicas, posição de clave, barra inicial e créditos corrigidos; layout fac-símile e execução sonora fora do escopo |
| C20d | Resolver os acidentes e aprovar Atirei o Pau no Gato. | ☑ Sim — 103 eventos registrados; pausa m16 corrigida; cinco Fás destacados | ☐ Não — alterações efetivas em m8/m20 permanecem ambíguas; confirmação solicitada ao usuário |
| C20e | Conferir e aprovar a parte de baixo de Purcell. | ☑ Sim — cópia V1 preservada separadamente do original | ☑ Sim — 40 compassos/101 notas, clave G8, quatro andamentos, repetições e textos; duas leituras da fonte, reexame e teste da convenção de oitava; três PDFs integralmente aprovados no lote, além de Folclore parcial |
| C20f | Conferir e aprovar o Minueto da fotografia de livro. | ☐ Não — duas leituras seladas; mapa de divergências preservado | ☐ Não — 32 compassos após cotejo, 58 posições de altura divergentes; dois candidatos de sete compassos rejeitados por cobertura |
| C20g | Conferir e aprovar CSM100 — música, letra, estrofes e créditos. | ☑ Sim — edição V2 separada dos candidatos anteriores | ☑ Sim — 85 notas/32 compassos, 80 sílabas e cinco prolongamentos; duas leituras reconciliadas e revisão da versão exata; quatro PDFs integralmente aprovados e um parcial no lote |
| C20h | Conferir e aprovar Alle Psalite e Tourdion, preservando todas as partes. | ☐ Não — leituras independentes seladas ou em andamento | ☐ Não — cotejo e edição final pendentes; nenhum candidato recebe aprovação antecipada |
| C21 | Registrar erros de reconhecimento, referência e validador separadamente, com regressões reais. | ☑ Sim — [catálogo confirmado](validation/acervo-review-2026-10-07/CONFIRMED_ERRORS.md) | ☑ Sim — 53 testes focados: 43 de aprovação/eventos/casos reais e dez de empacotamento; inclui G8/último compasso de Purcell, erros de CSM100 e alteração posterior de prova; não é avaliação de um modelo novo |
| C22 | Entregar pacote das cópias aprovadas e fila explícita do restante. | ☑ Sim — [fila de aprovação](validation/acervo-review-2026-10-07/APPROVAL_QUEUE.md), recalculada pelas provas e limitada a três páginas | ☑ Sim — snapshots anteriores preservados; versão atual com sete transcrições aprovadas, oito exportações de eventos nativos e uma prévia pendente; CRC, 25 entradas e hashes do ZIP conferidos independentemente; dez testes do empacotador passaram, inclusive alteração posterior de parecer |
| C23 | Corrigir os andamentos internos de compasso no MIDI/timeline do app. | ☑ Sim — API/player sincronizados nas posições verificáveis | ☑ Sim — regressão local de Purcell: quatro tempos, 162 notas/cursor, duração e trilhas instrumentais; repetições/tempo tardio em testes; homologação sonora/aparelhos pendente |
| C24 | Restringir novas correções aos PDFs de até três páginas físicas. | ☑ Sim — escopo explícito por hash e filtro da fila | ☑ Sim — 65 PDFs/125 páginas incluídos; 47 PDFs/1.679 páginas fora desta rodada |
| C25 | Reutilizar preparações idênticas e localizar divergências para revisão no produto. | ☑ Sim — hash, aliases, diagnósticos versionados e página do original | ☑ Sim — [358 testes e lint/build locais](validation/process-improvements-2026-10-07/REPORT.md); sem retomada da revisão manual ou novas aprovações |
| C26 | Coletar geometria de pauta e comprovar detecção de cobertura incompleta na fonte. | ☑ Sim — coleta positiva e aviso auxiliar com layout explícito; sombra larga corrigida | ☐ Não — os três rasters reais ainda são subestimados; ausência de aviso é inconclusiva |

## Política de página

Sem cinco linhas detectáveis, a página fica **incerta**. Com linhas compatíveis, fica **musical identificada**; isso ainda não comprova notas corretas. A exclusão interna exige leitura visual, motivo, revisor e hashes do PDF e da imagem original. A cobertura distingue processadas, ausentes e excluídas; incerteza e notação não suportada continuam visíveis. Quartetos, notação antiga e tablatura são possíveis limitações de suporte, não documentos não musicais.

A confirmação da capa não exclui outras páginas. Uma capa fora da contagem musical continua na contagem física. Páginas musicais ausentes e classificação incerta mantêm resultado parcial. A revisão da prévia é obrigatória antes da entrega oficial, conforme preferência do usuário.

A revisão de 30 páginas sem PAGE encontrou 20 não musicais, nove musicais e uma incerta por conflito. As 20 decisões negativas foram incorporadas com hashes e evidências. O diagnóstico de Pozzoli confirma música rítmica sem pauta tradicional, que deve continuar elegível e pode exigir outro leitor.

O caso de tabela administrativa revelou uma limitação real: linhas de tabela podem parecer pautas ao detector geométrico. Os quatro conflitos foram preservados. O acervo separou o documento com base na inspeção visual, mas não forçou a política do produto a aceitar uma classificação contraditória.

## Registro e melhoria

Cada ocorrência guarda fonte/SHA, página física quando disponível, parte/compasso quando conhecidos, etapa, código, evidência, versão do motor e estado da confirmação. Um alerta interno não vira automaticamente uma nota errada.

| Categoria | Exemplos | Evidência para confirmar |
| --- | --- | --- |
| Preparação/entrada | Imagem acima do limite; estrutura PDF recuperável | Mensagem do leitor, dimensões e hashes |
| Classificação | Capa/texto incerto; tabela parecida com pauta | Original visualmente conferido; decisão e conflito preservados |
| Reconhecimento musical | Altura, acidente, duração ou pausa divergente | Evento alinhado com leitura do original |
| Estrutura/cobertura | Página, pauta, voz ou parte ausente | Identidade e mapa fonte–saída; atingir PAGE no motor não basta |
| Consistência XML | Compasso longo/curto, casa ou repetição sem fechamento | Alerta reproduzível; fonte confirma erro ou contexto legítimo |
| Suporte/operação | Formação não suportada, timeout, exportação falha | Contrato observado ou falha operacional; fonte não é anulada |

Uma melhoria segue o ciclo: preservar antes → confirmar na fonte → aplicar patch em cópia → revalidar → registrar regressão → comparar versão nova em obras separadas. Variantes da mesma peça pertencem ao mesmo grupo de avaliação para evitar vazamento. Nenhuma saída do lote automático recebe precisão global, aprovação final ou elegibilidade para treinamento automaticamente. As cópias aprovadas na revisão posterior têm decisões por SHA e escopo em `validation/acervo-review-2026-10-07/approvals/`; essa aprovação assistida não transforma arquivos nativos em verdade independente de um PDF, nem autoriza treino.

## Reprodução local

Os leitores foram usados em volumes temporários somente leitura e desmontados após a execução; os originais não foram instalados nem modificados. Antes de uma nova execução, disponibilize novamente as versões do leitor registradas ou informe o executável em --engine. Saídas internas, imagens e logs estão em `output/omr/corpus-partituras-2026-10-07/`.

```sh
node --import tsx scripts/corpus-convert.mts --phase all --jobs 2
node scripts/corpus-report.mjs
node --import tsx scripts/corpus-retry-prepared.mts --assisted docs/validation/corpus-partituras-2026-10-07/catalog/assisted_review_supplemental_v3.json
```

Retomadas verificam hashes de sucessos. `--retry-failed` cria uma tentativa nova e conserva as anteriores. A primeira passagem usa o leitor PDF interno do Audiveris; o retrabalho preparado usa o fluxo de imagens do aplicativo. Essa diferença fica registrada.

Evidência local: API 125 testes aprovados e cinco opt-in de banco não executados; web 111 e mobile 78 aprovados antes do ajuste final de texto. Após esse ajuste, 15 testes focados web e sete mobile passaram. Quatro testes do executor validam falhas, retomada, preservação e cancelamento; três testes da inspeção nativa, cinco da fila preparada, dois da recuperação nativa, cinco de resolução/subsets, quatro do empacotamento e um da consolidação do relatório passaram. Sem deploy, atualização de banco ou builds de loja.

## Entrega do lote

[Prévias MusicXML — ZIP](../output/omr/corpus-partituras-2026-10-07/review-pack/partituras-previas-para-revisao-2026-10-07.zip) contém 183 variantes, incluindo alternativas, fragmentos e exportações nativas; não são 183 obras homologadas. O [índice](../output/omr/corpus-partituras-2026-10-07/review-pack/snapshot-v4-d30b327b160de2d5/index.md) registra cada método e os limites de cobertura. Os [sete PDFs sem XML](validation/corpus-partituras-2026-10-07/UNCONVERTED.md) têm próximos tratamentos separados. O formato nativo 4sc também permanece sem leitor.

[Integridade dos originais](validation/corpus-partituras-2026-10-07/source-integrity.json): 148/148 arquivos inalterados na conferência final. [Integridade do ZIP](validation/corpus-partituras-2026-10-07/delivery-archive.json): 185 entradas verificadas, sendo 183 XMLs, índice e manifesto.

Verificação final do processo: 30 testes de fila, retomada, cancelamento, resolução limitada, subsets, preservação de tentativas, consolidação, comparação de eventos e empacotamento passaram. O pacote mantém todas as prévias como revisão pendente e não habilita treinamento.
