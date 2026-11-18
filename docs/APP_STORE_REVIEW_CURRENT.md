# Reenvio à Apple — rodada de 08/11/2026

Este registro é o ponto de entrada da rodada atual. Registros de outubro são históricos e não substituem as conferências atuais. A aprovação continua sendo uma decisão da Apple.

**Estado em 09/11.** O usuário confirmou a abertura da partitura e o som no alto-falante do iPhone com o build 18. A compressão ativa no servidor reduziu o componente do leitor de 7,88 MB para 2,39 MB, com 2,13 segundos na medição pública após o ajuste. O candidato 19 incorpora o novo fluxo de conferência. [Investigação e comprovante](../output/apple-review-current/validation/player-loading18.md).

## Estado confirmado

- [x] **Feita? Sim — Cancelar o envio anterior.** Retirada solicitada pelo usuário em 07/11 e confirmada novamente pela API em 08/11: versão 1.0 `DEVELOPER_REJECTED`, envio `6a1d8c80-faf9-47bc-8f6f-fb31292200a1` `COMPLETE`.
- [x] **Feita? Sim — Identificar e selecionar o candidato anterior.** Versão 1.0, build 18 `VALID`, ID `63c6d322-fe45-46c2-905b-f18dcf578f27`, selecionado na Apple, com lançamento `MANUAL`. O usuário confirmou o som sem fones em 09/11. A mudança de conferência motivou o candidato 19.
- [x] **Feita? Sim — Corrigir a opção de lançamento.** A consulta atual confirmou `AFTER_APPROVAL`, divergindo do registro antigo. Alteração para `MANUAL` salva e confirmada pela API em 08/11.
- [x] **Feita? Sim — Inventariar as capturas e a compra.** Inventário inicial pt-BR: uma imagem iPhone, três iPad e quatro Duo. A nota obsoleta do build 15 foi substituída; `premium_unlock` não consumível já está no rascunho de revisão. Novas imagens e estado final estão registrados abaixo.

## Execução e critérios

