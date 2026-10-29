# Roadmap central do Conversor de Partituras

Atualizado em 23 de outubro de 2026. Este é o ponto de entrada para organizar o trabalho após a [auditoria do projeto](audits/project-2026-10-06/audit.md). A prioridade é entregar uma conversão revisável sem perdas silenciosas, mostrar seu estado com clareza e preparar um lançamento verificável nas três plataformas.

As marcações registram somente evidência disponível. **Feita?** na preparação não significa validação concluída. Nas tabelas, implementação/preparação, validação local e homologação têm colunas separadas; **☑ Sim** indica conclusão comprovada e **☐ Não** indica pendência. Uma atividade com código pronto e homologação pendente continua aberta para lançamento.

## Onboarding de primeira abertura — 23/10/2026

- [x] **Feita? Sim — Implementar quatro etapas opcionais.** PDF/foto/scanner, conferência guiada, histórico de versões e estudo por compassos; progresso, Voltar, Continuar, Começar e Pular, em português e inglês.
- [x] **Feita? Sim — Integrar persistência e reabertura.** Preferência por instalação, respeitando conclusão e dispensa; abertura após o splash e antes do login; Configurações → Conhecer o app; rotas subjacentes isoladas para toque e acessibilidade.
- [x] **Feita? Sim — Validar localmente.** 292 testes mobile, tipos e detector de interface aprovados. Quatro etapas, conclusão e replay exercitados no iPhone; layout e áreas reservadas conferidos em iPad/Duo. Nenhum simulador novo ou build nativo desnecessário. [Relatório e capturas](validation/mobile-onboarding/REPORT.md).
- [x] **Feita? Sim — Gerar e instalar o candidato físico.** Build 1.0(16) assinado, exportado e instalado por atualização no iPhone 13 Pro Max e iPad Pro; versão e abertura confirmadas. O usuário confirmou o onboarding na primeira abertura do iPhone. [Evidências](validation/build16-device-test/REPORT.md).
- [x] **Feita? Sim — Receber confirmação funcional do usuário.** Após o roteiro nos aparelhos, o usuário confirmou em 23/10 que testou e tudo funcionou. Build16 foi exportado e carregado no App Store Connect.
- [x] **Feita? Sim — Concluir reenvio à revisão.** Build16 e Conversões ilimitadas reenviados em 23/10/2026 às12:43 (Campo Grande), ambos Aguardando revisão. Resposta de nove itens enviada em duas mensagens com guia visual. Lançamento MANUAL confirmado por API.

## Conferência guiada, histórico e estudo por compassos — 22–23/10/2026

Implementação solicitada pelo usuário, com prévia antes do reenvio à Apple. [Escopo, estados e recursos reutilizados](SCORE_REVIEW_AND_PRACTICE_ROADMAP.md).

- [x] **Feita? Sim — Implementar os três recursos na API, web e app.** Conferência opcional com decisões vinculadas à revisão; histórico imutável autenticado, abertura/exportação; repetição entre ocorrências de compassos no player compartilhado.
- [x] **Feita? Sim — Integrar e validar as proteções de revisão e conta.** Revisão desatualizada, arquivo alterado/ausente, troca de sessão e leitura de versão anterior sem substituir a atual cobertos por testes.
- [x] **Feita? Sim — Executar regressões e compilar localmente.** API, web e mobile aprovados; compilação nativa Debug reutilizada. As contagens e limites estão no relatório da validação local.
- [x] **Feita? Sim — Preparar candidato físico e parear o serviço online.** Build16 instalado no iPhone/iPad; API e player publicados com backup verificado, cinco arquivos API conferidos, worker/compras/schema preservados e URLs HTTPS verificadas. Acesso temporário revogado. [Relatório](validation/build16-device-test/REPORT.md).
- [x] **Feita? Sim — Confirmar homologação funcional pelo usuário.** Em 23/10, o usuário confirmou que testou e tudo funcionou após o roteiro de onboarding, conferência, versões e repetição no candidato16. Casos avançados não detalhados permanecem fora dessa afirmação.
- [x] **Feita? Sim — Preparar build16 no App Store Connect.** Upload aceito, processamento VALID, vinculado à versão1.0, conformidade de criptografia e lançamento MANUAL conferidos; descrição e notas atualizadas, guia visual enviado na conversa da revisão.
- [x] **Feita? Sim — Responder e reenviar à Apple.** Autoria e independência confirmadas pelo titular. Comparação técnica limitada dos três apps registrada; resposta completa enviada. Após autorização específica, contador exclusivo da conta de avaliação ajustado de3 para0 com backup e auditoria, plano gratuito/compras preservados, login e3 conversões verificados. Submissão WAITING_FOR_REVIEW às16:43:07Z de23/10/2026. [Comprovante](../output/apple-review-build16/submission/submitted-build16.png).
- [ ] **Feita? Não — Receber a decisão da Apple e publicar manualmente.** Aguardando nova avaliação; nenhuma publicação automática foi habilitada.

## Melhoria automática e revisão musical integral — 17/10/2026

Escopo confirmado pelo usuário: Adelita completa (16 compassos) e as duas páginas reais Carcassi usadas nos testes (originais 2–3, 67 compassos). Revisão da fonte, melhoria automática, transcrição técnica e aprovação humana têm estados separados. [Relatório e arquivos](validation/omr-automatic-review-2026-10-17/REPORT.md).

- [x] **Feita? Sim — Fixar fontes, escopo e critérios.** PDFs, conversões e referências preservados com hashes; nenhuma referência disponível ao reconhecimento automático.
- [x] **Feita? Sim — Implementar e medir recuperação automática experimental no Mac e Linux.** Três preparações reais, quatro notas recuperadas no compasso 2 da Adelita; 108→112 eventos e 65→69 exatos na avaliação posterior. Guardas, auditoria, aviso e checkpoints versionados; desligada por padrão, sem publicação. [Implementação](validation/omr-automatic-review-2026-10-17/AUTOMATIC.md).
- [x] **Feita? Sim — Auditar a Adelita inteira contra a imagem.** 16 compassos/147 eventos examinados, sem correção inequívoca de evento; graça/ataque do compasso 5 com confiança média. Expressões, dinâmica, articulações, barrés, armaduras e métrica conferidos. Símbolos técnicos e decisões de navegação seguem abaixo. [Auditoria](validation/omr-automatic-review-2026-10-17/ADELITA_REVIEW.md).
- [x] **Feita? Sim — Auditar os 67 compassos Carcassi contra a fonte.** Transcrição por IA e outro leitor de eventos conferem alturas, vozes, inícios, durações, pausas e acidentes, com todos os hashes de recortes verificados. Cópia final: 787 notas e 73 pausas, incluindo quatro pausas editoriais invisíveis. [Revisão aprofundada](validation/omr-automatic-review-2026-10-17/CARCASSI_DEEP_REVIEW.md).
- [x] **Feita? Sim — Corrigir omissões, símbolos falsos e navegação Carcassi.** Passagens, baixos, pausas e sustenidos restaurados; falsos sinais musicais e 16 letras cantadas indevidas retirados; crédito da fonte preservado. Início de repetição editorial visível no 44 impede retorno indevido ao Allegro. Rota: 1–43 uma vez, 44–51 e 52–67 duas vezes; 1.200 ataques. [Auditoria final](validation/omr-automatic-review-2026-10-17/carcassi-final-symbol-audit.json).
- [x] **Feita? Sim — Validar os arquivos finais e repetir no Linux isolado.** XSD, conferência interna, comparação com transcrição e prévias aprovados; Carcassi final com 1.200 ataques MIDI, Adelita experimental com 242 e assistida com 376. Alturas/inícios conferidos contra XML não certificam todas as durações ou fidelidade à imagem. Serviços publicados preservados e saudáveis. [Provas Linux](validation/omr-automatic-review-2026-10-17/LINUX.md).
- [x] **Feita? Sim — Compilar e executar regressões.** 469 testes API aprovados; oito testes PostgreSQL opt-in não repetidos; compilação e revisão independente aprovadas.
- [ ] **Feita? Não — Completar e homologar a Adelita automática.** Persistem 42 eventos alterados, 36 ausentes e um extra, sem graças recuperadas. A3 do compasso 2 continua divergente em voz/duração; ganho parcial experimental não encerra esta atividade.
- [ ] **Feita? Não — Completar a transcrição técnica e as decisões editoriais.** Dedilhados/cordas nas duas partituras, vínculos e extremos de linhas de posição do Carcassi e navegação editorial da Adelita permanecem pendentes; marca circundada do Carcassi 29 ambígua.
- [ ] **Feita? Não — Certificar fidelidade integral e obter aprovação editorial humana.** Auditoria por IA não concede `accuracyVerified`, aprovação humana ou uso para treinamento.
- [ ] **Feita? Não — Publicar/ativar a melhoria.** Código publicado preservado, opção experimental desligada por padrão.
- [x] **Feita? Sim — Conferir registros, arquivos e manifesto da rodada.** Hashes do código/artefatos e links conferidos; [arquivos e limites](../output/omr-automatic-review-2026-10-17/LEIA-ME.md), [comprovante visual](validation/omr-automatic-review-2026-10-17/linux-final-summary.png).

