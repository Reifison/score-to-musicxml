# Roadmap central do Conversor de Partituras

Atualizado em 7 de outubro de 2026. Este é o ponto de entrada para organizar o trabalho após a [auditoria do projeto](audits/project-2026-10-06/audit.md). A prioridade é entregar uma conversão revisável sem perdas silenciosas, mostrar seu estado com clareza e preparar um lançamento verificável nas três plataformas.

As marcações registram somente evidência disponível. **Feita?** na preparação não significa validação concluída. Nas tabelas, implementação/preparação, validação local e homologação têm colunas separadas; **☑ Sim** indica conclusão comprovada e **☐ Não** indica pendência. Uma atividade com código pronto e homologação pendente continua aberta para lançamento.

## Evidência já concluída

- [x] **Feita? Sim — Auditoria do código e da documentação local.** Achados F01–F27 registrados em 2026-10-06; nenhuma correção funcional aplicada durante a fase de auditoria.
- [x] **Feita? Sim — Captura e inspeção do fluxo web desktop e estreito.** Nove capturas novas, com sessão isolada e resultado MusicXML preparado. Não valida OMR real ou app nativo.
- [x] **Feita? Sim — Execução dos testes existentes.** API 45, web 86 e mobile 40: 171 testes passaram em 2026-10-06.
- [x] **Feita? Sim — Verificações de compilação local.** Lint dos três workspaces, build API/web e validação Prisma passaram; mobile passou no typecheck, sem IPA/AAB gerado.
- [x] **Feita? Sim — Organização da auditoria e do roadmap central.** Documentos e índice de leitura criados nesta rodada.

## Execução local de 2026-10-06

[Relatório da implementação e evidências](validation/implementation-2026-10-06/REPORT.md): 241 testes padrão dos workspaces passaram (API 75, web 99, mobile 67), cinco testes PostgreSQL opt-in, cinco testes de configuração de produção e 16 verificações fonte de release mobile. Lint/build locais e Prisma passaram. Onze verificações operacionais exercitaram banco, Redis, worker e retomada sem novo débito, usando OMR stub. Capturas verificam upload, diálogo, parcial, legado, retry, rede e páginas públicas com uma sessão preparada.

- [x] **Feita? Sim — Converter uma partitura real de violão solo.** [Sons de Carrilhões](validation/sons-de-carrilhoes-2026-10-06/REPORT.md): Audiveris 5.10.2 real, duas páginas, 35 compassos e saída MusicXML. O teste revelou perda de notas na prévia, numeração da anacruse e timbre vocal; correções implementadas e verificadas. A segunda execução terminou em 47,014 s e preservou 371/371 notas na importação. A API passou a 80 testes aprovados; web/mobile mantêm a evidência anterior.
- [ ] **Feita? Não — Homologar musicalmente esse resultado.** Há revisão visual assistida dos 35 compassos e uma cópia corrigida; homologação editorial humana e corpus R02/R09 continuam pendentes. O relatório integral separa eventos escritos, navegação e marcações de execução.

**Feita? Validação local** registra código/testes e conferência local; **Feita? Homologação** registra o aceite restante em corpus, ambiente alvo, aparelhos e lojas. As 12 migrations e cinco testes de integração passaram em PostgreSQL temporário com dados fictícios; Caddy também passou na validação real da configuração. Não houve deploy, migration em ambiente existente, build assinado ou submissão. [Gates restantes](validation/RELEASE_GATES_2026-10-06.md).

## Prioridade 1 Confiabilidade musical e recuperação

### Evolução solicitada em 2026-10-07

- [x] **Feita? Sim — Transformar erros da homologação em regras permanentes para novos envios.** Sugestões rítmicas exigem revisão manual; conferência MIDI por versão, reparo seguro de ligadura na repetição e aprovação com ressalvas implementados. [Relatório e limites](validation/musical-learning-2026-10-07/REPORT.md).
- [x] **Feita? Sim — Validar localmente a integração das regras aprendidas.** 431 testes passaram (API 208, web 135, mobile 88), compilação e verificações de tipos locais concluídas; seis testes PostgreSQL opt-in não executados.
- [x] **Feita? Sim — Publicar API, worker e web e verificar um fluxo real em produção.** Little Rondo: duas pautas, 252 entradas MIDI conferidas, revisão e downloads aprovados no teste técnico; dados existentes preservados. [Publicação](validation/musical-learning-2026-10-07/PUBLICATION.md).
- [x] **Feita? Sim — Corrigir a inicialização nativa para o iOS 27.** UIScene configurada com encaminhamento dos eventos do Expo e preservação via plugin. A build 8 fechava por falta desse suporte.
- [x] **Feita? Sim — Gerar, instalar e validar abertura da build 9 Release no iPhone.** Versão instalada confirmada, tela carregada e processo permaneceu em execução sem novos relatórios de crash; 91 testes mobile passaram. [Evidência](validation/ios-build-2026-10-08/REPORT.md). Homologação funcional completa permanece pendente.
- [ ] **Feita? Não — Atualizar os aplicativos nas lojas e homologar em aparelhos.** Publicação web/backend não atualiza o player empacotado nos aplicativos. Precisão musical ampla e treinamento de modelo seguem separados.