- [x] **Feita? Sim — Concluir auditoria de código e fluxos.** Login/troca de conta, captura/importação, conferência, versões, repetição, exportação, exclusão de conta e compras inspecionados; defeitos e limites em `output/apple-review-current/audit/mobile-audit.md`. Inspeção de código não é teste físico.
- [x] **Feita? Sim — Implementar correções necessárias.** Consultas isoladas por conta, recuperação de sessão diante de erro temporário, plano indisponível sem paywall indevido e link para política de privacidade. Revisão independente sem bloqueios concretos em `review-material/final-code-review.md`.
- [x] **Feita? Sim — Validar regressões móveis das correções.** Suíte de 301 testes passou antes do último ajuste de autenticação; os seis testes finais de autenticação/concorrência e a tipagem passaram depois. Contagens focais sobrepostas não são somadas como casos distintos.
- [x] **Feita? Sim — Validar as correções e regressões.** Mobile: 301 testes na suíte anterior ao ajuste final de autenticação, seis testes focais e tipagem depois; web: 205; API: 523 aprovados e 17 integrações PostgreSQL opt-in não executadas. Erros iniciais de portas locais foram resolvidos no recheck autorizado, sem banco. [Relatório](../output/apple-review-current/validation/REPORT.md).
- [x] **Feita? Sim — Compilar e conferir o candidato de distribuição.** Archive 1.0 (17), assinatura verificada, bundle `com.scoretomusicxml.app`, famílias iPhone/iPad, iOS mínimo 15.1. API de produção e link de privacidade presentes no bundle; 151 checksums de fonte iguais aos capturados antes da finalização. Pacotes App Store e de teste têm o mesmo bundle JavaScript. [Verificação](../output/apple-review-current/build/artifact-verification.json).
- [x] **Feita? Sim — Concluir upload e processamento do candidato 17.** Apple confirmou `VALID` em 08/11 às 17:59:25 UTC, build `8c9785bd-7615-4125-8b6d-c5084496a2f2`. Selecionado na versão 1.0, estado `PREPARE_FOR_SUBMISSION`, lançamento `MANUAL` e criptografia isenta conferida. Sem submissão à App Review nesta etapa. Cache `tmp/apple-upload-build15/chunks` reutilizado.
- [ ] **Feita? Não — Validar em simuladores livres.** Usar aparelhos existentes, conferir antes se estão em uso e registrar UDID, sistema, build e resultado de cada fluxo.
- [x] **Feita? Sim — Instalar e abrir build 17 no iPhone físico.** Usuário confirmou abertura normal; instalação e número de build conferidos.
- [x] **Feita? Sim — Validar captura de duas páginas e interface de restauração no iPhone.** Usuário confirmou as duas páginas na prévia e benefício ativo/restauração sem erro. Não equivale a uma nova transação Sandbox.
- [ ] **Feita? Não — Concluir validação física da repetição.** A reprodução pelo alto-falante foi confirmada no 18. Duas voltas audíveis no iPhone continuam sem registro.
- [ ] **Feita? Não — Validar em iPad físico.** Usuário informou que pode conectar somente o iPhone; cobertura do iPad em simulador será registrada separadamente.
- [ ] **Feita? Não — Validar transações em Sandbox.** Benefício ativo e restauração sem erro na interface do iPhone confirmados pelo usuário; preço de compra, nova compra, cancelamento e restauração de recibo após reinstalação não comprovados nesta rodada. Não executar cobrança real.
- [x] **Feita? Sim — Conferir o acesso da App Review.** Reconfirmado em 08/11 às 21:08–21:09 UTC: login e entitlement HTTP 200, três de três conversões gratuitas restantes, uma partitura armazenada, logout HTTP 204. Servidor pronto (banco, Redis, worker), suporte e privacidade HTTP 200. Nenhuma cota ou compra consumida. [Preflight](../output/apple-review-current/store/preflight18/final-prod-preflight-2026-11-08.md).
- [x] **Feita? Sim — Capturar e apresentar a galeria atualizada.** Seis JPEGs diretos por iPhone/iPad, todos apresentados ao usuário. Dados sintéticos locais identificados, fonte e resultado coerentes; pacote Debug 18 separado do Release de produção. [Registro](../output/apple-review-current/validation/simulator-ui18.md).
- [x] **Feita? Sim — Atualizar a nota da compra.** Nota genérica da versão 1.0 salva na Apple, removendo referência obsoleta ao build 15 e indicando acesso direto, preço StoreKit, restauração e Sandbox. Estado `READY_TO_SUBMIT` preservado. [Comprovante](../output/apple-review-current/store/iap-updated.json).
- [x] **Feita? Sim — Atualizar e reconciliar as notas do app para 18.** Texto revisado independentemente, salvo alterando somente `notes` e confirmado por GET. Preserva roteiro e distinção entre produtos, campos privados e histórico factual; não alega teste de áudio físico 18 concluído nem transação Sandbox atual. Nenhum campo `[[...]]` foi enviado. [Texto salvo](../output/apple-review-current/review-material/review-notes-saved18.txt).
- [ ] **Feita? Não — Conferir metadados e reenviar app/compra.** Build correto, capturas processadas, privacidade, suporte, direitos, criptografia e lançamento manual; confirmar estado final na Apple.
- [ ] **Feita? Não — Obter e registrar feedback externo de músicos.** Recomendação de validação; não foi alegado beta externo anterior, nem pessoas foram contatadas sem instrução específica.

## Recursos preservados

Diretório de compilação existente: `apps/mobile/ios/build`. Dependências CocoaPods existentes em `apps/mobile/ios/Pods`; `node_modules` ausentes no início. Reutilizar cache npm existente antes de baixar pacotes. Não criar simuladores nem limpar caches por conveniência.

Inventário inicial de 08/11: iPhone 18 Pro QA `F7D8711F-4767-4D94-9B10-228E795F5E2C` (iOS 27.0), iPad Pro 13 QA `1C739622-3958-40F2-850E-CB3426FF3B7D` (iOS 27.0), iPhone Duo `EFFD44A5-4716-43DD-BE1F-FE3CFF4AAF4F` (iOS 27.1), todos ligados. A disponibilidade para esta tarefa foi posteriormente confirmada pelo usuário; nenhum reset foi autorizado ou realizado.

### Isolamento mínimo necessário para testes visuais

Os três simuladores foram inspecionados somente para leitura no Device Hub e exibiram estados preservados do Jogo da Memória Musical: partida no iPad, progresso no iPhone e conclusão de fase no Duo. Não foram encerrados, redefinidos ou usados para instalar este candidato. Os aparelhos físicos continuavam indisponíveis. Por isso a validação visual precisou de estado independente, conforme a exceção prevista nas instruções do usuário. A justificativa e o inventário foram registrados **antes** da criação em `validation/simulator-resources.json`.

