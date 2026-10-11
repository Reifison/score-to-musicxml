# Roadmap — validação, correção e melhoria musical

Atualizado em 2026-10-10. Este plano registra a evolução solicitada pelo usuário: avaliar e corrigir o reconhecimento antes da entrega, usar correções confirmadas para reduzir erros futuros e mostrar prévia com pedido de revisão quando restarem ambiguidades. Ele complementa o [roadmap central](PROJECT_ROADMAP.md) e o [contrato de conversão](CONVERSION_RELIABILITY.md).

**Feita?** distingue código implementado, validação e decisões de produto. Uma proposta, um teste de consistência ou uma correção manual não significa precisão musical comprovada nem treinamento realizado.

## Caso Adelita — 10/10/2026

- [x] **Feita? Sim — Publicar revisão e ajuste da tela em 11/10/2026.** XML/MIDI, prévia e reprodução conferidos em produção; originais e auditoria preservados. [Publicação](validation/publication-2026-10-11/REPORT.md).

- [x] **Feita? Sim — Revisar a conversão recebida contra o fac-símile e a execução de referência.** 16 compassos, 147 eventos escritos, 12 graces; baixos/acordes omitidos, ritmo, acidentes, ties e navegação corrigidos numa cópia. [Relatório e limitações](validation/adelita-2026-10-10/REPORT.md).
- [x] **Feita? Sim — Verificar a reprodução da cópia corrigida.** AA BB AA, 48 compassos executados, violão nylon e 376 alturas sonoras comparadas. Um sustenido efetivo entre vozes que se perdia no Verovio foi resolvido com acidente explícito de cortesia; antes/depois preservado.
- [x] **Feita? Sim — Registrar o caso e regressões de fonte/reprodução.** [Pacote Adelita](../source-ledgers/adelita-2026-10-10/README.md) contém original, conversão, revisão e ledger; [15 classes de achados](validation/adelita-2026-10-10/corrections.json) ligadas às evidências. A numeração dos compassos não é uma regra automática.
- [ ] **Feita? Não — Homologar humanamente a referência e conferir integralmente dedilhados/cordas.** Elegibilidade para treinamento permanece desativada.
- [ ] **Feita? Não — Incorporar e medir melhorias gerais em peças novas.** Prioridades: cobertura de vozes internas, graces/portamentos, slur versus tie, acidentes entre vozes e navegação sonora. O verificador genérico ainda declara escopo incompleto em arranjos com graces/acordes; esta peça teve prova independente específica.
- [ ] **Feita? Não — Treinar ou promover um modelo a partir deste caso.** Registro e regressões não equivalem a aprendizado do reconhecimento.

## Regras aprendidas incorporadas em 2026-10-07

- [x] **Feita? Sim — Bloquear aplicação isolada de mudanças rítmicas e propostas sem recorte confiável.** A revisão manual continua disponível; ambiguidades não são transformadas em verdade de treinamento.
- [x] **Feita? Sim — Conferir MIDI por versão antes da prévia e depois das decisões.** Relatório inclui limites e diagnósticos; divergências detectadas impedem áudio e preservam XML para revisão.
- [x] **Feita? Sim — Corrigir ligadura em primeira casa pulada na reprodução web/mobile e no download MIDI.** Regra geral com fixture de regressão e teste local de Carinhoso.
- [x] **Feita? Sim — Registrar e mostrar aceite com ressalvas.** Sem inventar percentuais de fidelidade a partir da confiança do leitor.
- [x] **Feita? Sim — Verificar a integração local.** 431 testes passaram e compilação local concluída; os testes de PostgreSQL e aparelhos permanecem separados.
- [x] **Feita? Sim — Publicar API, worker, web e leitor visual Linux, verificando conversão real, revisão e downloads.** [Evidências da publicação](validation/musical-learning-2026-10-07/PUBLICATION.md).
- [ ] **Feita? Não — Atualizar aplicativos nas lojas, verificar em aparelhos e medir redução dos erros em peças novas.** Publicação e funcionamento não comprovam aumento de precisão do leitor.

## Decisão confirmada e ponto de partida