- [x] **Feita? Sim — Preparar o acervo local para conversão, triagem e diagnóstico.** 148 arquivos; 112 PDFs musicais únicos / 1.804 páginas após separar documentos administrativos e cópia repetida; foto e SVG musicais adicionais. Capas/textos têm decisões por página com hashes. [Roadmap do acervo C01–C16](CORPUS_CONVERSION_AND_VALIDATION_ROADMAP.md).
- [x] **Feita? Sim — Executar a conversão e a validação automática do acervo local.** 112 PDFs únicos tiveram tentativas finalizadas; candidatos e falhas preservados nos [resultados por arquivo](validation/corpus-partituras-2026-10-07/BATCH_RESULTS.md).
- [ ] **Feita? Não — Homologar a fidelidade musical de todo o acervo.** Seleção de obras nos livros, conferência integral das notas/símbolos e aprovação editorial continuam pendentes.
- [x] **Feita? Sim — Restringir novas correções aos PDFs de até três páginas.** Determinação mais recente do usuário: 65 PDFs/125 páginas nesta rodada; 47 PDFs maiores fora das correções, com histórico preservado. [Seleção por hash](validation/acervo-review-2026-10-07/review-scope.json).
- [ ] **Feita? Não — Aprovar integralmente os 65 PDFs desta rodada.** Quatro PDFs aprovados integralmente e um parcial; 93,85% dos arquivos ainda sem aprovação integral, sem estimativa de esforço.
- [x] **Feita? Sim — Aprovar o primeiro lote de transcrições após duas leituras da fonte.** Laudemus (duas variantes), Splendens, O Cravo e Little Rondo: cinco arquivos, 243 notas/pausas; edição compartilhada de Folclore permanece parcial por cinco alterações ambíguas em Atirei. [Fila e escopos de aprovação](validation/acervo-review-2026-10-07/APPROVAL_QUEUE.md).
- [x] **Feita? Sim — Conferir e aprovar a parte de baixo de Purcell.** 101 notas/40 compassos, registro da clave com 8 abaixo e quatro andamentos; seis transcrições aprovadas no lote, total de 344 notas/pausas. Leituras iniciais, erros de referência e cópia corrigida preservados.
- [x] **Feita? Sim — Conferir e aprovar CSM100.** 85 notas/32 compassos, letra/estrofes/créditos e símbolos impressos; sete transcrições aprovadas no lote, total de 429 notas/pausas. Prévia PDF inspecionada e erros registrados por origem.
- [ ] **Feita? Não — Finalizar Minueto, Alle Psalite e Tourdion.** Minueto retido por divergências de fonte e cobertura incompleta; leituras das três/quatro partes das outras duas obras em cotejo ou andamento.
- [x] **Feita? Sim — Implementar a correção dos andamentos internos no MIDI/player.** Posições verificáveis sincronizadas no export API e no player; caso sem mapeamento seguro retorna diagnóstico controlado.
- [x] **Feita? Sim — Validar localmente a regressão MIDI/player de Purcell.** Quatro andamentos, 162 notas e pontos do cursor, trilhas instrumentais preservadas e API/web equivalentes; repetições e primeiro andamento tardio cobertos por testes. [Evidência](validation/process-improvements-2026-10-07/REPORT.md). Homologação sonora/aparelhos permanece separada.
- [x] **Feita? Sim — Aplicar melhorias gerais extraídas dos erros do acervo.** Reutilização de imagens idênticas, avisos por parte/compasso/página, acesso ao original e códigos de diagnóstico versionados. Validação integrada: 358 testes aprovados; lint/build locais passaram.
- [ ] **Feita? Não — Comprovar detecção visual de todas as perdas de sistemas/notas.** Geometria auxiliar implementada, mas os três rasters reais ainda foram subestimados; alinhamento com a fonte e avaliação independente pendentes.
- [x] **Feita? Sim — Verificar os eventos de oito exportações nativas com dois leitores independentes.** 3.958 notas/pausas iguais aos nativos fornecidos; equivalência com PDFs e seis fontes com recursos sem interpretação permanecem pendentes.
- [x] **Feita? Sim — Bloquear aprovação por pauta errada, referência circular ou ambiguidade e registrar regressões reais.** 53 testes focados passaram; [erros conferidos](validation/acervo-review-2026-10-07/CONFIRMED_ERRORS.md), incluindo erros dos próprios revisores e do validador.