## Correções Adelita e MIDI Carcassi Linux — 16/10/2026

Continuação solicitada após a homologação parcial. Correção da partitura, melhoria automática do reconhecimento, validação XML–MIDI e publicação têm critérios separados; o resultado anterior permanece preservado para comparação.

- [x] **Feita? Sim — Reunir fontes, referências e falhas reproduzíveis.** PDFs reais e saídas Mac/Linux identificados por hashes; Adelita com 147 eventos na referência assistida versus 108 na saída automática, e Carcassi Linux com divergência entre tempo serializado e MIDI bruto. A referência Adelita não tem aprovação editorial humana.
- [x] **Feita? Sim — Preparar e conferir a correção assistida da Adelita.** Novo serviço/comando explícito aplica revisão polifônica vinculada aos hashes do PDF, conversão e revisão, com auditoria de 16 compassos e metadados. Proposta com 147 eventos, três vozes, 12 notas de enfeite e 29 membros de acorde coincide integralmente com a referência assistida; cinco testes e compilação aprovados. O plano também foi regenerado para a conversão Mac fresca. Não altera a saída automática do motor nem concede aprovação editorial humana. [Reparo e limites](validation/omr-corrections-2026-10-17/ADELITA.md).
- [ ] **Feita? Não — Melhorar e homologar o reconhecimento automático da Adelita.** Audiveris continua com perdas; HOMR real gerou 17 compassos para a fonte de 16 e estrutura inválida de acorde, portanto não é doador automático seguro. A correção assistida acima não comprova ganho automático.
- [x] **Feita? Sim — Implementar e testar a correção temporal MIDI do Carcassi Linux.** Frações exatas do próprio motor, verificação de grupos/identidades e reparo auditado de ataques um tick adiantados, somente em fronteiras fracionárias não exatas em binário; note-off acompanha o deslocamento e o resultado passa por comparação estrita. Casos negativos de nota errada/ausente/extra, ambiguidades, deslocamentos indevidos, inteiros e frações binárias preservados. 61 testes MIDI direcionados aprovados; repetição completa no Linux permanece separada abaixo. [Evidências](validation/omr-corrections-2026-10-17/MIDI.md).
- [x] **Feita? Sim — Repetir os testes reais no Mac e conferir o MIDI final separadamente.** Seis chamadas Audiveris, Carcassi 2/2 com retomada/prévia aprovadas e 1.440 ataques MIDI; Adelita automática com 230 ataques e proposta assistida regenerada para a nova conversão, 147 eventos da referência e 376 ataques. A última proteção MIDI foi conferida em processo novo sobre os XMLs dessa rodada, com hashes registrados.
- [x] **Feita? Sim — Repetir e concluir os testes reais no Linux isolado.** Seis chamadas Audiveris; Carcassi 2/2 sem páginas incertas, retomada da página 1 sem nova chamada e prévia antes da página 2. MIDI final aprovado em 1.454 ataques, com 85 pares note-on/off alinhados. Controle Adelita com 230 ataques e nova correção assistida vinculada à base Linux, 147 eventos/376 ataques. Conferência MIDI final separada às 03:53:13 UTC; tentativa inicial limitada a 768 MiB preservada e repetição a 1536 MiB aprovada. API/worker e readiness preservados. [Comprovantes](validation/omr-corrections-2026-10-17/linux-verification.json).
- [x] **Feita? Sim — Executar regressões, compilar e revisar o código.** 464 testes API aprovados; oito testes PostgreSQL opt-in não foram repetidos nesta rodada sem mudança de banco. 61 testes MIDI direcionados e cinco do reparo assistido fazem parte desse total. Compilação aprovada; revisão independente sem achados bloqueantes após reforço dos controles de frações e XML.
- [x] **Feita? Sim — Reconciliar os comprovantes finais das duas plataformas e preparar a entrega.** XMLs e MIDIs conferidos por hashes, planos assistidos vinculados às bases frescas e serviços publicados preservados. [Relatório e limites](validation/omr-corrections-2026-10-17/REPORT.md); [arquivos corrigidos e auditoria](../output/omr-corrections-2026-10-17/manifesto.json). Aprovação editorial humana e publicação continuam pendentes.

## Migração PostgreSQL e homologação do OMR real — 16/10/2026

Execução autorizada pelo usuário após a entrega local dos checkpoints e da prévia. A homologação funcional verifica progresso, liberação antecipada e retomada usando reconhecimento real; fidelidade musical integral e validação em aparelhos exigem evidências próprias.