- [x] **Feita? Sim — Preparar o acervo local e registrar erros por etapa.** [Roadmap C01–C16](CORPUS_CONVERSION_AND_VALIDATION_ROADMAP.md): inventário, deduplicação, capas/textos conferidos e tentativas rastreáveis. [Resultados do lote](validation/corpus-partituras-2026-10-07/BATCH_RESULTS.md).
- [ ] **Feita? Não — Homologar notas e ritmos de todo o acervo.** Consistência automática e identidade das referências não substituem comparação integral com as fontes; correções não treinam o modelo automaticamente.
- [x] **Feita? Sim — Limitar a rodada atual aos PDFs de até três páginas físicas.** 65 PDFs/125 páginas incluídos; 47 PDFs maiores preservados no histórico e fora das novas correções. [Escopo por hash](validation/acervo-review-2026-10-07/review-scope.json).
- [ ] **Feita? Não — Aprovar integralmente os 65 PDFs desta rodada.** Quatro PDFs aprovados integralmente e um parcial; a porcentagem de arquivos restantes é 93,85%, sem estimativa de esforço.
- [x] **Feita? Sim — Conferir e aprovar um primeiro lote com leituras independentes e decisões por versão.** Cinco transcrições, 243 eventos: Laudemus (duas variantes), Splendens, O Cravo e Little Rondo. Atirei permanece retida por cinco acidentes ambíguos; o restante do acervo continua na [fila de revisão](validation/acervo-review-2026-10-07/APPROVAL_QUEUE.md).
- [x] **Feita? Sim — Conferir o registro da clave com oitava e a cobertura do último sistema em Purcell.** 40 compassos/101 notas aprovados após leituras independentes, reexame e prova de representação. Seis transcrições aprovadas no lote, 344 notas/pausas; erros de leitura dos próprios revisores registrados separadamente.
- [x] **Feita? Sim — Conferir e aprovar CSM100.** 85 notas/32 compassos, letra, estrofes e créditos; sete transcrições aprovadas somam 429 notas/pausas. Erros do candidato e dos próprios revisores separados; edição V2 vinculada ao hash.
- [ ] **Feita? Não — Concluir a conferência da fotografia do Minueto.** Duas leituras seladas, 32 compassos após cotejo e 58 posições de altura divergentes; dois candidatos de sete compassos rejeitados por cobertura. Nenhuma aprovação antecipada.
- [ ] **Feita? Não — Aprovar Alle Psalite e Tourdion.** Leituras independentes das três e quatro partes em cotejo ou andamento; edição final pendente.
- [x] **Feita? Sim — Implementar a correção geral dos andamentos dentro do compasso no MIDI/player.** Posições verificáveis sincronizadas e contextos sem mapeamento seguro diagnosticados.
- [x] **Feita? Sim — Validar localmente a reprodução corrigida de Purcell.** Quatro tempos, 162 notas/pontos do cursor, trilhas instrumentais preservadas e API/web equivalentes; repetições e andamento tardio em regressões. [Prova e limites](validation/process-improvements-2026-10-07/REPORT.md).
- [x] **Feita? Sim — Aplicar a etapa de localização e eficiência da revisão.** Tentativas byte a byte idênticas reutilizadas, divergências por página/parte/compasso e acesso à página original; evidências/códigos versionados. 358 testes e lint/build locais aprovados.
- [ ] **Feita? Não — Validar a cobertura pela geometria da fonte.** Coleta e aviso auxiliar implementados, mas os rasters de Purcell/Minueto/CSM100 continuam subestimados. Ausência de aviso não é comprovação de cobertura; V04–V06 e treinamento permanecem pendentes.
- [x] **Feita? Sim — Criar regressões de erros realmente conferidos.** Laudemus (nota omitida e tercinas falsas), pausa de sete compassos em O Cravo, pausa ausente em Atirei e bloqueio de acidentes incertos; derivação de oitavas enarmônicas e comparação por pauta também verificadas. Nenhuma promoção de modelo ou treino foi realizada.
- [x] **Feita? Sim — Ampliar e executar as regressões após Purcell e CSM100.** 53 testes focados passaram, incluindo omissões, pausas inventadas, durações/vozes, feixes, hashes das provas e integridade de pacote.