- [x] **Feita? Sim — Registrar o fluxo para ambiguidades.** Usuário escolheu mostrar prévia e pedir revisão antes de finalizar. Primeira implementação local em API/web/mobile, validada com o PDF real no navegador.
- [x] **Feita? Sim — Organizar validação, correção e melhoria a partir de exemplos aprovados.** [Roadmap detalhado V01–V10](MUSICAL_VALIDATION_AND_LEARNING_ROADMAP.md), com distinção entre controles de consistência, precisão medida, regressões e treinamento real.
- [x] **Feita? Sim — Implementar a primeira etapa de revisão antes da entrega.** Diagnóstico por candidato, evidências privadas, preview e confirmação vinculada ao export imutável. [Evidência local](validation/musical-review-flow-2026-10-07/REPORT.md): API 116, web 106, mobile 73 testes; lint/build passaram.
- [ ] **Feita? Não — Completar o histórico/editor de correções.** Há auditoria da confirmação da prévia e patch manual rastreável do caso real. Ainda faltam propostas visuais automáticas, editor por trecho e histórico de patches no produto.
- [ ] **Feita? Não — Homologar a nova etapa de revisão.** Nova migration PostgreSQL, app em aparelho e ambiente publicado pendentes; cinco testes opt-in de banco não executados nesta rodada.
- [x] **Feita? Sim — Medir o primeiro caso contra referência assistida.** Sons de Carrilhões: 35 compassos, 380 eventos esperados, 23 ocorrências incorretas na saída automática (6,05%; 9,39/10 no escopo escrito). Cópia corrigida sem divergências escritas; seis testes do avaliador passaram. [Conferência integral](validation/sons-de-carrilhoes-integral-2026-10-07/report.md).
- [ ] **Feita? Não — Homologar o corpus e treinar/avaliar novas versões.** Referências aprovadas por revisão humana, corpus completo e separação entre dados de ajuste e avaliação pendentes. O aplicativo ainda não aprende automaticamente ao receber novas partituras.

### Teste web real de 2026-10-07

- [x] **Feita? Sim — Enviar Sons de Carrilhões pelo Chrome com OMR real.** [Relatório web](validation/web-real-score-2026-10-07/REPORT.md): seletor de arquivos, Violão solo, recibo, acompanhamento aberto até Convertido, 2/2 páginas, 35 compassos e 371 notas renderizadas. Uma tentativa e um scan; 50,882 s de conversão.
- [x] **Feita? Sim — Corrigir a prévia do PDF entre origens diferentes.** Permissão de iframe limitada à origem web configurada na rota autorizada; demais proteções preservadas. PDF original exibido no Chrome e 81 testes padrão da API aprovados, lint/build aprovados.
- [x] **Feita? Sim — Verificar player e respostas de exportação.** Violão, play/pause/retomada/busca/reinício, HTTP 200 e nomes dos downloads. Conteúdo XML e buffer MIDI da requisição UI conferidos.
- [ ] **Feita? Não — Confirmar o salvamento final dos downloads do Chrome.** Evento da automação indisponível; conteúdo servido não comprova destino no computador.
- [ ] **Feita? Não — Homologar música, ambiente publicado e aparelhos.** O mesmo caso mantém erros musicais e não completa R02/R09/R29. Não houve deploy.

O usuário autorizou a implementação deste roadmap em 2026-10-06. As decisões musicais Q1–Q24 continuam sendo a base do contrato; a autorização de implementação não comprova a meta musical. O acervo do Drive informado pelo usuário está em seleção e ainda não contém referências MusicXML conferidas disponíveis nesta sessão.

### Revisão rítmica de 2026-10-07

- [x] **Feita? Sim — Corrigir uma cópia de Sons de Carrilhões conforme o PDF.** Falsa tercina e sincronização das vozes no compasso 15 corrigidas; mínima extra no 21 removida após conferência visual. Repetição em 18, encerramento da casa 2 em 34 e Segno/Fine/D.S. restaurados. A sequência real de reprodução e a volta à armadura inicial foram verificadas no mapa de tempo. Originais preservados e cada alteração registrada na [revisão musical](validation/sons-de-carrilhoes-revisao-2026-10-07/REPORT.md).
- [x] **Feita? Sim — Implementar avisos automáticos de duração.** Integração na conversão sem modificar eventos. Original: dois alertas, nos compassos 15/21; cópia revisada: nenhum alerta entre os 34 compassos verificáveis. Anacruse e casos ambíguos permanecem fora da avaliação. API: 98 testes padrão, lint/build aprovados e revisão independente.
- [x] **Feita? Sim — Conferir a métrica MIDI e gerar nova audição.** O MIDI original já era 2/4; o diagnóstico anterior de 4/4 foi corrigido. Cinco casos de regressão adicionados; novo MIDI e MP3 de violão, incluindo repetições/D.S., com áudio decodificado e som confirmado: aproximadamente 2min19s.
- [x] **Feita? Sim — Completar a conferência assistida de notas, pausas e marcações candidatos.** A revisão integral posterior mediu os eventos escritos, corrigiu feixe em 32 e ligações de sustentação, removeu 57 marcadores falsos e verificou a oitava sonora. Originais preservados; [relatório integral](validation/sons-de-carrilhoes-integral-2026-10-07/report.md).
- [ ] **Feita? Não — Homologar editorialmente todos os eventos desta peça.** A referência assistida ainda não é referência ouro homologada; dedilhados/cordas/posições não foram transcritos integralmente. A nota medida se limita a alturas, pausas, duração, posição temporal e vozes.
- [ ] **Feita? Não — Tratar mudança de métrica dentro de repetição no MIDI.** Exercício sintético revelou que o Verovio não restaura a métrica da volta; caso não ocorre nesta peça. Evidência e limite no relatório acima.