- [x] **Feita? Sim — Preparar alternativa isolada mínima.** Dois aparelhos com nomes fixos para reutilização futura, sem clonar nem baixar runtimes: `ScoretoMusicXML iPhone` (`7E0767E5-C851-46C9-9FF7-53BB79B149AE`) e `ScoretoMusicXML iPad` (`A4829934-8239-4D05-A0E4-22683C131599`), ambos iOS 27.0 já instalado. Iniciar somente um por vez durante a validação.
- [ ] **Feita? Não — Concluir execução visual nessa alternativa.** Cache de simulador existente `apps/mobile/ios/build/splash-validation` reutilizado. Demonstração local identificada, separada do pacote Release assinado e dos testes físicos/Sandbox; os estados de câmera, compra e reconhecimento real não serão inferidos das imagens.

Evidências desta rodada em `output/apple-review-current/`; os arquivos de versão, builds, envio, capturas e lançamento manual foram salvos em `store/`, sem incluir credenciais de revisão.

## Ajuste do candidato 18 após teste físico

- [x] **Feita? Sim — Implementar configuração de áudio para mídia no iOS.** Categoria nativa `.playback`, preservada pelo plugin de regeneração, e solicitação protegida de `navigator.audioSession.type = "playback"` no leitor iOS. Sem ativação no lançamento, sem autoplay, sem forçar volume/rota nem habilitar áudio em background.
- [x] **Feita? Sim — Validar regressão focal do ajuste de áudio.** Quinze testes em três arquivos e tipagem móvel passaram; plugin reproduz o AppDelegate atual.
- [x] **Feita? Sim — Compilar/exportar candidato 18.** Cache Release `apps/mobile/ios/build` reutilizado. Archive/entregas 17 preservados; archive assinado e pacotes App Store/teste em `build/candidates/18`. Assinatura verificada; 155 checksums sem divergências; JS dos dois pacotes igual.
- [x] **Feita? Sim — Atualizar pacote de simulador para 18.** Cache Debug existente `apps/mobile/ios/build/splash-validation` reutilizado; compilação e assinatura passaram, instalação por atualização e Info.plist18 conferidos.
- [x] **Feita? Sim — Instalar e abrir candidato 18 no iPhone físico.** Após reconexão pelo usuário, atualização 18 instalada e `bundleVersion=18` conferido. A tentativa inicial 4016 foi retomada com sucesso.
- [x] **Feita? Sim — Confirmar abertura da partitura e som no alto-falante.** Em 09/11, o usuário confirmou “Agora tocou sem fone de ouvido” e mostrou a partitura aberta. A combinação de posições do modo silencioso e saídas de áudio fica sem registro.

- [x] **Feita? Sim — Selecionar 18 na versão 1.0 e manter MANUAL.** API confirmou build `63c6d322-fe45-46c2-905b-f18dcf578f27` VALID, criptografia isenta, versão PREPARE_FOR_SUBMISSION.
- [x] **Feita? Sim — Conferir App Privacy publicado.** UI autenticada mostrou oito tipos vinculados, sem novo questionário necessário nos fluxos auditados. Nome é recebido do painel externo em perfil somente leitura; não foi identificado envio de nome pelo iOS. Política pública confere; comprovante `store/privacy-published18.jpg`.
- [x] **Feita? Sim — Adicionar a compra ao rascunho conjunto pela UI.** `premium_unlock` passou a Pronto para revisão; rascunho avisa para adicionar a versão iOS. Não foi enviado à análise; comprovante `store/iap-draft18.jpg`.
- [x] **Feita? Sim — Executar limpeza específica autorizada nesta conversa.** Só 2.161 objetos `.o/.pcm/.pch` no cache Debug existente foram removidos, após conferir ausência de compilação/arquivos abertos. 1.055.873.872 bytes lógicos; variação de espaço registrada em `validation/authorized-cache-cleanup.json`. Entregas, produto compilado, código, dependências e simuladores preservados. Não ampliou a rotina recorrente.
- [x] **Feita? Sim — Capturar seis novas telas de iPhone 18.** JPEG direto do simulador, 1206×2622, apresentadas ao usuário. Conteúdo sintético, original/resultado coerentes com diferença intencional.
- [x] **Feita? Sim — Conferir repetição visual do 18.** Clipe de 22,73 s com duas quedas de relógio, compassos 2–4 a 76 BPM. Não há áudio no arquivo; audibilidade não inferida.
- [x] **Feita? Sim — Finalizar e apresentar seis capturas 18 de iPad.** JPEG direto 2064×2752; comparação lado a lado, histórico, repetição e MusicXML. Compartilhamento MusicXML nativo aberto sem envio a terceiros. Rolagem do painel até MIDI permanece sem validação por gestos do Device Hub.
- [x] **Feita? Sim — Enviar e conferir o processamento dos novos assets.** Seis iPhone e seis iPad `COMPLETE`. Quatro Duo antigas verificadas intactas e `COMPLETE`; a imagem antiga do grupo iPhone 6,5 foi preservada. [Journal](../output/apple-review-current/store/screenshots-upload-journal.json). Nenhuma imagem antiga foi removida nem reordenada.
- [x] **Feita? Sim — Finalizar a galeria no App Store Connect.** Em 09/11, a API confirmou seis imagens novas de iPhone e seis de iPad na ordem do manifesto, todas `COMPLETE`. As três imagens antigas de iPad foram substituídas. As quatro de iPhone Duo e a imagem de iPhone 6,5 permanecem nos respectivos conjuntos. [Verificação](../output/apple-review-current/store/screenshots-publish-18-verification.json).
- [x] **Feita? Sim — Conferir informações gerais na UI autenticada.** Categoria Música, português (Brasil), direitos de conteúdo declarados e classificação calculada +4 com exceções regionais. Registro em `store/app-info18-verified.txt`; nenhuma mudança especulativa nas declarações.

