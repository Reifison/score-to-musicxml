# Confiabilidade da conversão

Consolidado em 2026-10-06 após a entrevista grill-with-docs; revisão local acrescentada em 2026-10-07. As decisões abaixo foram respondidas pelo usuário; falta a confirmação final do contrato completo. Estado e evidências no [roadmap central](PROJECT_ROADMAP.md).

## Objetivo e escopo

Entregar MusicXML revisável a partir de notação tradicional impressa, em PDFs nítidos ou fotos bem alinhadas. O resultado pode precisar de correções pontuais e deve ser conferido com o original em um editor musical; gerar um arquivo não comprova fidelidade musical.

O usuário seleciona o tipo antes de enviar:

| Tipo | Requisito |
| --- | --- |
| Melodia | Preservar a linha musical e suas vozes. Incluir exercícios curtos. |
| Piano | Preservar as duas pautas e suas claves, sem perder o conteúdo de uma delas. |
| Violão solo | Pauta tradicional; preservar as vozes da parte instrumental. |
| Duo de violões | Um arquivo com a partitura conjunta: duas pautas em clave de sol, Violão 1 e Violão 2 como partes instrumentais distintas e sincronizadas. |

O núcleo obrigatório inclui notas, pausas, ritmos, vozes, compassos e repetições simples. Ligaduras que alteram a duração pertencem ao núcleo de ritmo.

Dedilhado, indicação de cordas e posições não são necessários à meta inicial. Casas de primeira/segunda vez, Da Capo, Dal Segno e codas ficam fora do escopo inicial de repetições simples.

## Integridade e resultados parciais

Há duas situações diferentes:

- **Páginas inteiras ausentes:** permitir um resultado parcial com aviso destacado e identificação das páginas não reconhecidas. Isso vale também para duo e piano quando todas as pautas e partes obrigatórias das páginas disponibilizadas estiverem preservadas. O usuário confirmou a regra A na Q24.
- **Parte ou pauta obrigatória ausente dentro de uma página:** falha da conversão inteira. Não entregar somente Violão 1 de um duo, somente Violão 2, nem somente uma das duas pautas de piano como resultado parcial utilizável. Não transformar essa perda em omissão silenciosa da página.

Exemplo permitido: de dez páginas de duo, duas falham completamente e as oito restantes preservam ambos os violões. Exemplo de falha: uma página reconhecida perdeu um dos violões, ainda que outras páginas tenham sido reconhecidas.

As operações por resultado ficam assim:

| Resultado | Visualização digital | Exportação MusicXML | Player e MIDI |
| --- | --- | --- | --- |
| Documento processado com todas as páginas e pautas/partes obrigatórias | Disponível para revisão | Final oficial após confirmar a versão | Após confirmar a versão, se o tipo permitir |
| Parcial apenas por páginas inteiras ausentes, com integridade nas páginas mantidas | Disponível com aviso | Após confirmar a versão, com aviso e páginas ausentes identificadas | Bloqueados nesta etapa |
| Falha de integridade ou processamento sem resultado utilizável | Não liberar a saída dessa tentativa | Não liberar a saída dessa tentativa | Bloqueados para essa saída |

O bloqueio de player e MIDI de parciais permanece até existir tratamento explícito das lacunas. Ver [ADR 0001](adr/0001-exportar-resultados-parciais-com-cobertura-explicita.md).

Os estados acima se referem ao resultado de cada tentativa. Se uma nova tentativa falhar, o resultado anterior continua disponível segundo suas próprias condições de uso, e a falha nova é mostrada separadamente.

## Informação de qualidade e captura

Retirar a porcentagem atual de confiança. Mostrar fatos verificáveis, como páginas processadas, páginas ausentes, tipo selecionado e partes/pautas reconhecidas nos controles disponíveis, acompanhados de orientação de revisão.

Esses controles de cobertura não substituem comparação musical com o original. Não apresentar o documento como musicalmente validado apenas porque todas as páginas passaram pelo processamento.

Aplicar critérios equivalentes a PDF e imagem, incluindo exercícios curtos. Poucos compassos ou notas, isoladamente, não tornam uma partitura inválida.

Se uma foto parecer inadequada, alertar, oferecer Refazer foto e permitir continuar. Padronizar esse comportamento entre web e telas mobile; as verificações de captura não devem bloquear automaticamente exercícios curtos legítimos.

## Retentativas e preservação

Por envio, permitir a tentativa inicial, uma retentativa automática para falhas temporárias e uma tentativa manual adicional, também disponível para resultados parciais.