- [x] **Feita? Sim — Revisar as duas migrations e os ambientes disponíveis.** Somente adição de `conversionProgress` e `conversionPreview` como JSONB opcionais, sem remoção de dados. Audiveris local encontrado; usuário disponibilizou a sessão autenticada do terminal Hostinger, com alvo e versão anterior conferidos antes da aplicação.
- [x] **Feita? Sim — Aplicar e verificar a atualização em PostgreSQL isolado.** PostgreSQL 16.15: atualização de 13 para 15 migrations, backup/restauração real, quatro registros fictícios preservados por hashes, histórico/checksums conferidos e segunda execução sem pendências. Os oito testes de integração antes ignorados passaram. [Evidências](validation/postgres-migration-2026-10-17/REPORT.md).
- [x] **Feita? Sim — Criar backup atual e aplicar/verificar as migrations no banco publicado.** Concluído em 17/10 às 02:19:35 UTC (16/10 às 22:19:35 local): backup novo restaurado em contêiner isolado, atualização de 13 para 15 migrations, duas colunas JSONB opcionais e segunda aplicação sem pendências. Oito tabelas preservadas por contagens/hashes; readiness de banco/Redis/worker saudável, imagens e horários de início da API/worker preservados. A ativação do código dos recursos permanece na etapa de publicação. [Comprovantes](validation/postgres-migration-2026-10-17/PRODUCTION.md).
- [x] **Feita? Sim — Homologar funcionalmente progresso, primeira página antecipada e interrupção/retomada com partituras e OMR reais no Mac.** Audiveris 5.10.2: páginas musicais 2–3 do PDF Carcassi selecionadas em um arquivo de duas páginas; interrupção após a primeira, checkpoint durável e retomada com zero novas chamadas do motor para a página reaproveitada. Prévia de 131.222 bytes lida às 02:21:54 UTC, ainda em processamento e antes da segunda página; retirada ao terminar. Adelita de uma página terminou completa, sem prévia intermediária e com MIDI aprovado. Sem alterar cotas ou registros publicados. [Evidências e limites musicais](validation/omr-homologation-2026-10-17/REPORT.md).
- [x] **Feita? Sim — Corrigir e retestar a divergência XML–MIDI de Carcassi.** O validador adicionava uma tolerância antes de truncar a posição e esperava um tick diferente do emitido pelo Verovio; o caminho legado de partituras simples também foi corrigido após reprodução real. Regressões e controle que continua recusando deslocamento de um tick: 49 testes direcionados aprovados. O XML real inalterado passou com 720 notas mapeadas e 1.440 ataques conferidos em altura/início. Isso não comprova todas as durações nem a fidelidade ao PDF. [Evidências](validation/omr-qualification-2026-10-17/MIDI.md).
- [x] **Feita? Sim — Comparar a Adelita automática com a referência assistida existente.** 147 eventos esperados e 108 reconhecidos; mesmo desconsiderando nomes de voz, restam 25 eventos alterados, 40 ausentes e um extra. O cotejo documenta a reprovação desse critério e não transforma a referência em aprovação editorial humana. [Comparação e escopo](validation/omr-qualification-2026-10-17/REPORT.md).
- [ ] **Feita? Não — Corrigir divergências e aprovar fidelidade musical integral das saídas.** A saída automática da Adelita permanece com omissões e alterações; a proposta assistida foi corrigida na continuação acima, sem aprovação editorial humana. Carcassi ainda exige cotejo com a fonte e apresenta avisos rítmicos. Áudio coerente com o XML não aprova a leitura do PDF. Satie com notação+TAB permanece recusada por incompatibilidade de partes/pautas com o tipo de violão solo.
- [x] **Feita? Sim — Corrigir e retestar as páginas Carcassi marcadas como incertas.** Análise em 2400 px preserva as linhas finas, com os mesmos limiares e proteções; nove bandas por página real, controles de impressão clara/capa preservados e 19 testes direcionados aprovados. Nova execução completa no Mac terminou com cobertura 2/2 sem páginas incertas, retomada/prévia aprovadas e MIDI de Carcassi e Adelita aprovados. Suíte final: 447 testes API e compilação aprovados. [Resultados e limites](validation/omr-qualification-2026-10-17/REPORT.md).
- [x] **Feita? Sim — Homologar funcionalmente retomada, progresso e prévia no runtime Linux usado pelo servidor, em contêiner isolado.** Mesma imagem base, módulos atuais conferidos por hashes, rede desabilitada e sem dados/cotas publicados. Carcassi 2/2 sem páginas incertas; página 1 retomada com zero chamadas do motor, prévia antes da página 2 e retirada ao finalizar. Adelita de uma página sem prévia e com 230 ataques MIDI aprovados. Encerramento sem falta de memória, API/worker preservados e readiness saudável. Isso não é ativação pública do código. [Provas](validation/omr-qualification-2026-10-17/linux-verification.json).
- [x] **Feita? Sim — Resolver e retestar o MIDI de Carcassi produzido no Linux.** Nova conversão Linux com 727 notas/1.454 ataques aprovada após reparo auditado de 85 pares note-on/off por tempo racional exato; a proteção estrita continua recusando eventos incorretos. Repetição Linux própria, separada da saída Mac de 720 notas. [Correção, provas e limites](validation/omr-corrections-2026-10-17/REPORT.md).
- [ ] **Feita? Não — Confirmar a homologação em aparelhos.** Validação de servidor e Mac não comprova esses ambientes.

## Prévia antecipada da primeira página — 16/10/2026

Solicitação autorizada após a entrega local dos checkpoints. A prévia é de leitura e identifica a primeira página da fonte como provisória; resultado, player e exportações finais continuam vinculados à conversão integral. Documentos de uma página não precisam de uma prévia intermediária; primeira página excluída, sem leitura ou fora de suporte não é substituída silenciosamente pela segunda.

- [x] **Feita? Sim — Definir o contrato e os estados da prévia.** Página concluída pelo OMR ou recuperada de checkpoint, revisão própria, acesso autenticado e retirada no fim/falha/troca de tentativa; resultado anterior preservado.
- [x] **Feita? Sim — Emitir a página pronta durante o processamento.** Callback aguardado antes da próxima página, inclusive na retomada; rejeição propagada sem transformar a página em falha parcial. Quatro testes novos e dez regressões de checkpoints aprovados.
- [x] **Feita? Sim — Persistir e servir a prévia privada da execução atual.** Publicação protegida por token, revisão exclusiva e hash do conteúdo; acesso autenticado com reconferência após leitura. Referência retirada no fim/falha/troca de tentativa/exclusão; arquivo removido ao terminar e órfãos antigos recolhidos em próxima tentativa. Tipos da API e esquema Prisma aprovados; migrations aplicadas em QA e no banco publicado na continuação de 16/10.
- [x] **Feita? Sim — Mostrar a prévia na web e no app.** Leitura provisória, carregamento/erro e respostas antigas tratados; textos português/inglês e acessibilidade. No app, a primeira conversão mostra a prévia na área de leitura; uma retentativa mantém a partitura anterior e oferece aviso para abrir a prévia. Consulta separada por conta e respostas vinculadas à sessão que as iniciou.
- [x] **Feita? Sim — Validar localmente o fluxo e as regressões.** Prévia antes do fim, retomada, conta diferente, token antigo, finalização/falha/exclusão, troca de sessão e preservação do resultado anterior aprovados. A rodada inicial passou 854 testes distintos: API 441, web 172 e mobile 241, com oito testes PostgreSQL então ignorados; os oito passaram na continuação com banco QA. Build dos três projetos e tipos mobile finais aprovados. Inspeção visual web dos avisos/carregamento sem corte; aparelhos e OMR real permanecem separados abaixo. [Evidências da rodada inicial](validation/first-page-preview-2026-10-16/REPORT.md).
- [x] **Feita? Sim — Validar e aplicar migrations em PostgreSQL.** Oito testes QA e aplicação no banco publicado aprovados, com backup restaurado e registros preservados; evidências na seção de migração desta entrega.
- [x] **Feita? Sim — Homologar a prévia com OMR real no Mac.** Audiveris 5.10.2, arquivo real de duas páginas, página restaurada por checkpoint, prévia antes da próxima leitura e retirada ao finalizar; controle de uma página sem prévia intermediária.
- [x] **Feita? Sim — Homologar funcionalmente a prévia no runtime Linux usado pelo servidor, em execução isolada.** Página 1 restaurada, prévia de 139.551 bytes antes da página 2 e retirada no término; controle de uma página sem prévia. Provas e limites de áudio na seção atual desta entrega.
- [ ] **Feita? Não — Homologar aparelhos e fidelidade musical integral.** Áudio do Carcassi Linux permanece reprovado; publicação continua separada.
- [ ] **Feita? Não — Publicar servidor/web e distribuir o app.**

## Retomada por checkpoints e progresso por página — 16/10/2026

Solicitação autorizada nesta data. Retomar significa reutilizar páginas reconhecidas de um mesmo arquivo/configuração após interrupção; o resultado final continua passando pela união das páginas e pelas validações existentes. Entregar a primeira página para leitura antes do resultado integral é uma atividade separada.