### Conferência integral e etapa de revisão — 2026-10-07

- [x] **Feita? Sim — Conferir os 35 compassos contra o PDF.** Referência assistida com 373 eventos de notas e sete pausas, correções de acidentes/ritmo/ligaduras e auditoria individual dos marcadores de notação candidatos. Avaliação reproduzível e limites no [relatório integral](validation/sons-de-carrilhoes-integral-2026-10-07/report.md).
- [x] **Feita? Sim — Gerar MusicXML, MIDI e áudio da cópia final.** Oitava sonora do violão, 2/4, repetições/casas/D.S. e volta à armadura inicial verificados; áudio de aproximadamente 2min19s. Andamento de 70 BPM é uma escolha de audição, pois a fonte não determina BPM.
- [x] **Feita? Sim — Testar prévia e confirmação no navegador.** PDF real, sessão fictícia isolada, quatro candidatos e 20 arquivos de evidência com hashes conferidos. Prévia pendente e bloqueios, carregamento em desktop/375 px, confirmação e resposta MIDI HTTP 200 registrados no [teste do fluxo](validation/musical-review-flow-2026-10-07/REPORT.md).
- [ ] **Feita? Não — Homologar os controles finais em banco e aparelhos.** A última execução OMR no navegador antecedeu os refinamentos finais de diagnóstico por voz e limites de artefatos; os testes do código final passaram. Nova migration, app em aparelho e ambiente publicado ainda pendentes.

| ID | Atividade e critério de conclusão | Área | Feita? Implementação ou preparação | Feita? Validação local | Feita? Homologação |
| --- | --- | --- | --- | --- | --- |
| R01 | Confirmar o contrato consolidado. Aceite: entendimento compartilhado registrado sem transformar a meta de 2% em precisão já comprovada. | Produto | ☐ Não — contrato registrado; confirmação final pendente | ☐ Não | ☐ Não |
| R02 | Preparar 20 referências musicais e 40 entradas PDF/foto; medir a linha de base por arquivo e parte. Aceite: referências conferidas e relatório com perdas/erros individuais. | Conversão e revisão musical | ☐ Não — primeira referência assistida e avaliador preparados; restante do corpus/fotos pendente | ☐ Não — um caso medido; conjunto completo pendente | ☐ Não — referência humana/corpus |
| R03 | Persistir tipo de partitura, tentativas e cobertura por página/pauta/parte. Aceite: piano, melodia, violão solo e duo possuem requisitos explícitos e uma tentativa falha não sobrescreve o resultado anterior. F01/F02/F03. | API e dados | ☑ Sim | ☑ Sim — migrations, modelo e fencing em PostgreSQL isolado | ☐ Não — aplicação no ambiente alvo |
| R04 | Implementar a política de parcial. Aceite: página inteira ausente é identificada; MusicXML/visualização têm aviso; player e MIDI ficam bloqueados no backend e clientes; perda de pauta/parte obrigatória falha. F01. | API, web e mobile | ☑ Sim | ☑ Sim — API/clientes e prévia web | ☐ Não — corpus/aparelhos |
| R05 | Associar partes entre páginas por identidade estável. Aceite: IDs alterados não apagam partes/vozes; duo mantém Violão 1/2 e piano mantém suas duas pautas. F03. | OMR | ☑ Sim | ☑ Sim — nomes, pautas, IDs instrumentais e um PDF real de violão solo | ☐ Não — corpus musical |
| R06 | Substituir confiança fixa e heurística de tamanho por verificações aplicáveis a PDF/imagem. Aceite: exercícios curtos legítimos são aceitos e cobertura não é apresentada como precisão musical. F02/F18. | OMR e interface | ☑ Sim | ☑ Sim — exercícios curtos, cobertura sem porcentagem, um caso OMR real e alertas de duração | ☐ Não — corpus/aparelhos |
| R07 | Implementar retentativa automática temporária e uma manual adicional por envio. Aceite: limite comprovado, sem novo débito de scan, e saída anterior preservada se a nova tentativa falhar. F04. | Fila e API | ☑ Sim | ☑ Sim — limites, concorrência e quota em PostgreSQL isolado; preservação | ☐ Não — ambiente alvo |
| R08 | Recuperar upload persistido sem job. Aceite: falha Redis/enqueue/auditoria tem recuperação idempotente, sem tarefa presa nem cobrança duplicada. F05. | API e fila | ☑ Sim | ☑ Sim — falhas de audit/enqueue e retomada em Redis/worker reais isolados | ☐ Não — ambiente alvo/OMR real |
| R09 | Executar corpus após os ajustes. Aceite de execução: 40 entradas com resultado por arquivo/parte; aceite musical separado: cada caso requerido atende à meta e preserva compassos, pautas, vozes e repetições simples. F17. | Revisão musical | ☐ Não — um PDF real executado; conjunto de 40 pendente | ☐ Não — primeiro caso assistido medido: 6,05% de erro escrito na saída automática, acima de 2%; corpus pendente | ☐ Não |