Reprocessar o mesmo envio não consome outro scan, conforme a regra já documentada do projeto. Um novo envio continua sendo um novo scan.

Preservar o resultado anterior se a retentativa falhar e mostrar essa falha separadamente. Falha de captura ou configuração ausente exige orientação específica; não repetir automaticamente o mesmo material como se isso fosse resolver o problema.

## Protocolo de validação musical

Montar 20 partituras de referência, conferidas musicalmente: cinco melodias, cinco de piano simples, cinco de violão solo e cinco duos. Incluir exercícios curtos e os elementos do núcleo obrigatório.

Avaliar cada partitura em PDF e foto alinhada, totalizando 40 versões de entrada. Medir cada arquivo e cada parte instrumental separadamente; uma parte boa não pode esconder uma parte ruim, e a média do conjunto não substitui aprovação individual dos casos.

A meta inicial é de no máximo 2% de eventos incorretos por arquivo e parte, sem perda de compassos ou vozes nas páginas consideradas completas. Verificar também a preservação das repetições simples e das pautas/partes obrigatórias.

Regras de contagem:

- Considerar notas e pausas como eventos musicais.
- Contar erros de altura, duração, posição no tempo ou voz, além de eventos ausentes e extras.
- Uma nota com vários problemas conta como um único evento incorreto.
- Calcular a proporção de erros sobre a quantidade de eventos esperados na referência daquela parte.
- Manter o teto também em exercícios curtos: um erro em vinte eventos equivale a 5% e ultrapassa a meta.

Este teto ainda não foi homologado no corpus. A primeira comparação integral assistida de [Sons de Carrilhões](validation/sons-de-carrilhoes-integral-2026-10-07/report.md) mediu 23 ocorrências incorretas em 380 eventos escritos na saída automática: 6,05% de erro, acima da meta. A cópia manual corrigida coincide com a referência nesse escopo, mas não comprova melhora do motor. O corpus de 40 entradas e a homologação humana da referência permanecem pendentes. Envios sem referência não recebem uma nota de precisão apenas por passar nos controles de consistência.

O usuário envia PDF/foto/imagem, e o aplicativo cria o MusicXML. A exigência de referências conferidas pertence ao corpus de avaliação; não é um requisito para converter uma partitura real. O teste de Sons de Carrilhões foi iniciado com somente o PDF, conforme [relatório do caso](validation/sons-de-carrilhoes-2026-10-06/REPORT.md).

Separar a avaliação musical real dos testes de comportamento. Estes últimos devem cobrir páginas inteiras ausentes, perda de um violão, perda de uma pauta do piano, preservação de duas partes em clave de sol, mudanças de identificadores entre páginas, bloqueio de player/MIDI para parciais, retentativas e preservação do resultado anterior.

## Decisão adicional de revisão — 2026-10-07

Quando a revisão automática deixar notas ambíguas, mostrar prévia e pedir revisão antes de finalizar. Preferência escolhida explicitamente pelo usuário. Implementar estado de revisão musical distinto de cobertura e manter original, propostas de correção e decisões rastreáveis; aprovação nos controles de consistência não representa precisão medida de todas as notas.

Primeira implementação local concluída: diagnósticos por candidato antes da escolha, evidências privadas e estados `unverified`, `needs_review` e `approved`. Toda nova saída exige conferir a prévia; aprovação por usuário/admin autorizado vale somente para a revisão atual e não verifica a precisão das notas. O serviço checa o conteúdo do export e impede aprovação obsoleta ou durante nova tentativa. As regras de parcial, integridade e preservação continuam válidas; confirmar um parcial não libera reprodução. A prévia fornece bytes MusicXML para renderizar antes da aprovação, de modo que o bloqueio se refere à finalização/exportação oficial, não à impossibilidade técnica de copiar a prévia.

Resultados legados sem revisão identificável conservam download MusicXML, indicados como não verificados; não ganham aprovação, player ou MIDI automaticamente. A migration e a homologação no ambiente alvo estão pendentes. Evidências: [teste local do fluxo](validation/musical-review-flow-2026-10-07/REPORT.md).

Correções confirmadas devem alimentar regressões e avaliações das versões seguintes. Treinamento de modelos é uma etapa separada, com dados verificados, comparação em casos novos e promoção controlada. Ver [roadmap de validação e melhoria](MUSICAL_VALIDATION_AND_LEARNING_ROADMAP.md).

## Evidências históricas antes da implementação de 2026-10-06