- [x] **Feita? Sim — Mapear interrupções, tentativas e evidências necessárias para retomada.** Reconhecimento por página identificado; imagens originais/preparadas, candidatos e arquivos nativos acompanham o XML. Proteção por token da execução aplicada também ao progresso.
- [x] **Feita? Sim — Implementar checkpoints privados e duráveis por página.** Gerações imutáveis publicadas atomicamente, hashes de resultados/manifestos/arquivos, invalidação por fonte/configuração/código/runtime e restauração das evidências no novo diretório de trabalho. 17 testes de armazenamento e dez de integração do adapter aprovados. [Contrato e limites](CONVERSION_CHECKPOINTS.md).
- [x] **Feita? Sim — Persistir progresso por página vinculado à execução atual.** Preparação, reconhecimento, validação final e interrupção separados; resultado anterior preservado. Serviços/armazenamento passaram 35 testes locais, incluindo token substituído e retenção. Migration e homologação no ambiente alvo permanecem separadas abaixo.
- [x] **Feita? Sim — Mostrar progresso e páginas reaproveitadas na web e no app.** Contagens reais, etapa final explícita, atualização por consulta e textos em português/inglês. Suítes completas: 163 testes web e 228 mobile aprovados; tipos dos clientes e inspeção web em 375/1280 px aprovados. Aparelhos de distribuição permanecem em homologação.
- [x] **Feita? Sim — Validar localmente retomada, integridade e isolamento entre execuções.** Interrupção/retomada em novo diretório com motor simulado, corrupção/invalidação, falhas, retenção, links simbólicos e regressões aprovados. A rodada original passou 813 testes distintos: API 422, web 163 e mobile 228; build dos três projetos aprovado. Sete testes PostgreSQL foram ignorados nessa rodada; a suíte atual de oito testes passou na continuação com banco QA. [Evidências da rodada original](validation/conversion-checkpoints-2026-10-16/REPORT.md).
- [x] **Feita? Sim — Aplicar/verificar a migration em PostgreSQL isolado.** Atualização real de 13 para 15 migrations, backup restaurado, dados fictícios preservados e oito testes PostgreSQL aprovados na continuação autorizada em 16/10. [Evidências](validation/postgres-migration-2026-10-17/REPORT.md).
- [x] **Feita? Sim — Aplicar/verificar as migrations no banco publicado.** Backup novo restaurado e 15 migrations conferidas em 16/10, sem mudança das oito tabelas existentes. [Comprovantes](validation/postgres-migration-2026-10-17/PRODUCTION.md).
- [x] **Feita? Sim — Homologar interrupção e retomada com Audiveris real no Mac.** Checkpoint da primeira página após interrupção deliberada, nova execução com `reusedPages: [1]` e nenhuma chamada adicional do motor para ela; segunda página reconhecida e resultado unido. Avisos musicais e bloqueio MIDI preservados.
- [x] **Feita? Sim — Homologar funcionalmente checkpoints e progresso com OMR real no runtime Linux usado pelo servidor, em execução isolada.** Carcassi 2/2, checkpoint durável após interrupção, página 1 reaproveitada com zero chamadas e progresso da página 2 observado. [Resultados e limites musicais](validation/omr-qualification-2026-10-17/REPORT.md).
- [ ] **Feita? Não — Homologar aparelhos e qualidade musical integral.** O MIDI Carcassi Linux reprovado na rodada original foi corrigido e repetido nas continuações de 17/10 acima; aparelhos, fidelidade integral e publicação dos runtimes/clientes permanecem separados.

## Upload e preparação confirmados — 16/10/2026

- [x] **Feita? Sim — Enviar o IPA original do build 13 e conferir seu processamento.** Upload Apple concluído, build `132bd72a-c322-4708-8100-41c4c3b90a08`, estado `VALID` e `APP_STORE_ELIGIBLE`. SHA-256 `6583d3e12bc5d91648433b69af6a909d0c0e216e238917eb13b418fb25a642d9` preservado; não houve recompilação nem inclusão das mudanças posteriores de iPhone Duo.
- [x] **Feita? Sim — Preparar o app e a compra no envio existente.** Versão 1.0 selecionada com build 13; app e “Conversões ilimitadas” em **Pronto para revisão**. Notas do scanner e caminho **Ajustes → Conversões ilimitadas** salvos na Apple. Declaração de criptografia isenta conferida e salva. Lançamento configurado como **manual**.
- [x] **Feita? Sim — Conferir contrato e banco.** Consulta ao portal em 16/10: acordo de apps pagos Ativo, banco Ativa e formulários fiscais completos. O botão **Reenviar para Revisão do app** está habilitado; o contrato não bloqueia a preparação atual.
- [x] **Feita? Sim — Confirmar preço e folha de teste no iPhone.** Captura de 16/10 às 18:07 mostra R$ 23,90, cobrança única e aviso Apple de teste sem cobrança. Cancelamento confirmado pelo usuário e captura às 18:10; conta permanece gratuita. A mensagem exibida foi técnica em inglês, não o texto amigável esperado.
- [ ] **Feita? Não — Corrigir e validar a mensagem amigável de cancelamento.** Evidência física: `Calling the 'requestPurchase' function has failed → Caused by: User cancelled the purchase flow`. Não é prova de falha da compra; cancelamento ocorreu. Qualquer correção nativa posterior exige outro build.
- [x] **Feita? Sim — Concluir compra sandbox no iPhone e confirmar o desbloqueio.** Captura de 16/10 às 18:11 mostra sucesso com `[Environment: Sandbox]`; usuário confirmou “Conversões ilimitadas ativas nesta conta”. Sem consulta independente do evento da compra no servidor.
- [ ] **Feita? Não — Concluir restauração no iPad e repetir no iPhone.** Usuário informou que ainda não conseguiu fazer o teste no iPad. [Roteiro e resultados](APPLE_SANDBOX_TEST.md).
- [x] **Feita? Sim — Reconferir login e cota da conta de avaliação.** Após autorização específica do usuário, login e consulta de entitlement responderam HTTP 200 em 16/10 às 22:12:38 UTC. Conta gratuita, 3/3 usados, zero restantes; notas orientam desbloqueio sandbox antes de novo envio. A própria sessão do teste foi encerrada; nenhuma cota foi alterada. O bloqueio inicial da revisão automática foi resolvido com a autorização.
- [ ] **Feita? Não — Reenviar efetivamente à App Review.** Apenas preparação concluída. O envio continua `UNRESOLVED_ISSUES`; ambos os itens estão `READY_FOR_REVIEW`, sem nova entrada na fila.
- [ ] **Feita? Não — Homologar compras de produção antes da liberação pública.** Servidor atualmente configurado para sandbox. O lançamento manual evita liberação automática após aprovação.

[Comprovante visual](validation/apple-upload-build13-2026-10-16/prepared-review.png), [estado final da API](validation/apple-upload-build13-2026-10-16/asc-current.json), [notas salvas](../output/apple-review-build13/review-notes.txt) e [resposta preparada, ainda não enviada](../output/apple-review-build13/apple-reply-draft.txt). As seções datadas de 12–15/10 abaixo preservam o histórico; os estados atuais são os deste bloco.

## Barra abaixo do Wi‑Fi — correção posterior em 16/10/2026