- [x] **Feita? Sim — Registrar a preferência de entrega.** Em 2026-10-07, o usuário escolheu mostrar prévia e pedir revisão antes de finalizar. A primeira implementação está disponível localmente na API, web e mobile; publicação e homologação em aparelho continuam separadas.
- [x] **Feita? Sim — Implementar avisos gerais de duração.** `MusicXmlRhythm.ts` e `ScoreConversionService.ts`; 34 compassos verificáveis do caso real, dois alertas na saída original, nenhum após correções confirmadas. São verificações de consistência da parte inteira, sem comparação visual com a fonte.
- [x] **Feita? Sim — Corrigir problemas gerais de importação já identificados.** Preservação de anacruse 0, associação de partes/pautas entre páginas e remoção de beams redundantes dos membros de acordes, sem apagar notas. Timbre de violão usa a escolha explícita do usuário. Evidência no [caso real](validation/sons-de-carrilhoes-2026-10-06/REPORT.md).
- [x] **Feita? Sim — Registrar uma revisão específica auditada.** [Sons de Carrilhões](validation/sons-de-carrilhoes-revisao-2026-10-07/REPORT.md): ritmo/vozes em 15, nota extra em 21, início de repetição em 18, encerramento da casa em 34 e Segno/Fine/D.S. conferidos na fonte e na sequência de reprodução. Essas correções estão numa cópia privada; não são regras automáticas aplicadas a todos os PDFs.
- [x] **Feita? Sim — Concluir a comparação assistida dos eventos escritos desse PDF.** Conferidos 35 compassos, 373 eventos de notas e sete pausas; acidentes, feixes, ligaduras e marcações de execução candidatos também revisados. Saída automática: 23 ocorrências incorretas em 380 eventos esperados, nota 9,39/10 no escopo escrito. Cópia corrigida: zero divergências nesse escopo. [Relatório integral](validation/sons-de-carrilhoes-integral-2026-10-07/report.md). O PDF foi a fonte; o usuário não precisou fornecer MusicXML.
- [ ] **Feita? Não — Homologar editorialmente a referência e completar dedilhados/cordas/posições.** A leitura assistida não substitui aprovação humana independente; estas indicações técnicas não foram transcritas integralmente e ficam fora da nota inicial.

## O que significa avaliar uma conversão

Há três resultados diferentes:

| Avaliação | O que comprova | O que não comprova |
| --- | --- | --- |
| Cobertura e integridade | Páginas e partes/pautas esperadas foram processadas e preservadas nos controles disponíveis. | Que todas as notas e durações correspondem à impressão. |
| Consistência musical | Fórmulas de compasso, posições temporais, relações entre eventos e navegação não têm as anomalias verificadas. | Que uma nota foi lida na linha certa ou que uma omissão foi compensada por outra duração errada. |
| Precisão contra referência conferida | Eventos ausentes, extras ou incorretos comparados a uma leitura completa do original. | Precisão igual em todas as outras partituras ou garantia de ausência de erros. |

Um compasso pode fechar em 2/4 com um Fá no lugar de um Sol. Somar corretamente as durações não identifica esse erro. Duas leituras do mesmo motor também podem concordar no mesmo erro; concordância é evidência adicional, não referência independente.

A nota medida exige definir a contagem de eventos esperados e comparar alturas, duração, posição temporal e voz, contando omissões e extras. Manter a regra de uma ocorrência incorreta por evento mesmo quando ele tem vários problemas. Preservar reprovação por perda estrutural: uma pontuação média boa não compensa perder uma pauta de piano. O primeiro caso assistido mediu 6,05% de erro na saída automática, acima da meta contratual de até 2%; homologação e corpus completo continuam pendentes.

Para envios sem referência conferida, apresentar resultados dos controles e trechos a revisar. Uma futura estimativa numérica exigirá calibração em casos rotulados e separados do treinamento; não reutilizar o antigo percentual fixo de confiança nem chamar ausência de alertas de precisão de 100%.

## Fluxo de revisão e evolução