Constatações da auditoria inicial, antes das correções locais posteriores. Esta tabela preserva o histórico e não descreve integralmente o código atual. Estado vigente no roadmap central e nos relatórios datados; implantação em produção não verificada.

| Evidência | Fonte |
| --- | --- |
| O caminho normal do Audiveris retorna pontuação fixa de 0,75; páginas que falham podem ser omitidas, e a confiança considera apenas páginas convertidas. | [OmrAdapter.ts](../apps/api/src/services/OmrAdapter.ts) |
| O serviço libera resultado com pontuação de pelo menos 0,70, sem comparação musical com o original. | [ScoreConversionService.ts](../apps/api/src/services/ScoreConversionService.ts) |
| A junção toma os identificadores de partes da primeira página convertida, associa páginas por esses identificadores e renumera os compassos. Partes que só aparecem depois não são acrescentadas. | [OmrAdapter.ts](../apps/api/src/services/OmrAdapter.ts) |
| A barreira mínima de quatro compassos e oito ocorrências de notas só se aplica a imagens; pode rejeitar exercícios curtos legítimos. | [OmrAdapter.ts](../apps/api/src/services/OmrAdapter.ts), [omrAdapter.test.ts](../apps/api/src/tests/omrAdapter.test.ts) |
| A web mostra Confiança estimada em porcentagem e alertas; a tela mobile de detalhe consultada não apresenta esses alertas. | [ScoreDetails.tsx](../apps/web/src/components/ScoreDetails.tsx), [score/[id].tsx](../apps/mobile/app/score/[id].tsx) |
| Player e MIDI usam o MusicXML sem receber correspondência com páginas omitidas; trechos sobreviventes podem tocar consecutivamente. | [ScorePlayer.tsx](../apps/web/src/components/ScorePlayer.tsx), [ScorePlayerWebView.tsx](../apps/mobile/src/player/ScorePlayerWebView.tsx), [ScoreService.ts](../apps/api/src/services/ScoreService.ts) |
| Não há rota de reprocessamento. Erros OMR tratados retornam normalmente com estado failed, sem provocar a retentativa configurada da fila nesse caminho. | [scoreRoutes.ts](../apps/api/src/routes/scoreRoutes.ts), [ScoreConversionService.ts](../apps/api/src/services/ScoreConversionService.ts), [ScoreConversionQueue.ts](../apps/api/src/queues/ScoreConversionQueue.ts) |
| O registro persiste texto do erro, mas não sua categoria estruturada. | [domain.ts](../apps/api/src/domain.ts), [schema.prisma](../prisma/schema.prisma) |
| A avaliação de foto varia entre as telas mobile; a web consultada não faz essa avaliação. | [index.tsx](../apps/mobile/app/index.tsx), [scores.tsx](../apps/mobile/app/scores.tsx), [UploadPanel.tsx](../apps/web/src/components/UploadPanel.tsx) |
| Os testes encontrados verificam regras e MusicXML/MIDI, sem corpus OMR real com referências para medir precisão musical. O teste com Guitar 1/2 é sintético; o timbre de violão no player não comprova reconhecimento de partituras de violão. | [omrAdapter.test.ts](../apps/api/src/tests/omrAdapter.test.ts), [fixtures/midi](../apps/api/src/tests/fixtures/midi), [PlaybackControls.tsx](../apps/web/src/components/PlaybackControls.tsx) |

## Documentos relacionados

- [Glossário](../GLOSSARY.md)
- [ADR 0001 — Exportação parcial com cobertura explícita](adr/0001-exportar-resultados-parciais-com-cobertura-explicita.md)
- [Roadmap de implementação e validação](CONVERSION_RELIABILITY_ROADMAP.md)

## Restauração de escuta — 2026-10-08

O pedido de resgatar o player MIDI atualiza as restrições históricas de reprodução descritas neste documento. Partituras convertidas com MusicXML disponível podem ser ouvidas, inclusive versões antigas e resultados parciais. Falhas técnicas MIDI continuam impedindo a execução. O aviso de parcial informa que somente os trechos convertidos serão tocados; não há áudio nem duração inventada para páginas ausentes. A exportação MIDI conserva os requisitos de resultado completo e validação próprios.

O acompanhamento visual destaca notas, acordes, pausas e o compasso, rola dentro da partitura e muda de página pela localização real do compasso. A implementação local preserva o fluxo de entrega automática e a retirada da aprovação manual feitos na conversa de auditoria. Evidências e limites: [registro da restauração](validation/player-restoration-2026-10-08/REPORT.md).
