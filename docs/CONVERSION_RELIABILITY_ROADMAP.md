# Roadmap — Confiabilidade da conversão

Atualizado em 2026-10-07. Derivado do [contrato de confiabilidade](CONVERSION_RELIABILITY.md). A confirmação final do entendimento compartilhado está pendente. A implementação local avançou em 2026-10-06; a validação musical e a homologação em ambiente real permanecem pendentes. O estado atual está no [roadmap central](PROJECT_ROADMAP.md).

Cada atividade usa uma marcação explícita de conclusão. Marcar somente após obter evidência; implementação e validação têm atividades separadas.

## Definição e documentação

- [x] Investigar o fluxo atual e registrar evidências do código. Concluído em 2026-10-06; fontes no contrato de confiabilidade.
- [x] Registrar as decisões respondidas pelo usuário e consolidar o contrato de conversão. Concluído em 2026-10-06; respostas Q1–Q24.
- [x] Criar e atualizar o glossário e o ADR da política de exportação parcial. Concluído em 2026-10-06; GLOSSARY.md e ADR 0001.
- [ ] Confirmar com o usuário que o contrato consolidado representa o entendimento compartilhado.

## Linha de base musical

- [ ] Preparar as 20 partituras de referência, cinco de cada categoria, e conferir suas referências musicais.
- [ ] Preparar PDF e foto alinhada de cada referência, incluindo exercícios curtos, duas pautas de piano e duas partes de violão em clave de sol; total de 40 versões de entrada.
- [ ] Medir o comportamento do pipeline atual em cada arquivo e parte, registrando erros, perdas estruturais e limitações de repetição simples.

## Modelo e processamento

Feita? Sim na implementação local de 2026-10-06. Schema/migration preparados; testes estruturais e de tentativas passaram. A migration não foi aplicada em ambiente e o corpus real ainda não foi executado.

- [x] Implementar a seleção e persistência do tipo de partitura.
- [x] Registrar cobertura por página, pautas/partes esperadas e reconhecidas, resultado da tentativa e categoria da falha.
- [x] Implementar a regra de parcial apenas por páginas inteiras ausentes; perda de pauta ou parte obrigatória deve falhar a conversão inteira.
- [x] Corrigir a associação de partes entre páginas, preservando Violão 1/2, pautas de piano, vozes e correspondência com as páginas originais.
- [x] Substituir a barreira mínima de tamanho musical por verificações equivalentes para PDF e imagem que aceitem exercícios curtos legítimos.
- [x] Implementar uma retentativa automática para falhas temporárias e uma manual adicional, incluindo parciais, sem consumir novo scan pelo mesmo envio.
- [x] Preservar o resultado anterior em caso de falha da nova tentativa e registrar a falha separadamente.

## Interface e exportações

Feita? Sim nos fontes em 2026-10-06; testes web/mobile e sessão web preparada registrados no [relatório local](validation/implementation-2026-10-06/REPORT.md). A homologação nativa permanece separada.

- [x] Retirar a porcentagem de confiança e exibir cobertura, falhas e orientação de revisão na web e no mobile.
- [x] Exibir aviso destacado e identificar páginas ausentes na visualização e exportação MusicXML parcial.
- [x] Bloquear reprodução e MIDI de parciais na interface e no backend, conforme as superfícies aplicáveis, preservando o uso do resultado anterior quando uma retentativa falhar.
- [x] Padronizar avisos de captura: Refazer foto ou continuar, sem bloquear exercícios curtos por heurísticas de qualidade.

## Validação de comportamento

As marcações concluídas nesta seção registram testes locais da API e MusicXML preparado; não equivalem à validação musical do acervo ou a aparelhos nativos.