## Conferência de partituras no candidato 19

- [x] **Feita? Sim — Corrigir o fluxo.** O aviso leva à comparação com o original. O app explica alertas e sugestões de notas ou pausas, permite localizar trechos e mostra as ações disponíveis. **Voltar à partitura** retoma a leitura e **Fechar** encerra os detalhes.
- [x] **Feita? Sim — Validar a interface e os testes móveis.** Passaram 314 testes e a checagem de tipos. Conferência, localização, retorno na mesma posição e fechamento testados no iPad existente `A4829934-8239-4D05-A0E4-22683C131599`, iOS 27.0, usando Debug com o JavaScript revisado e cache `apps/mobile/ios/build/splash-validation`. [Captura](../output/apple-review-current/validation/ipad19-conferencia.jpg).
- [x] **Feita? Sim — Gerar o archive 1.0 (19).** Assinatura e número 19 verificados. Reutilizado `apps/mobile/ios/build`. Arquivos anteriores preservados.
- [x] **Feita? Sim — Exportar os pacotes e carregar o da loja.** O pacote de teste e o da loja têm o mesmo JavaScript de produção. O App Store Connect confirmou o recebimento sem erros. [Verificação](../output/apple-review-current/validation/upload19-result.json).
- [x] **Feita? Sim — Processar e selecionar o build 19 na App Store Connect.** Apple confirmou `VALID`, versão 1.0 com lançamento manual e ainda em preparação. As notas para o revisor foram atualizadas e lidas de volta. [Estado](../output/apple-review-current/store/version-build19-selected.json) · [Notas](../output/apple-review-current/review-material/review-notes-saved19.txt).
- [x] **Feita? Sim — Validar a conferência do build 19 no iPhone físico.** Instalação e abertura confirmadas no iPhone iOS 27.2 `00008160-001A2CD61A28000A`. Em “02 - Festa do Tempo - Flute 1”, a partitura renderizou. A aba **Conferir** explicou a ausência de sugestões; **Voltar à partitura** devolveu a leitura, com breve nova preparação do leitor. **Fechar** devolveu a leitura a partir de Detalhes. O aviso direto e a localização também foram exercitados no iPad simulado. Nenhuma correção foi aplicada à partitura do usuário.
- [x] **Feita? Sim — Reunir o app e a compra no mesmo rascunho.** App Store Connect mostrou os dois itens prontos para envio, iOS 1.0 (19) e Conversões ilimitadas. [Captura do rascunho](../output/apple-review-current/store/review-draft19.png).
- [ ] **Feita? Não — Reenviar o app e a compra para revisão.** Envio adiado a pedido do usuário em 09/11 para corrigir outros pontos. O rascunho permanece sem submissão.

## Abertura e retorno da conferência