Detalhamento e regras de contagem: [contrato](CONVERSION_RELIABILITY.md), [roadmap de confiabilidade](CONVERSION_RELIABILITY_ROADMAP.md), [glossário](../GLOSSARY.md) e [ADR 0001](adr/0001-exportar-resultados-parciais-com-cobertura-explicita.md).

## Prioridade 2 Fluxo e acessibilidade

Isolamento do diálogo e contraste podem avançar junto ao modelo de conversão. Novos estados, avisos e downloads devem usar o contrato final da API.

| ID | Atividade e critério de conclusão | Área | Feita? Implementação | Feita? Validação local | Feita? Homologação |
| --- | --- | --- | --- | --- | --- |
| R10 | Confirmar envio e mostrar o item/andamento no mesmo fluxo. Aceite: o usuário percebe sucesso, sabe o próximo passo e recebe o anúncio de estado; erro preserva uma ação de recuperação. F07. | Web | ☑ Sim | ☑ Sim — testes e upload real no Chrome em 2026-10-07 | ☐ Não — ambiente publicado |
| R11 | Atualizar o item aberto pelo estado atual da coleção. Aceite: abrir queued/processing e chegar a resultado/falha sem fechar; abas e downloads acompanham o estado. F08. | Web | ☑ Sim | ☑ Sim — polling e chegada ao resultado OMR real com diálogo aberto | ☐ Não — ambiente publicado |
| R12 | Tratar rede, 401, carregamento e polling. Aceite: nenhuma rejeição não tratada; API indisponível não parece lista vazia; sessão expirada tem recuperação clara; polling evita trabalho desnecessário. F09. | Web | ☑ Sim | ☑ Sim — rede/401 e recuperação | ☐ Não — ambiente publicado |
| R13 | Corrigir isolamento e camada do diálogo. Aceite: Tab/Shift+Tab permanecem nele, Escape funciona, foco retorna e barra inferior não cobre nem recebe ações do fundo. F11. | Web | ☑ Sim | ☑ Sim — foco, Tab/Shift+Tab, Escape e inert | ☐ Não — navegadores/leitores alvo |
| R14 | Corrigir tokens de contraste e labels administrativos. Aceite: texto normal ≥4,5:1 nos estados aplicáveis; rótulos, erros e controles por usuário são associados e persistentes. F10/F12. | Web e tokens mobile | ☑ Sim | ☑ Sim — tokens/labels e contraste mobile | ☐ Não — aparelhos/leitores |
| R15 | Adequar alvos de toque, navegação e telas expandidas. Aceite: mínimo do projeto respeitado; no máximo cinco destinos compactos; logout separado; modal utilizável em tablet/celular. F22/F23. | Web e mobile | ☑ Sim | ☑ Sim — 390 px e modelo de navegação | ☐ Não — tablets/aparelhos |
| R16 | Resolver destinos incompletos e copy de suporte/player. Aceite: cada atalho leva a uma função útil; configurações têm espaçamento; contato é acionável; créditos legais permanecem disponíveis. F25. | Web e mobile | ☑ Sim | ☑ Sim — destinos e páginas públicas locais | ☐ Não — publicação/aparelhos |
| R17 | Alinhar aparência declarada ao tema entregue. Aceite: tema claro intencional consistente, ou tokens escuros completos se esse escopo for escolhido. F24. | Mobile | ☑ Sim | ☑ Sim — Expo/plist e tokens claros | ☐ Não — artefato/aparelhos |
| R18 | Medir primeira abertura de partitura e carregamento de timbres. Aceite: orçamento registrado em rede/aparelho alvo, cache e fallback verificados; otimização adicional baseada em medição. F21. | Player | ☐ Não — observação local; medição formal pendente | ☐ Não | ☐ Não — aparelho/rede alvo |
| R19 | Validar teclado, zoom, leitor de tela e toque. Aceite: foco, anúncios, 200% de zoom, nomes acessíveis, controles e rolagem verificados em desktop e dispositivos suportados. | Qualidade de interface | ☐ Não — teclado/foco web verificados; matriz restante aberta | ☐ Não | ☐ Não — zoom/leitores/aparelhos |