- [ ] **Feita? Não — Etapa 1 completa.** Original, páginas, hashes e imagens preservados; mapa automático de sistemas/compassos e todas as transformações ainda pendentes.
- [x] **Feita? Sim — Etapa 2.** Produzir e conservar leituras alternativas do reconhecimento.
- [x] **Feita? Sim — Etapa 3.** Verificar cada leitura antes de escolher e juntar páginas: integridade, ritmo e navegação, declarando contexto ausente.
- [ ] **Feita? Não — Etapa 4 no aplicativo.** Comparar suspeitas com recortes do original e propor correções visuais; realizado por revisão assistida somente neste caso.
- [ ] **Feita? Não — Etapa 5 no aplicativo.** Aplicar patches justificados com antes/depois e revalidar; há cópia manual rastreável, falta o mecanismo do produto.
- [x] **Feita? Sim — Etapa 6.** Mostrar prévia e solicitar revisão antes de finalizar. Processar páginas não encerra essa revisão.
- [x] **Feita? Sim — Etapa 7.** Liberar MusicXML/MIDI oficiais da versão confirmada segundo cobertura/tipo e registrar versão do processo.
- [ ] **Feita? Não — Etapa 8 completa.** Há avaliador inicial e regressões de comportamento; corpus verificado e treinamento separado ainda pendentes.

As etapas 1–3 e 6–7 têm uma primeira implementação local. Cada candidato recebe verificações antes da escolha; os controles sem contexto suficiente são registrados como não executados. A saída juntada recebe uma nova verificação, inclusive por voz. Novas saídas ficam `needs_review` mesmo sem alertas, porque não houve comparação automática de alturas com a imagem. A prévia carrega MusicXML antes da revisão; a exportação final oficial, player e MIDI exigem confirmação da versão atual. A confirmação registra uma decisão do usuário, sem certificar precisão nem autorizar treinamento. `complete` continua significando cobertura.

As etapas 4–5 têm agora integração permanente para leitura independente configurável, propostas e decisões com versões na web/mobile. A execução de um leitor e sua precisão ainda exigem homologação; sem executável configurado, a leitura é informada como indisponível. O editor manual completo e o treinamento automático continuam pendentes. Consulte [revisão visual](SOURCE_VISUAL_REVIEW.md). A aprovação é vinculada ao hash e ao nome imutável do export: uma nova saída precisa de nova revisão, e uma tentativa em andamento impede confirmar a versão anterior. Resultados legados sem revisão identificável mantêm o MusicXML anterior, com estado não verificado e sem player/MIDI.

## Entregas em ordem