- [x] **Feita? Sim — Preservar o leitor na mesma revisão.** A conferência pausa e mantém o leitor principal montado. O comparador usa uma sessão própria e não substitui a posição salva da leitura. Uma mudança de revisão carrega o MusicXML atualizado.
- [x] **Feita? Sim — Antecipar a primeira página.** O leitor nativo inicia o motor em paralelo à recuperação do MusicXML. A notação fica pronta antes do MIDI. A localização por compasso aguarda o mapa quando necessário, e a pausa cancela um início de áudio pendente.
- [x] **Feita? Sim — Validar localmente.** Passaram 319 testes móveis, 208 testes web, a tipagem móvel e a geração do leitor web. No iPad simulado existente `A4829934-8239-4D05-A0E4-22683C131599` (iOS 27.0), o retorno mostrou a partitura em 0:04 e manteve a repetição. Reutilizados o app Debug instalado, Metro e Vite locais. [Captura](../output/apple-review-current/validation/ipad-retorno-sem-recarregar.jpg).
- [x] **Feita? Sim — Instalar e abrir o build Release 21 no iPhone.** Compilação pela pasta existente `apps/mobile/ios/build`, assinatura e JavaScript interno verificados. O build Debug 20 mostrou o seletor de servidores e foi substituído. O 21 abriu sem os servidores locais e exibiu a partitura de viola na posição salva de 0:28.
- [x] **Feita? Sim — Impedir a instalação de Debug no fluxo do iPhone físico.** Regra registrada em `AGENTS.md`. O instalador bloqueou o build Debug 20 e instalou o build Release 21.
- [ ] **Feita? Não — Validar o tempo de abertura no iPhone com o leitor web atualizado.** O build Release 21 inclui o retorno sem recarga e usa o leitor de produção para a primeira abertura. A antecipação das notas foi validada localmente e ainda não foi publicada no servidor. O build 19 continua em rascunho.

## Reabertura pela lista de partituras

- [x] **Feita? Sim — Incluir o leitor no app iOS Release.** Motor e 64 amostras empacotados. O leitor usa uma conexão interna do aparelho para seus arquivos estáticos. O MusicXML continua no armazenamento do app e passa pela ponte privada do leitor.
- [x] **Feita? Sim — Salvar a página renderizada.** Imagem JPEG de uma página por conta e partitura, com revisão verificada, reutilização por até sete dias e limpeza junto da sessão e da exclusão da partitura. No erro, a imagem salva permanece com a opção de tentar novamente.
- [x] **Feita? Sim — Instalar e conferir o build 22.** iPhone iOS 27.2 `00008160-001A2CD61A28000A`, cache `apps/mobile/ios/build` reutilizado. A partitura abriu e o andamento da reprodução foi observado. O usuário ainda viu a tela de carregamento ao reabrir pela lista.
- [x] **Feita? Sim — Ajustar a reabertura após o teste do 22.** Até três prévias recentes disponíveis em memória. Quando há imagem salva, ela ocupa a tela enquanto os controles são preparados. O JPEG pode ser reduzido para páginas densas. O WebKit gerou uma prévia válida para uma partitura fictícia de 64 compassos.
- [x] **Feita? Sim — Compilar e instalar o build Release 23.** Leitor incluído no pacote assinado. Cache de compilação `apps/mobile/ios/build` reutilizado, versão 1.0 (23) lida de volta no aparelho. Passaram 331 testes móveis, 208 testes web e as verificações de tipos.
- [x] **Feita? Sim — Confirmar a reabertura no iPhone com o build 23.** Após voltar à lista e abrir a mesma partitura, o usuário confirmou que as notas aparecem logo, sem a tela cheia de carregamento. O rascunho da Apple segue no build 19.

## Biblioteca e reprodução offline — Release 25, 10/11/2026

- [x] **Feita? Sim — Disponibilizar a biblioteca salva ao abrir.** A lista da conta aparece antes da sincronização em segundo plano. A sessão local permite retomar o app offline após a preparação online.
- [x] **Feita? Sim — Preparar MusicXML para acesso offline.** Instalação Release 25 por Wi-Fi no iPhone Duo; 35 arquivos MusicXML encontrados no armazenamento do app. A compilação reutilizou `apps/mobile/ios/build`, com `CURRENT_PROJECT_VERSION=25`. Os fontes de configuração ainda indicam 19.
- [x] **Feita? Sim — Validar regressões móveis.** A rodada registrou 348 testes móveis aprovados e checagem de tipos.
- [x] **Feita? Sim — Confirmar o uso físico sem rede.** Em 10/11 o usuário confirmou modo avião com Wi-Fi desligado, encerramento e reabertura pelo ícone, lista imediata e abertura/reprodução de uma partitura preparada.
- [ ] **Feita? Não — Atualizar o candidato da App Review.** O último rascunho documentado segue no 19. A autorização de 18/11 cobre sincronização Git e integração de branch. O reenvio à Apple permanece adiado.

Este documento acompanha evidências históricas. Os links em `output/` apontam para arquivos locais preservados, fora do Git. O contexto independente está em `Contexto/CONVERSOR_DE_PARTITURAS.md`.