- [x] **Feita? Sim — Reunir navegação e indicadores na mesma coluna.** Frames nativos UIKit para barras nas bordas; coluna extra removida, 76 pt recuperados na tela interna horizontal. Capturas interna/externa conferidas.
- [x] **Feita? Sim — Mover Lixeira e Ajustes para depois de Detalhes.** Ícones e nomes curtos, rotas e toques testados; cartões duplicados do início ocultos no modo lateral.
- [x] **Feita? Sim — Corrigir o reflow e validar localmente.** Cartões medidos pela largura real e andamento sem corte; 220 testes mobile +153 web, tipos, build web e Debug iOS aprovados; fallback iPad renderizado. [Capturas, evidências e limites](validation/iphone-duo-2026-10-16/system-rail/REPORT.md).
- [ ] **Feita? Não — Homologar em hardware e distribuir esta correção.** Acessibilidade integral, novo artefato de distribuição e web pareado permanecem pendentes. IPA 13 da Apple preservado.

## Refinamento do Duo solicitado em 16/10/2026

- [x] **Feita? Sim — Transferir a navegação para a lateral nas telas interna e externa.** Ícones com nomes curtos; rodapé livre, regiões seguras preservadas. Capturas nativas das duas telas conferidas.
- [x] **Feita? Sim — Concentrar abrir/fechar detalhes na barra lateral do leitor.** Duplicatas removidas quando a lateral está disponível; ação testada nas duas telas, com acesso preservado no contrato de acessibilidade.
- [x] **Feita? Sim — Compactar transporte, progresso e andamento.** Faixa única onde cabe, reflow estreito e alvos de 48 CSS px. Reprodução/pausa, posição e andamento responderam aos gestos no simulador.
- [x] **Feita? Sim — Validar o conjunto e registrar novas capturas.** Duo totalmente aberto horizontal, interna/externa vertical e iPad de regressão. 202 testes mobile +153 web, tipos/build aprovados. [Evidências e limites](validation/iphone-duo-2026-10-16/refinement/REPORT.md).
- [ ] **Feita? Não — Homologar em hardware e distribuir o refinamento.** Novo build assinado e web correspondente ainda pendentes; o IPA 13 enviado à Apple foi preservado.

## Adaptação para iPhone Duo — implementação de 16/10/2026

Prioridade confirmada: **leitura da partitura e player na tela interna aberta**. O [planejamento específico](IPHONE_DUO_ADAPTATION_ROADMAP.md) detalha composição, regiões reservadas, continuidade musical, dependências e critérios de aceite.

- [x] **Feita? Sim — Preparar o diagnóstico e o plano.** Estrutura mobile/web e SDK iOS 27.1 inspecionados; foco de uso confirmado com o usuário. Inspeção de código não comprova execução no Duo.
- [x] **Feita? Sim — Implementar e compilar a base de geometria Duo.** Módulo Expo de regiões reservadas, fallback, hooks e cálculo da área segura; testes e build nativo SDK 27.1 passaram. Comportamento nas posturas continua em validação.
- [x] **Feita? Sim — Implementar a primeira entrega de leitura e player.** Área medida, detalhes recolhíveis, navegação do leitor adaptável e sessão por conta/partitura/revisão, invalidada no logout/exclusão. Resize preserva âncora/posição; retorno aguarda ação para tocar.
- [x] **Feita? Sim — Validar código e primeira entrega nativa local.** 168 testes mobile e 142 web passaram, além dos typechecks, build web e build iOS Debug. Tela externa vertical, leitura interna, painel lateral e retomada pausada em 0:09/118 BPM confirmados com dados fictícios. [Evidências e limites](validation/iphone-duo-2026-10-16/REPORT.md).
- [x] **Feita? Sim — Implementar a adaptação do app completo.** Navegação comum, oito rotas, importação/conferência do scanner e fonte por janela integradas ao leitor/player. Nomes do perfil quebram linha, barra lateral amplia com a fonte e conferência respeita Reduzir Movimento. Regras existentes preservadas.
- [x] **Feita? Sim — Concluir testes e integração local das seis etapas.** 181 testes mobile e 144 web (**325**) aprovados, tipos/build web, Debug nativo e archive Release arm64. Capturas confirmam telas secundárias e perfis fictícios comum/admin. [Relatório final](validation/iphone-duo-2026-10-16/final/REPORT.md).
- [x] **Feita? Sim — Preparar o candidato de engenharia e o manifesto host/web.** Archive local 1.0(13) sem assinatura de distribuição, endpoints HTTPS confirmados no bytecode, 94 hashes do archive e 73 arquivos web pareados. IPAs anteriores preservados; nenhuma publicação executada.
- [ ] **Feita? Não — Concluir a matriz interativa de validação.** Mac bloqueado interrompeu áudio nas posturas, fonte máxima após correção, gestos, VoiceOver e Split View. iPad instalado ficou no diálogo de abertura; iPhone com app pré-existente preservado e Android sem SDK/ADB. Capturas não substituem essa validação.
- [ ] **Feita? Não — Homologar em aparelho.** Confirmar leitura, áudio, gestos e acessibilidade; Duo físico ainda não homologado.
- [ ] **Feita? Não — Concluir a distribuição após homologação.** Próximo número de build, assinatura/exportação e publicação/conferência do web pareado pendentes. A página pública responde, mas seus assets ainda diferem dos desta entrega. TestFlight/App Store continuam posteriores.

## Compra e restauração sandbox — preparação de 15/10/2026

- [x] **Feita? Sim — Conferir produto, preço e artefatos.** `premium_unlock` é não consumível, `READY_TO_SUBMIT`, disponível no Brasil e com preço cadastrado R$ 23,90. O build 13 de desenvolvimento já está instalado nos dois aparelhos. Treze testes mobile e seis de vínculo da API passaram; ainda não comprovam StoreKit real.
- [x] **Feita? Sim — Habilitar a verificação sandbox no servidor.** Três raízes oficiais da Apple conferidas e ativas em 15/10 às 20:09:12 UTC. API saudável, `isConfigured: true`, mesma imagem v7, worker preservado e readiness completa. [Evidência](validation/apple-sandbox-2026-10-15/server-readiness.json).
- [x] **Feita? Sim — Criar e conferir a conta sandbox.** Criação confirmada pelo usuário e por uma conta de teste visível no App Store Connect, região Brasil; sem última compra exibida. Login nos aparelhos ainda não confirmado.
- [x] **Feita? Sim — Conferir os formulários fiscais enviados.** A captura de 15/10 às 23:10 mostra Brasil e formulários EUA Ativos; questionário México Concluído. A evidência é de status, sem homologação do conteúdo declarado.
- [x] **Feita? Sim — Conferir o contrato de apps pagos e o banco ativos.** Portal consultado em 16/10: acordo pago Ativo e banco Ativa. Substitui o estado Processando de 15/10.
- [ ] **Feita? Não — Concluir login nos aparelhos.** Entrar na conta sandbox e usar a mesma conta gratuita dedicada do app nos dois aparelhos.
- [x] **Feita? Sim — Registrar login sandbox no iPhone e bloqueio de preço.** Usuário confirmou a conta sandbox no iPhone; captura de 15/10 às 17:34 mostra oferta aberta com `Preço indisponível`. Produto, preço Brasil, localização e capacidade foram reconferidos na Apple, sem divergência encontrada; não comprova cancelamento/compra.
- [x] **Feita? Sim — Retestar o preço no iPhone.** Em 16/10, usuário confirmou o preço e a captura da folha Apple mostra R$ 23,90 com aviso de teste sem cobrança. [Registro](APPLE_SANDBOX_TEST.md).
- [ ] **Feita? Não — Homologar cancelamento, compra no iPhone e restauração no iPad/iPhone.** Executar o [roteiro](APPLE_SANDBOX_TEST.md) e conferir eventos no servidor; plano sincronizado sozinho não prova restauração.
- [ ] **Feita? Não — Validar ambiente de compras de produção antes do lançamento público.** O servidor seleciona atualmente um único ambiente Apple, configurado como sandbox; a preparação de teste não homologa compras de produção.