Direção visual: preservar [DESIGN.md](../DESIGN.md). Usar harden/colorize/onboard/clarify/adapt para corrigir os achados; audit após correções e polish como acabamento final. Não iniciar um redesign como dependência dessas correções.

## Prioridade 3 Operação de produção

| ID | Atividade e critério de conclusão | Área | Feita? Implementação | Feita? Validação local | Feita? Homologação |
| --- | --- | --- | --- | --- | --- |
| R20 | Alinhar domínio/API/proxy. Aceite: a topologia escolhida corresponde a Caddy, URLs web/mobile e cookies; ambos os hosts, quando distintos, atendem HTTPS e rotas esperadas. F06. | Infraestrutura | ☑ Sim | ☑ Sim — cinco testes e validação real do Caddy | ☐ Não — HTTPS/cookies nos hosts alvo |
| R21 | Separar liveness de readiness e verificar worker. Aceite: banco/Redis/worker indisponíveis impedem declarar o fluxo pronto; job controlado fecha a verificação pós-deploy. F20. | API e operação | ☑ Sim | ☑ Sim — schema/heartbeat e quedas reais isoladas com retorno 503/200 | ☐ Não — readiness e job OMR pós-deploy |
| R22 | Cancelar subprocessos e limitar custo de conversão. Aceite: timeout global encerra trabalho antes da limpeza; limites de páginas/tempo/recursos são explícitos e testados. F19. | Worker e OMR | ☑ Sim | ☑ Sim — páginas, deadline, saída e árvore de processos | ☐ Não — OMR real em homologação |
| R23 | Exercitar indisponibilidade, recuperação e rollback em ambiente de teste. Aceite: fila atrasada/sem Redis, storage e migração têm procedimentos verificáveis; monitoramento alerta para jobs presos. | Operação | ☐ Não — quedas/retomada locais feitas; storage, rollback e alertas pendentes | ☐ Não — exercício parcial documentado | ☐ Não |

Manter o [runbook de liberação](MIDI_RELEASE_RUNBOOK.md) como procedimento operacional e acrescentar evidência do ambiente escolhido. Esta execução local não alterou implantação nem banco.

## Prioridade 4 Aplicativos e lojas

| ID | Atividade e critério de conclusão | Área | Feita? Implementação ou preparação | Feita? Validação local | Feita? Homologação |
| --- | --- | --- | --- | --- | --- |
| R24 | Unificar versão/build e incremento por plataforma. Aceite: Expo, projeto nativo, IPA/AAB final e próximo número disponível na loja correspondem. F15. | iOS e Android | ☑ Sim — fontes e incremento por plataforma | ☑ Sim — Apple build 6 consultado; build 9 instalada e abertura validada no iPhone | ☐ Não — IPA/AAB e próximo código Play |
| R25 | Configurar e verificar assinatura Android de produção. Aceite: certificado do AAB final corresponde à credencial de upload correta; o caminho local e o EAS são documentados. F16. | Android | ☐ Não — fallback debug removido; credencial final pendente | ☑ Sim — fontes/preflight; não confirma assinatura | ☐ Não — certificado do AAB |
| R26 | Resolver requisito offline do player. Aceite: origem local segura e comportamento sem rede comprovados, ou expectativa de conectividade documentada de forma consistente. F14. | Mobile e produto | ☑ Sim — expectativa online explícita | ☑ Sim — documentação/interface/contrato coerentes | ☑ Sim — alternativa documental; aparelhos em R29 |
| R27 | Exibir preço da loja e bloquear compra sem produto carregado. Aceite: carregamento/falha, compra, restauração e revogação/reembolso testados nas plataformas aplicáveis. F13. | Compras | ☑ Sim | ☑ Sim — catálogo/estado/preço e bloqueio | ☐ Não — compra/restauração/revogação reais |
| R28 | Revisar manifesto de release e declarações de dados. Aceite: permissões necessárias justificadas, demais removidas, App Privacy/Data Safety refletem o artefato final. F26. | Privacidade e lojas | ☑ Sim — permissões fonte e checklist de dados | ☑ Sim — preflight fonte | ☐ Não — manifesto/declarações finais |
| R29 | Homologar fluxo e áudio em aparelhos de release. Aceite: referência real e duas vozes; timbres; 5 minutos contínuos; pause/seek/background/interrupções; câmera; compartilhamento; leitor de tela; tablets e Back. | Qualidade mobile | ☐ Não — matriz preparada | ☐ Não | ☐ Não — aparelhos de release |
| R30 | Conferir situação atual das lojas e concluir checklist de publicação. Aceite: URLs públicas de privacidade/suporte, contato definitivo, conta de revisão, IAP e status atual registrados por evidência datada. | Lojas | ☐ Não — Apple/URLs consultados e páginas prontas; checklist externo aberto | ☑ Sim — conteúdo público local sem sessão | ☐ Não — publicação, Play, conta e IAP |