- [x] Validar duo com duas partes distintas em clave de sol e piano com suas duas pautas, incluindo pausas e múltiplas vozes.
- [x] Validar falha da conversão inteira quando faltar um violão ou uma pauta obrigatória.
- [x] Validar parcial por página inteira ausente, aviso, páginas identificadas, visualização/MusicXML disponíveis e player/MIDI bloqueados.
- [x] Validar associação de partes entre páginas e aceitação de exercícios curtos em PDF e imagem.
- [x] Validar limites e condições de retentativa, quota do mesmo envio e preservação do resultado anterior.
- [x] Validar os mesmos estados, avisos e bloqueios nos testes locais web/mobile e na sessão web preparada de 2026-10-06.
- [x] Validar envio e chegada ao resultado real de Sons de Carrilhões no Chrome. Concluído em 2026-10-07; [relatório web](validation/web-real-score-2026-10-07/REPORT.md), com prévia original/digital, controles e respostas de exportação; sem nova medição de precisão musical.
- [ ] Homologar os estados, avisos e bloqueios em aparelhos de release com referência real.

## Validação musical

- [x] Converter um PDF real adicional de violão solo com Audiveris 5.10.2 e registrar as limitações. Concluído em 2026-10-06; [Sons de Carrilhões](validation/sons-de-carrilhoes-2026-10-06/REPORT.md), duas páginas, 35 compassos, prévia corrigida para conservar as 371 notas do XML. Sem referência conferida ou comprovação de precisão.
- [x] Corrigir uma cópia de Sons de Carrilhões nos compassos 15 e 21, preservando o resultado automático. Concluído em 2026-10-07; [revisão e auditoria](validation/sons-de-carrilhoes-revisao-2026-10-07/REPORT.md), com novo MIDI/áudio e diagnóstico de duração antes/depois. Repetições, casas e Segno/Fine/D.S. também restaurados e verificados no mapa de tempo real.
- [x] Implementar e validar avisos automáticos de duração dos compassos, preservando anacruses explicitamente marcadas, acordes e vozes simultâneas. Concluído em 2026-10-07; integração e regressões incluídas nos 98 testes padrão da API. Não comprova precisão de alturas/vozes ou todos os ritmos internos.
- [ ] Revisar integralmente Sons de Carrilhões: feixe/ligadura e digitações/articulações; conferir todas as notas antes de tratá-lo como referência. A navegação da cópia já foi verificada separadamente.
- [ ] Corrigir e verificar a restauração de métrica ao voltar em repetição com mudança de compasso no MIDI; limitação sintética registrada, ausente em Sons de Carrilhões.
- [ ] Executar as 40 versões de entrada após os ajustes e salvar o relatório de resultados por arquivo e parte.
- [ ] Comprovar o teto de 2% de eventos incorretos em cada caso de referência, sem perda de compassos, vozes, pautas ou partes nas páginas consideradas completas, e verificar as repetições simples.
- [ ] Registrar a revisão musical das referências e dos resultados, incluindo separadamente eventuais casos fora da meta; manter a comprovação acima pendente enquanto houver casos reprovados.

Atualizar cada marcação com data e referência da evidência quando o trabalho correspondente terminar. A execução do corpus pode estar concluída mesmo com reprovações; a comprovação da meta permanece pendente até todos os casos exigidos atenderem aos critérios.

## Revisão visual integrada — 07/10/2026

- [x] **Feita? Sim — Executar etapa visual permanente** depois do OMR, com leitor local independente configurável, fontes privadas e limites de até 3 páginas físicas/200 compassos de parte.
- [x] **Feita? Sim — Publicar decisões com revisão-base**, arquivos imutáveis, revalidação e limpeza segura em conflitos/reprocessamento.
- [x] **Feita? Sim — Exibir propostas e trechos desconhecidos na web/mobile**, impedindo finalizar com propostas pendentes.
- [ ] **Feita? Não — Homologar precisão e cobertura do segundo leitor** em um conjunto musical conferido; concordância ou decisão do usuário não constitui aprovação do acervo.
- [ ] **Feita? Não — Verificar a nova transação em PostgreSQL e a entrega em produção/aparelhos**. Consulte [relatório](validation/source-visual-review-2026-10-07/REPORT.md) e [operação](SOURCE_VISUAL_REVIEW.md).