## Reconhecimento automático v7 — ativo no servidor — 15/10/2026

- [x] **Feita? Sim — Implementar a reconciliação automática geral v7 dentro do suporte declarado.** Uma parte/pauta/voz, até três páginas e 200 compassos, exatamente dois candidatos Audiveris saudáveis, HOMR source-only e âncoras projetadas por transformação de recorte/preenchimento validada por hashes. A prova de pixels da própria página é necessária para pausas iniciais que só aparecem no leitor independente. Sem seleção por título/hash, `accuracyVerified` ou treinamento.
- [x] **Feita? Sim — Retestar o pipeline completo localmente para as duas fontes.** SONATA: 37 compassos/148 tempos, nove operações, incluindo o compasso 4, armadura de dois bemóis, seis alterações para Mi♭ nos compassos 2–3 e o Ré4 de colcheia no 5; 199 eventos do núcleo coincidem com a cópia assistida. “Quem sabe?!”: 52 registros de compasso (anacruse 0 e compassos 1–51)/205 tempos, doze operações, incluindo armadura de um bemol, cinco pausas iniciais, três alterações para Si♭4 no compasso 4 da numeração da fonte, pausas extras removidas nos compassos 17 e 47 e fermata no 32.
- [x] **Feita? Sim — Validar localmente o código e a execução v7.** 390 testes API e 17 testes Python passaram; seis testes de banco opt-in foram ignorados. Build e lint passaram. Web e mobile não tiveram alterações nesta rodada.
- [x] **Feita? Sim — Comparar semanticamente a saída v7 de “Quem sabe?!” com a cópia assistida.** Os 52 registros de compasso (anacruse 0 e compassos 1–51), 223 notas/pausas e 205 tempos coincidem em altura e duração; controles 5, 13–15 e 49 coincidem com o candidato automático original. A comparação não homologa a fonte. [Relatório local](../tmp/recognition-fix-2026-10-15/automatic-v7/QUEM_SABE_SEMANTIC_COMPARISON.md).
- [ ] **Feita? Não — Fazer a revisão editorial humana integral das duas saídas.** As conversões terminaram com status de reconhecimento `needs_review`; `accuracyVerified` e `trainingEligible` permanecem falsos. Estes dois retestes não homologam fidelidade geral.
- [ ] **Feita? Não — Validar o comportamento em um corpus independente e em outras estruturas de partitura.** A evidência atual cobre somente as duas fontes registradas nos resumos locais.
- [x] **Feita? Sim — Retestar as duas fontes na imagem Linux do servidor.** SONATA: 37 compassos, nove operações e 313,334 s; “Quem sabe?!”: 52 registros, 12 operações e 420,680 s. Todos os eventos escritos, armaduras e durações coincidem com as saídas locais; MIDI aprovado nos dois casos. Linux: 384 testes API e 17 Python passaram, 12 opt-ins ignorados (seis PostgreSQL e seis fixtures MIDI, estas exercitadas no Mac).
- [x] **Feita? Sim — Ativar o v7 no servidor e verificar a implantação.** Em 15/10, 19:38:23 UTC (15:38:23 local), API/worker saudáveis na imagem `converter-api:recognition-v7-20261015`, ID `85e3b67c241345f7353a0d2ce7d2c6ac1ffd722ab3018ae3ce1414628b991d73`. Nove arquivos de runtime conferidos, leitor independente ativo, cinco tabelas e 1.087 arquivos preservados; backup e rollback disponíveis. Nenhuma cota consumida pelos testes. [Registro](validation/recognition-fix-2026-10-15/server/automatic-v7/production-verification.json).
- [x] **Feita? Sim — Preservar o candidato Apple build 13.** Os 115 hashes de fonte e o IPA App Store permanecem iguais aos instalados; a correção foi publicada no serviço de reconhecimento.
- [ ] **Feita? Não — Validar um novo envio nos aparelhos com o v7 e concluir compra/restauração sandbox.** As confirmações anteriores de câmera/duas prévias continuam registradas no histórico.
- [x] **Feita? Sim — Fazer upload e selecionar o build 13.** `VALID`, selecionado em 1.0 e preparado em 16/10.
- [ ] **Feita? Não — Reenviar a submissão à App Review.** App e IAP prontos para revisão, aguardando a ação final.

Os resumos completos permanecem em `tmp/recognition-fix-2026-10-15/automatic-v7/full-pipeline/`, ignorados pelo Git. Consulte também o [plano técnico de reconhecimento](NOTES_RHYTHM_CORRECTION.md).

## Histórico v6/v6.1 e build 13 — 15/10/2026