Referências: [áudio](PLAYER_AUDIO_QUALITY_ROADMAP.md), [Android](ANDROID_RELEASE_RUNBOOK.md), [App Store](APP_STORE_SUBMISSION.md) e [Google Play](GOOGLE_PLAY_SUBMISSION.md). O registro Apple de setembro é histórico; não equivale a confirmação de aprovação em outubro.

## Prioridade 5 Manutenção da documentação

| ID | Atividade e critério de conclusão | Área | Feita? Preparação | Feita? Validação local | Feita? Homologação |
| --- | --- | --- | --- | --- | --- |
| R31 | Reconciliar os cinco roadmaps existentes com evidências datadas. Aceite: tarefas históricas não contradizem registros conhecidos, cada atividade tem Feita?/checkbox e implementação não significa homologação. F27. | Documentação | ☑ Sim | ☑ Sim — cinco históricos reconciliados | ☑ Sim — conferência documental |
| R32 | Atualizar contexto Impeccable quando solicitado. Aceite: init preserva respostas confirmadas, remove o campo Register obsoleto e preenche lacunas com o usuário, sem inferir decisões. | Contexto de produto | ☐ Não — contexto legado atualizado; plataforma pendente | ☐ Não | ☐ Não |

## Onde cada informação deve ficar

| Documento | Função |
| --- | --- |
| Este roadmap | Ordem atual, dependências e estados de execução. |
| [Auditoria](audits/project-2026-10-06/audit.md) | Diagnóstico datado, fontes, capturas e limites. |
| [CONVERSION_RELIABILITY.md](CONVERSION_RELIABILITY.md) | Contrato musical e política de cobertura/retentativas. |
| [CONVERSION_RELIABILITY_ROADMAP.md](CONVERSION_RELIABILITY_ROADMAP.md) | Detalhamento do trabalho de confiabilidade. |
| [MUSICAL_VALIDATION_AND_LEARNING_ROADMAP.md](MUSICAL_VALIDATION_AND_LEARNING_ROADMAP.md) | Validação/correção antes da entrega, revisão de ambiguidades e ciclo de melhoria com dados confirmados. |
| [roadmap-midi.md](../roadmap-midi.md) | Histórico e critérios da entrega MIDI/player; manter evidências passadas datadas. |
| [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md) | Histórico técnico amplo; reconciliar pendências de release. |
| [WEB_NATIVE_UI_ROADMAP.md](WEB_NATIVE_UI_ROADMAP.md) | Histórico da identidade e adaptação de UI. |
| [PLAYER_AUDIO_QUALITY_ROADMAP.md](PLAYER_AUDIO_QUALITY_ROADMAP.md) | Critérios de áudio e homologação física. |
| Runbooks | Procedimentos de build, deploy, distribuição e rollback. |
| Documentos de submissão | Texto reutilizável e checklist de cada loja. |
| Registros datados de revisão | Fatos históricos daquela submissão, sem presumir o estado atual da loja. |

Ao concluir uma atividade, marcar somente a coluna correspondente e registrar data e evidência. A execução do corpus pode estar concluída com reprovações; a meta musical continua pendente até todos os casos requeridos passarem. Próximo gate de lançamento: referências MusicXML e fotos reais, migrations/OMR em homologação e validação em aparelhos, conforme os gates vinculados acima.

## Revisão visual permanente — 07/10/2026

- [x] **Feita? Sim — Integrar leitura independente configurável após o OMR** com imagens, hashes, limites de até 3 páginas e estados desconhecido/indisponível explícitos.
- [x] **Feita? Sim — Criar propostas de notas/pausas/duração e decisões na web/mobile**, mantendo versões imutáveis, desfazer, revalidação e bloqueio de confirmação com propostas pendentes.
- [x] **Feita? Sim — Registrar decisões e preservar evidências privadas durante retenção/reprocessamento**; a aprovação do usuário não promove dados para treinamento.
- [ ] **Feita? Não — Homologar leitor, precisão e desempenho em partituras reais**; ver [contrato](SOURCE_VISUAL_REVIEW.md) e roadmap musical V04–V10.