| ID | Atividade e critério de conclusão | Feita? Implementação | Feita? Validação |
| --- | --- | --- | --- |
| V01 | Relatório por página/compasso/candidato com controles executados, ignorados, achados e razão da escolha. Ritmo e navegação verificados antes da seleção; divergências preservadas. Seleção não pode premiar um arquivo só porque tem menos notas ou um aviso de preparação a menos. | ☑ Sim | ☑ Sim — candidatos adversos, divergências e um PDF real; controles sem contexto explicitados |
| V02 | Preservar evidências intermediárias: hashes, imagens transformadas, XMLs brutos, versão/parâmetros do motor e mapa para o original. Associar achado a página/pauta/compasso e recorte; não inventar coordenadas inexistentes. | ☐ Não — base privada implementada; coordenadas/parâmetros completos e tentativas sem saída pendentes | ☐ Não — acesso, hashes e limites por arquivo testados; mapa e teto agregado ainda sem validação completa |
| V03 | Implementar etapa de revisão distinta da cobertura: não verificado, em revisão e prévia conferida. Pendências mostram prévia e pedido de revisão; finalização e versão exportada ficam coerentes entre API/web/mobile. Resultados legados continuam identificados como não revisados. | ☑ Sim | ☐ Não — API/clientes e navegador local passaram; nova migration PostgreSQL e aparelho de release pendentes |
| V04 | Implementar nova leitura de recortes suspeitos e comparação com a fonte para altura, acidente, duração, pausas, vozes e sinais de navegação. Medir ganho e custo; acordo entre motores não basta para aprovação. | ☐ Não — integração e comparação de eventos implementadas; homologação do leitor e navegação pendentes | ☐ Não — detecção visual e alinhamento ainda precisam de avaliação |
| V05 | Criar propostas de correção com localização, evidência, razão, antes/depois e versão-base. Somente mudanças semanticamente equivalentes ou com confirmação suficiente são aplicadas automaticamente; as demais ficam para revisão. Revalidar a versão final. | ☑ Sim — propostas conservadoras, decisão explícita, revalidação e versão-base | ☐ Não — contrato local testado; precisão real e revisão polifônica pendentes |
| V06 | Editor de revisão por trecho: original e resultado lado a lado, nota/ritmo destacado, aceitar/ajustar/rejeitar e desfazer. A aceitação do usuário registra sua decisão; não vira automaticamente referência musical ou rótulo de treinamento verificado. | ☐ Não — original/antes/depois, aceitar/manter/desfazer implementados; editor manual pendente | ☐ Não — componentes testados; aparelho, usabilidade e conferência musical pendentes |
| V07 | Histórico de correções: distinguir sugestão, aceitação do usuário, revisão musical conferida e elegibilidade para treinamento. Ligar cada patch ao original e registrar origem/revisor/data. Usar somente dados autorizados, com controles de acesso e retenção ligados à partitura. | ☑ Sim — histórico privado, hashes, versões, ator e retenção vinculados à partitura | ☐ Não — testes locais de versões; validação transacional em PostgreSQL nesta etapa pendente |
| V08 | Preparar referências conferidas e avaliador de eventos por arquivo/parte. Começar pela comparação integral de Sons de Carrilhões; ampliar para o corpus de 20 partituras e 40 entradas PDF/foto do contrato. Separar desenvolvimento, treinamento e avaliação por peça, mantendo PDF/foto da mesma peça no mesmo grupo. | ☐ Não — avaliador e primeira referência assistida concluídos; corpus completo pendente | ☐ Não — primeiro caso automático: 6,05% de erro escrito; homologação humana e 40 entradas pendentes |
| V09 | Converter correções confirmadas em regressões e melhorias gerais. Exemplos desta peça viram casos positivos e negativos: digitação 3 confundida com tercina e tercina real; nota extra e nota legítima; casa incompleta e repetição correta. Não usar o número do compasso como regra. | ☐ Não — há testes gerais, mas falta o ciclo das correções aprovadas | ☐ Não — corpus e regressões de fonte pendentes |
| V10 | Preparar treinamento do reconhecimento com símbolos corretamente rotulados, versões de modelos e comparação antes/depois. Treinar separado dos envios ao usuário; publicar uma versão somente após melhorar casos novos sem regressões nos anteriores. Manter retorno à versão anterior. | ☐ Não | ☐ Não — coleta, treinamento e promoção de modelos inexistentes |

V01/V02 fornecem a base rastreável; V03 evita tratar ambiguidade como entrega final; V04–V06 permitem revisão e correção sustentadas pela fonte. V07–V09 estabelecem melhoria mensurável. V10 é a etapa de treinamento real, dependente de dados verificados e avaliação.

## Como as correções melhoram as próximas conversões

O processo precisa de três mecanismos complementares:

- **Regras e normalizações gerais:** mudam o código e beneficiam os novos envios quando a versão passa a ser usada. Exemplos implementados: preservar acordes, anacruse e alertar duração incorreta.
- **Casos de regressão:** guardam erros corrigidos para detectar se voltaram. Um caso de digitação 3 não autoriza remover todos os sinais de tercina das outras partituras.
- **Treinamento do reconhecimento:** utiliza imagens de símbolos e seus rótulos corretos para ajustar um modelo, seguido de avaliação e liberação de nova versão. Um patch em MusicXML, sozinho, não altera o modelo.