- [x] **Feita? Sim — Implementar os controles de reconhecimento e clareza de qualidade.** Bloqueio de exportação Audiveris incompleta mesmo com saída zero, conferência de armadura/contagem da fonte e avisos distintos de divergência e conferência insuficiente em API/web/mobile. [Plano atualizado](NOTES_RHYTHM_CORRECTION.md).
- [x] **Feita? Sim — Produzir propostas assistidas para SONATA e Quem sabe?!.** Trechos declarados corrigidos e XML/MIDI verificados, com originais preservados; 37/148 e 52/205 compassos/registros e tempos, respectivamente. Não são nova leitura automática nem referência editorial homologada. [Propostas](../output/recognition-review-2026-10-15/README.md).
- [x] **Feita? Sim — Validar localmente e preparar o build 13.** A rodada anterior ao patch teve 631 aprovações (350 API, 137 web, 133 mobile e 11 Python; seis PostgreSQL opt-in ignorados). O build 13 foi assinado e instalado em iPhone/iPad; abertura confirmada no iPhone e, manualmente, no iPad. O IPA não foi alterado na atualização de servidor v6.1. [Relatório](validation/recognition-fix-2026-10-15/REPORT.md), [preparação Apple](APP_STORE_RESUBMISSION_2026-10-12.md).
- [x] **Feita? Sim — Validar a suíte distinta após a atualização v6.1.** 635 testes passaram: 354 API (348 Linux + seis testes MIDI únicos no Mac), 137 web, 133 mobile e 11 Python. No Linux, seis testes PostgreSQL e seis casos dependentes de fixtures MIDI foram ignorados; os dois grupos MIDI no Mac passaram 45 testes, dos quais 39 eram repetidos e não foram somados novamente.
- [x] **Feita? Sim — Confirmar o scanner do build 13 no iPad, da prévia ao resultado.** Em 15/10/2026, o usuário confirmou “Abriu e mostrou as duas páginas”. O PDF A4 tinha duas páginas e foi enviado; na execução original v6, ambas foram processadas e nenhuma ficou ausente, com a primeira marcada incerta e resultado parcial. A reclassificação v6.1 não refez nem alterou essa conversão. Isso confirma o fluxo, não a fidelidade musical. Evidência operacional local, ignorada pelo Git: `docs/validation/recognition-fix-2026-10-15/server/ipad-build13-pdf-verification.json`.
- [x] **Feita? Sim — Preservar a implantação v6 de 15/10 como histórico dos retestes OMR completos.** O servidor `recognition-v6-20261015` fez retestes isolados de SONATA e “Quem sabe?!”; oito módulos e 1.058 arquivos foram verificados, sem consumo de cota. Essa evidência antecede v6.1 e não representa a versão atualmente ativa.
- [x] **Feita? Sim — Ativar e verificar v6.1 em produção em 15/10/2026, 16:44:53 UTC (12:44:53 local).** `converter-api:recognition-v6-1-20261015`, image ID `d5f0fb0e9071b6c9b91149be970b4d689848e2edd6a17aab3d0e0a49c9e19646`; API e worker saudáveis, readiness de banco/Redis/worker `true`. Os totais (35 scores, 33 users, 30 entitlements, 62 usage, 16 attempts) e 1.087 arquivos coincidem antes/depois. A primeira ativação sofreu rollback porque Docker ainda estava `starting`; após ajustar a espera do healthcheck, a segunda passou. Build 13 permaneceu inalterado; 115 hashes de fonte conferidos iguais. A classificação isolada real passou a página 1 de CORAL SANTO ANTÔNIO de `uncertain` para `musical`; página 2, SONATA e “Quem sabe?!” ficaram no fastpath, sem mudança. Nenhuma conversão OMR foi reexecutada em v6.1.
- [ ] **Feita? Não — Homologar editorialmente as páginas completas e a reconstrução automática.** O v7 já foi implementado e retestado localmente nas duas fontes, mas ambas as saídas seguem em revisão; corpus independente e conferência humana integral continuam necessários.
- [x] **Feita? Sim — Corrigir e ativar a classificação da primeira página de CORAL SANTO ANTÔNIO.** A avaliação real v6.1 encontrou duas bandas de cinco linhas em 1,75° (dark 0,656; continuidade 0,62), mantendo `geometry.status: unknown` e `staffBands: []`. A página mudou de `uncertain` para `musical`; não foram inferidos coordenadas, associação ou recorte. A implantação está ativa; a conversão antiga permanece parcial e sem alteração.
- [x] **Feita? Sim — Testar cancelamento, reabertura do scanner e prévia de duas páginas no iPhone/build 13.** Em 15/10, o usuário confirmou a sequência solicitada: “Abriu novamente e mostrou as duas páginas”. O relato confirma a captura e a conferência; não comprova PDF binário, envio ou conversão desse teste.
- [ ] **Feita? Não — Validar permissão negada e recuperação pelos Ajustes.** Esse caminho ainda não foi confirmado nos aparelhos; cancelamento/reabertura no iPad e toques rápidos também permanecem sem validação.
- [ ] **Feita? Não — Validar compra e restauração no sandbox.** O suporte está incluído no build, mas os fluxos de compra e restauração seguem pendentes.
- [ ] **Feita? Não — Reenviar a versão à App Review.** Não houve upload nem submissão nesta rodada. Captura de 15/10 às 23:10 mostra acordo pago e banco Processando; compra e restauração reais continuam pendentes.

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
| R24 | Unificar versão/build e incremento por plataforma. Aceite: Expo, projeto nativo, IPA/AAB final e próximo número disponível na loja correspondem. F15. | iOS e Android | ☑ Sim — fontes e incremento por plataforma; candidato 12 | ☑ Sim — Expo/nativo/IPA 1.0 (12), assinatura e instalação no iPad/iPhone; abertura iPhone confirmada; Apple ainda no build 6 | ☐ Não — envio Apple, AAB e próximo código Play |
| R25 | Configurar e verificar assinatura Android de produção. Aceite: certificado do AAB final corresponde à credencial de upload correta; o caminho local e o EAS são documentados. F16. | Android | ☐ Não — fallback debug removido; credencial final pendente | ☑ Sim — fontes/preflight; não confirma assinatura | ☐ Não — certificado do AAB |
| R26 | Resolver requisito offline do player. Aceite: origem local segura e comportamento sem rede comprovados, ou expectativa de conectividade documentada de forma consistente. F14. | Mobile e produto | ☑ Sim — expectativa online explícita | ☑ Sim — documentação/interface/contrato coerentes | ☑ Sim — alternativa documental; aparelhos em R29 |
| R27 | Oferecer acesso direto a Conversões ilimitadas, exibir preço da loja e bloquear compra sem produto carregado. Aceite: carregamento/falha, compra, restauração e revogação/reembolso testados nas plataformas aplicáveis. F13. | Compras | ☑ Sim — Ajustes, título e proteção de conta paga | ☑ Sim — catálogo/estado/preço, acesso sem cota esgotada e bloqueios; suíte mobile atual com 129 testes | ☐ Não — acordo pago ativo e compra/restauração/revogação reais |
| R28 | Revisar manifesto de release e declarações de dados. Aceite: permissões necessárias justificadas, demais removidas, App Privacy/Data Safety refletem o artefato final. F26. | Privacidade e lojas | ☑ Sim — permissões fonte e checklist de dados | ☑ Sim — preflight fonte | ☐ Não — manifesto/declarações finais |
| R29 | Homologar fluxo e áudio em aparelhos de release. Aceite: referência real e duas vozes; timbres; 5 minutos contínuos; pause/seek/background/interrupções; câmera; compartilhamento; leitor de tela; tablets e Back. | Qualidade mobile | ☐ Não — matriz preparada; scanner VisionKit e conferência de PDF implementados | ☐ Não — 129 testes mobile e revisão estática; archive/instalação 12 conferidos, matriz funcional aberta | ☐ Não — iPhone12 scanner/envio e uma página da mesma SONATA chegaram a Convertido; cobertura subiu de 22 para 36 registros, mas com perdas rítmicas e armadura tardia; PDF com duas páginas, scanner iPad12, áudio, compras e acessibilidade pendentes |
| R30 | Conferir situação atual das lojas e concluir checklist de publicação. Aceite: URLs públicas de privacidade/suporte, contato definitivo, conta de revisão, IAP e status atual registrados por evidência datada. | Lojas | ☐ Não — conta e páginas verificadas; acordo pago Novo e reenvio pendentes | ☑ Sim — consulta Apple, login/vinculação da conta de revisão e conteúdo público sem sessão em 12/10 | ☐ Não — acordo pago, Play, compra real e reenvio |

Referências: [áudio](PLAYER_AUDIO_QUALITY_ROADMAP.md), [Android](ANDROID_RELEASE_RUNBOOK.md), [App Store](APP_STORE_SUBMISSION.md) e [Google Play](GOOGLE_PLAY_SUBMISSION.md). O registro Apple de setembro é histórico; não equivale a confirmação de aprovação em outubro.

### Preparação Apple — 12/10/2026