- [x] **Feita? Sim — Configurar o leitor local HOMR e testar o caminho integrado com uma fonte real**, 32 compassos/12 propostas/7,2 s; nenhum original ou acervo aprovado foi alterado. [Relatório](validation/source-visual-review-2026-10-07/REPORT.md).

## Lote musical selecionado — 07/10/2026

- [x] **Feita? Sim — Identificar e preservar os oito PDFs selecionados**, incluindo capa/página branca; exceção de seis páginas de Debussy autorizada somente neste lote.
- [x] **Feita? Sim — Testar leitura independente nas 13 páginas musicais e adjudicar as propostas reais no caso alinhado de Carinhoso.** Seis propostas do processo real contrariaram a fonte assistida; nenhuma aceita. [Relatório do lote](validation/selected-homologation-2026-10-07/REPORT.md).
- [x] **Feita? Sim — Conferir notas e execução assistida de Little Rondo, Cravo e Samba-matuto.** MIDI com 252, 61 e 125 notas respectivamente; escopo e limites documentados por peça.
- [ ] **Feita? Não — Concluir homologação integral das oito fontes**, resolver cinco acidentes ilegíveis de Atirei, vozes de Aruê, navegação de Pequetita/Aracê, duração MIDI de Carinhoso e transcrição integral de Debussy. [Etapas feitas e pendentes](validation/selected-homologation-2026-10-07/ROADMAP.md).
- [ ] **Feita? Não — Converter as falhas aprendidas neste lote em melhorias gerais verificadas em peças novas.** Registro de falhas concluído; treinamento e publicação de novo modelo não realizados.

### Aceitação do lote pelo usuário — critério de 95%

- [x] **Feita? Sim — Registrar aceitação de sete peças/seis PDFs** com pelo menos 95% dos eventos escritos conferidos na revisão assistida: Little Rondo, Cravo, Atirei, Carinhoso, Pequetita, Aracê e Samba-matuto. [Decisões e ressalvas](validation/selected-homologation-2026-10-07/THRESHOLD_APPROVALS.md).
- [ ] **Feita? Não — Concluir validação MIDI de navegação de Pequetita/Aracê**; aceitação do XML escrito não comprova a execução integral.
- [ ] **Feita? Não — Resolver a duração MIDI de Carinhoso e as cinco alterações de Atirei**; o usuário aceitou as versões atuais com ressalvas, sem declarar esses eventos corretos.
- [ ] **Feita? Não — Qualificar Aruê Aruá e Debussy para o critério**; cobertura fonte integral ainda não demonstrada.

## Desempenho — revisão de 2026-10-08

- [x] **Feita? Sim — Diagnosticar demora real em PDF de 15 páginas.** Timeout de 15 minutos seguido de reinício integral confirmado; VPS de 1 CPU. [Relatório](validation/performance-2026-10-08/REPORT.md).
- [x] **Feita? Sim — Implementar e testar localmente timeout sem retry automático.** Retry manual preservado; 22 testes e compilação API passaram.
- [x] **Feita? Sim — Publicar a correção de timeout sem interromper trabalho ativo.** Incluída na release midi-player-20261008 e reconferida no código ativo em 2026-10-08.
- [ ] **Feita? Não — Implementar retomada por checkpoints e progresso por página.**
- [ ] **Feita? Não — Reduzir leituras redundantes com política adaptativa e revisão segura de capas/texto.**
- [ ] **Feita? Não — Medir ganho de tempo e homologar precisão antes de declarar melhoria percentual.**

## Histórico técnico interno — 2026-10-08

- [x] **Feita? Sim — Ocultar relatórios técnicos do detalhe da partitura na web e no código mobile.** Dados internos e bloqueios preservados; 135 testes web e 91 mobile passaram. [Relatório](validation/hide-technical-history-2026-10-08/REPORT.md).
- [x] **Feita? Sim — Publicar a interface web simplificada.**
- [x] **Feita? Sim — Instalar a build 9 no iPhone com a interface simplificada.**

## Entrega automática — solicitação atualizada em 2026-10-08

Esta decisão substitui a exigência anterior de validação manual pelo usuário. Diagnósticos e decisões continuam internos; a escolha automática não comprova precisão musical nem habilita treinamento.

- [x] **Feita? Sim — Finalizar automaticamente o XML escolhido e registrar a decisão do sistema.**
- [x] **Feita? Sim — Remover os controles públicos de aprovação e correção visual na web/mobile.**
- [x] **Feita? Sim — Integrar, publicar e verificar a entrega automática com o player restaurado.** [Registro desta etapa](validation/automatic-delivery-2026-10-08/REPORT.md).
- [x] **Feita? Sim — Instalar a build integrada 1.0 (9) no iPhone.**
- [ ] **Feita? Não — Homologar áudio e fluxo integral no aparelho físico.**
- [ ] **Feita? Não — Liberar primeira página progressivamente e retomar por checkpoints.**