O Audiveris oferece treinamento do classificador de símbolos usando amostras rotuladas e recomenda incorporar somente coleções cuidadosamente verificadas. Esse recurso não constitui um pipeline de aprendizado automático já integrado ao aplicativo. Alterar o classificador de símbolos também não garante resolver a interpretação de vozes, ritmo e navegação; esses aspectos precisam dos controles e da revisão descritos acima. Fontes: [amostras do Audiveris](https://audiveris.github.io/audiveris/_pages/guides/advanced/samples/) e [treinamento](https://audiveris.github.io/audiveris/_pages/guides/advanced/training/).

Cada promoção deve apresentar ganho medido em casos não usados para ajustar aquela versão, erros ainda existentes e custo de processamento. O simples aumento do número de arquivos convertidos não comprova aprendizado.

## Primeira etapa executada e pendências

- [x] **Feita? Sim — Implementar V01, a base de evidências de V02 e a etapa V03.** Diagnóstico antes da escolha, originais/candidatos/imagens/artefatos nativos conservados em diretório privado e prévia com confirmação vinculada à versão. Testes: API 116, web 106, mobile 73; lint/build passaram. Evidência no [relatório do fluxo](validation/musical-review-flow-2026-10-07/REPORT.md).
- [ ] **Feita? Não — Completar V02.** Mapa de coordenadas e recortes automáticos por achado, parâmetros completos por preparação e preservação de evidências de tentativas sem saída utilizável. Hoje o mapa identifica página e declara coordenadas ausentes; não inventa posições.
- [ ] **Feita? Não — Homologar V03 no ambiente alvo.** Aplicar/verificar a nova migration em banco isolado, depois no ambiente de homologação; conferir app em aparelho de release e o fluxo publicado.
- [x] **Feita? Sim — Preparar a referência assistida e avaliar este caso em V08.** Comparação integral, auditoria de patches, seis regressões do avaliador e resultados por versão registrados. A nota inicial cobre eventos escritos; ligações, navegação e oitava sonora foram verificadas separadamente.
- [ ] **Feita? Não — Homologar a referência e ampliar V08.** Revisão humana independente e corpus de 20 partituras/40 entradas ainda pendentes. A cópia manual corrigida não comprova melhora do motor, nem deve bloquear outros envios em PDF/foto.

Não houve alteração de modelo, treinamento ou publicação nesta rodada. Houve alteração da política de finalização no código local. Evidências nativas têm teto de 128 MiB por arquivo e 512 MiB agregado, com omissões explicitadas; o teto agregado foi revisado estaticamente. XMLs/imagens de candidatos ainda não possuem teto agregado específico. A exclusão definitiva do export remove suas evidências, respeitando a retenção existente.

## Integração da revisão visual — 07/10/2026

- [x] **Feita? Sim — Implementar etapa permanente** conforme [contrato e limites](SOURCE_VISUAL_REVIEW.md).
- [x] **Feita? Sim — Implementar confirmação explícita das propostas** com revisão-base, versões preservadas e exclusão por retenção.
- [ ] **Feita? Não — Homologar a comparação real nota por nota** e comprovar ganho em peças novas. Modelos/leituras experimentais não aprovam automaticamente o acervo.

- [x] **Feita? Sim — Executar leitura independente local HOMR e comparação integrada de uma página real**; 32 compassos comparados e 12 propostas, sem conferir/aceitar automaticamente as divergências. [Evidências](validation/source-visual-review-2026-10-07/REPORT.md).

## Evidência do lote selecionado — 07/10/2026

- [x] **Feita? Sim — Ampliar a avaliação assistida às oito fontes autorizadas e executar o leitor nas 13 páginas musicais**, com hashes, logs e falhas de cobertura preservados.
- [x] **Feita? Sim — Medir o caso alinhado e verificar propostas reais.** Carinhoso: 151/155 eventos do leitor concordam com o ledger assistido; seis propostas do processo real contraditas pela fonte, inclusive uma aplicável após revisão. O resultado não é precisão geral comprovada.
- [x] **Feita? Sim — Separar comparação XML e execução MIDI.** Little Rondo/Cravo/Samba passam no escopo assistido de eventos e execução básica; Carinhoso ainda apresenta uma duração divergente na volta com final alternativo.
- [ ] **Feita? Não — Concluir referência musical integral e homologação do lote.** Debussy permanece parcial; ambiguidades e navegação pendentes por peça estão no [relatório](validation/selected-homologation-2026-10-07/REPORT.md).
- [ ] **Feita? Não — Comprovar aprendizado e promover modelos.** Falhas registradas não equivalem a treinamento executado ou melhoria medida em peças novas.