- [x] **Feita? Sim — Corrigir tratamento e apresentação do scanner e adicionar Ajustes → Conversões ilimitadas.** [Alterações, testes e roteiro](APP_STORE_RESUBMISSION_2026-10-12.md); compra permanece disponível para revisão sem consumir a cota gratuita primeiro.
- [x] **Feita? Sim — Gerar IPA assinado 1.0 (11) e instalar a cópia Release de teste no iPad/iPhone.** Assinaturas, manifesto final e hash do bundle conferidos; instalação e processo iniciado confirmados. Não houve upload à Apple.
- [x] **Feita? Sim — Validar o fluxo anterior por foto no iPad.** Reifison confirmou **“Abriu e mostrou a foto”** e **“Enviado pelo ipad, conversao foi parcial”** no build 11, em 12/10/2026. Não comprova fidelidade musical, causa das perdas ou o scanner nativo do build 12.
- [x] **Feita? Sim — Implementar scanner de documentos no iOS e conferência de todas as páginas.** VisionKit em módulo Expo local, um PDF por envio, limites explícitos e limpeza de arquivos. 129 testes mobile, TypeScript e revisão independente passaram. [Avaliação da captura](SCAN_IMAGE_GUIDE.md).
- [x] **Feita? Sim — Gerar e instalar o candidato 1.0 (12).** Archive/exports e assinaturas conferidos; módulo scanner compilado/registrado; instalado no iPad/iPhone com os perfis existentes. Build/processo no iPhone confirmados; abertura automática no iPad recusada porque estava bloqueado.
- [x] **Feita? Sim — Registrar scanner nativo e envio do PDF no iPhone.** No iPhone 13 Pro Max com build 12, o usuário confirmou abertura/conferência e envio em “Processando”. A pergunta incluía duas prévias, mas o PDF recente recebido tem uma página; o teste com duas páginas continua aberto.
- [x] **Feita? Sim — Reconciliar o arquivo/status informado pelo usuário.** Em 13/10, corrigiu o parcial por captura de tela para `scan.jpg`, 534,3 KB, “SONATA Nº 1”. O PDF recente “Quem sabe?!” aparece “Convertido” e tem uma página; o relato corrigido não comprova falha do scanner nativo.
- [x] **Feita? Sim — Comparar o PDF recente do scanner com sua saída musical.** Fonte inteira, nove sistemas e 52 compassos na saída; verificadas perdas de armadura, pausas e fermata, e pausa extra no 17. [Evidência](../tmp/iphone-partial-2026-10-13/diagnosis.json). Esse arquivo aparece “Convertido” e é uma análise separada do scan.jpg parcial; não aprova fidelidade completa.
- [x] **Feita? Sim — Comparar o scan.jpg parcial correto.** Fonte inteira, oito sistemas e 37 compassos; XML com oito grupos de sistema, mas 22 registros de compasso, com conteúdo perdido nas sete primeiras linhas. Repetições e hairpins ausentes. Classificador local marca a página como incerta; causa no servidor ainda não confirmada. [Diagnóstico](validation/scan-jpg-partial-2026-10-13/REPORT.md).
- [x] **Feita? Sim — Comparar a mesma SONATA pelo scanner nativo do iPhone.** Em 13/10, novo PDF de uma página chegou a Convertido. XML com 36 registros e repetições/hairpins, contra 22 da foto anterior; ainda faltam 4,5 tempos no início e a armadura só começa no XML 4. [Comparação](validation/sonata-native-2026-10-13/REPORT.md).
- [ ] **Feita? Não — Corrigir e homologar a fidelidade musical das saídas.** Foto e PDF têm defeitos; auditoria nota a nota, correções e PDF com duas páginas continuam pendentes. A identidade dos arquivos foi reconciliada.
- [x] **Feita? Sim — Validar scanner nativo e envio do PDF no iPad/build 13.** Duas prévias confirmadas e PDF binário com duas páginas, ambas processadas; resultado parcial registrado em 15/10, sem homologação musical.
- [x] **Feita? Sim — Confirmar cancelamento e reabertura no iPhone/build 13.** O usuário confirmou a sequência e duas páginas na conferência em 15/10; envio desse novo teste ainda não foi verificado.
- [ ] **Feita? Não — Validar ajuste dos cantos, permissão negada, toques rápidos e cancelamento/reabertura no iPad.** A confirmação no iPhone não cobre esses casos restantes.
- [ ] **Feita? Não — Conferir resultado com a fonte, compra e restauração reais.** Qualidade musical e acordo pago ativo continuam necessários.
- [ ] **Feita? Não — Selecionar o build 12 e reenviar à Apple.** A versão rejeitada ainda usa o build 6; manter o IAP no mesmo envio.

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
- [x] **Feita? Sim — Implementar retomada por checkpoints e progresso por página.** Código local e testes de recuperação/isolamento aprovados em 16/10; publicação, banco alvo e aparelhos permanecem na seção atual desta entrega.
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
- [x] **Feita? Sim — Retomar por checkpoints entre tentativas.** Implementação local em 16/10; homologação e publicação separadas acima.
- [x] **Feita? Sim — Liberar primeira página progressivamente antes do resultado integral.** Implementação local em 16/10, inclusive após retomada por checkpoint; leitura provisória na web/app, com acesso autenticado e resultado anterior preservado. Homologação e publicação separadas na seção atual desta entrega.

## Player PT/EN e TestFlight — 17/10/2026

- [x] **Feita? Sim — Publicar o reprodutor nos dois idiomas e verificar recursos e saúde em produção.**
- [x] **Feita? Sim — Gerar e distribuir a versão 1.0 (14) no TestFlight interno.**
- [x] **Feita? Sim — Aplicar a declaração de criptografia autorizada e notas PT/EN.**
- [ ] **Feita? Não — Testar no aparelho físico a atualização, preferência persistida e lojas BR/EUA/Canadá.**

[Relatório da entrega](validation/testflight-build14-2026-10-17/REPORT.md).

## Compra: cancelamento e instalação direta — 17/10/2026

- [x] **Feita? Sim — Confirmar restauração do iPhone no servidor.** Build 13: `purchase_restored` e `entitlement_changed` em 17/10 às 15:26:15, mesma conta da compra original.
- [x] **Feita? Sim — Corrigir e testar cancelamento PT/EN.** Rejeição envolvida do expo-iap e callback tratados; erros da API preservados. 254 testes mobile aprovados e TypeScript aprovado.
- [x] **Feita? Sim — Gerar e instalar diretamente o build 15 no iPhone.** Atualização sem desinstalação, versão conferida e benefício ativo preservado. IPA de distribuição preparado; o usuário dispensou continuar pelo TestFlight.
- [ ] **Feita? Não — Confirmar cancelamento físico — DISPENSADO pelo usuário em 17/10.** Não executado; não bloqueia o reenvio por si só. Correção e testes automáticos aprovados; nenhum novo par de contas necessário nesta etapa.
- [ ] **Feita? Não — Concluir homologação física e reenvio do build 15.** Restauração no iPad e demais fluxos do candidato mantêm validações próprias; IPA ainda não enviado.

[Evidências e roteiro](validation/apple-cancellation-2026-10-17/REPORT.md).


## Continuação iPhone Duo — 22/10/2026

- [x] **Feita? Sim — Confirmar leitura e continuidade do player no simulador reutilizado.** UDID `EFFD44A5-4716-43DD-BE1F-FE3CFF4AAF4F`, iOS 27.1; leitura pausada nas duas telas/paisagens/dobras e ciclo fechado → aberto → giro → parcial → fechado com reprodução ativa em 20 BPM. Fonte estabilizada após detectar recargas de desenvolvimento de outra implementação.
- [x] **Feita? Sim — Confirmar pausa e restauração.** Segundo plano e reabertura de rota retornaram a 1:02/20 BPM, sem autoplay.
- [x] **Feita? Sim — Corrigir a margem dos títulos solicitada durante o teste.** Recuo comum de 24 pt no leitor e nos demais cabeçalhos adaptativos; confirmado no leitor e Perfil. Quatro testes existentes de layout e tipo mobile aprovados após o ajuste.
- [x] **Feita? Sim — Revalidar as suítes disponíveis no início da rodada.** 254 testes mobile e 172 web, total 426 distintos, e ambos os typechecks aprovados. Verificações posteriores da implementação paralela permanecem próprias daquela entrega.
- [ ] **Feita? Não — Concluir a homologação restante.** Fonte máxima/VoiceOver, escuta e Duo físico, scanner, multitarefa, outras plataformas e alcance de paginação/última ação com os novos controles de estudo em janelas baixas. Sem publicação ou novo build de distribuição nesta rodada.

[Roadmap detalhado](IPHONE_DUO_ADAPTATION_ROADMAP.md) e [evidências e limites de 22/10](validation/iphone-duo-2026-10-22/REPORT.md).
