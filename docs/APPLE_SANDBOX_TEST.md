# Teste sandbox de compra e restauração — Apple

Atualizado em 17/10/2026. Este registro preserva a compra e a restauração no iPhone com build 1.0 (13), a pendência de restauração no iPad e a atualização posterior do iPhone para o candidato corrigido 1.0 (15).

## Backend atualizado e nova restauração — 17/10/2026 às 19:24

- [x] **Feita? Sim — Instalar e conferir o backend de compras.** Modo auto com assinatura Apple, ambientes isolados e histórico persistente; 13/13 verificações administrativas, saúde pública 200, worker preservado e compra anterior mantida. Notifications V2 configuradas; lançamento manual preservado.
- [x] **Feita? Sim — Repetir restauração real no iPhone após a implantação.** Usuário respondeu “Não apareceu mensagem” ao roteiro no iPhone com build 15. Servidor confirmou `purchase_restored` em **17/10/2026 às 19:24:01**, seguido de `entitlement_changed`; fonte Apple, ambiente sandbox, produto `premium_unlock`, transação presente, direito pago ativo e uma compra no histórico, sem duplicação. A resposta visual isolada não foi tratada como sucesso; a evidência foi a auditoria do backend.
- [ ] **Feita? Não — Repetir restauração física no iPad.** Ainda sem confirmação.
- [ ] **Feita? Não — Validar notificações assinadas de reembolso/reversão e compra real de produção.** Ainda sem transação de produção e sem cobrança real; [registro atualizado](APPLE_PRODUCTION_VALIDATION.md).

## Continuação — correção do cancelamento e build 15

- [x] **Feita? Sim — Corrigir e testar o cancelamento técnico.** Callback e rejeição de `requestPurchase` agora exibem “Compra cancelada.” / “Purchase canceled.” para cancelamentos conhecidos, preservando pagamento adiado e falhas reais. 254 testes mobile e TypeScript aprovados. [Registro](validation/apple-cancellation-2026-10-17/REPORT.md).
- [x] **Feita? Sim — Instalar o candidato corrigido diretamente no iPhone.** Versão 1.0 (15) instalada e confirmada, sem desinstalação; abertura, sessão e benefício ativo observados. Build 14 e evidência anterior preservados. TestFlight dispensado pelo usuário.
- [ ] **Feita? Não — Validar cancelamento físico no build 15 — DISPENSADO pelo usuário em 17/10.** Reteste não executado, sem bloqueio próprio para o reenvio; não é necessária criação de outro par de contas nesta etapa. Correção e testes automáticos PT/EN aprovados; preservar compra e histórico originais.
- [x] **Feita? Sim — Reenviar o build 15 à Apple.** Envio concluído em 17/10; app e compra aguardam revisão com lançamento manual. Nova restauração iPhone confirmada posteriormente às 19:24:01.
- [ ] **Feita? Não — Concluir demais validações físicas.** Restauração no iPad, scanner/player e persistência PT/EN mantêm validação própria; resultados anteriores não homologam automaticamente todo o novo build.

## Preparação de 17/10/2026

- [x] **Feita? Sim — Deixar a oferta aberta no iPhone físico.** Instalação 1.0 (13) confirmada, app reiniciado e botão “Restaurar compra” disponível; plano já ativo antes do teste. Compra e histórico preservados.
- [x] **Feita? Sim — Executar o fluxo físico de restauração no iPhone.** Usuário tocou em Restaurar compra e informou login Apple seguido de fechamento após inserir a senha. Conferência visual às 15:26: oferta fechada, tela Partituras sem erro visível, benefício ativo. Resultado da interface compatível com sucesso; não comprova isoladamente a auditoria.
- [x] **Feita? Sim — Confirmar a auditoria da restauração do iPhone.** Painel administrativo → Logs → Eventos: `purchase_restored` / `entitlement` em 17/10 às **15:26:15**, seguido de `entitlement_changed` / `user` no mesmo horário, na mesma conta exibida no evento de compra original de 16/10 às 18:11:59. [Evidência sem dados privados](validation/apple-restore-2026-10-17/server-audit-evidence.json). Teste realizado no build 13; não homologa o build 14 ou o iPad.
- [ ] **Feita? Não — Validar o build 14 neste aparelho.** Distribuído no grupo interno do TestFlight, mas ausente da lista visível no iPhone nesta rodada; instalação permanece 13.

Detalhes, limites e preparação separada do cancelamento em [registro de 17/10](validation/apple-restore-2026-10-17/REPORT.md). Os resultados de 16/10 abaixo permanecem históricos.

## Resultado físico de 16/10/2026

- [x] **Feita? Sim — Verificar acordo pago e banco ativos.** Portal consultado: Ativo e Ativa; formulários fiscais completos.
- [x] **Feita? Sim — Confirmar preço e folha de compra de teste no iPhone.** Usuário confirmou o preço; captura às 18:07 mostra R$ 23,90, cobrança única e “Apenas para fins de teste. Você não será cobrado ao confirmar esta compra”. Sem compra concluída nessa evidência.
- [x] **Feita? Sim — Cancelar a tentativa e confirmar retorno ao plano gratuito.** Captura às 18:10 e resposta do usuário confirmam cancelamento. O texto real foi o erro técnico `Calling the 'requestPurchase' function has failed → Caused by: User cancelled the purchase flow`; a oferta continuou disponível e o plano gratuito com 3/3.
- [ ] **Feita? Não — Homologar fisicamente a mensagem amigável de cancelamento.** O texto esperado não foi apresentado na captura do build 13. Correção implementada e testada automaticamente no candidato 15; teste físico ainda pendente.
- [x] **Feita? Sim — Concluir compra e desbloqueio no iPhone.** Captura de 16/10 às 18:11 mostra sucesso `[Environment: Sandbox]`; usuário confirmou o benefício ativo ao reabrir a oferta. Não houve consulta independente do evento de compra no servidor.
- [x] **Feita? Sim — Confirmar restauração no iPhone em 17/10.** Ação física, retorno sem erro e evento `purchase_restored` às 15:26:15 conferidos.
- [ ] **Feita? Não — Confirmar restauração no iPad.** Teste ainda pendente.

## Estado confirmado e pré-condições

- [x] **Feita? Sim — Conferir o app e o produto no App Store Connect.** Nome e bundle do app estão corretos; `premium_unlock` é uma compra `NON_CONSUMABLE` e está `READY_TO_SUBMIT`. A disponibilidade para Brasil e o preço base de R$ 23,90 foram confirmados em 15/10/2026.
- [x] **Feita? Sim — Confirmar o build nos aparelhos.** O build 1.0 (13) já está instalado e verificado no iPhone 13 Pro Max e no iPad Pro; Developer Mode e perfil autorizado estão confirmados nos dois. É o IPA local assinado para desenvolvimento, com perfil de dispositivos e `getTaskAllow: true`; não é TestFlight. Não é necessário criar ou instalar outro build para este roteiro.
- [x] **Feita? Sim — Conferir o ambiente e o vínculo da API ativa.** A API usada pelo app aponta para produção; o ambiente Apple está configurado como `sandbox` e o segredo de vínculo de conta está presente.
- [x] **Feita? Sim — Provisionar e verificar os certificados raiz da Apple.** Em 15/10 às 20:09:12 UTC (16:09:12 local), os três certificados oficiais foram conferidos por SHA-256, formato DER, assinatura própria, condição de CA e validade. A API passou de `isConfigured: false` para `true`, no ambiente sandbox; a imagem v7 foi preservada e apenas a API foi recriada. O worker permaneceu no mesmo contêiner; banco, Redis e worker responderam prontos. Isso confirma configuração, sem comprovar uma transação assinada real ou sua consulta OCSP. [Evidência](validation/apple-sandbox-2026-10-15/server-readiness.json).
- [x] **Feita? Sim — Conferir o Paid Apps Agreement ativo.** Em 16/10 o portal mostra acordo pago Ativo, substituindo o estado Processando de 15/10. A Apple exige o acordo pago ativo para funcionar no sandbox. [Pré-requisito oficial](https://developer.apple.com/help/app-review/before-submitting-for-review/configure-in-app-purchases).
- [x] **Feita? Sim — Criar um Sandbox Apple Account dedicado.** O usuário confirmou a criação e a consulta posterior ao App Store Connect mostrou uma conta de teste, região Brasil, sem última compra exibida. Nenhuma senha foi solicitada ou registrada. O login dessa conta nos aparelhos ainda não foi confirmado.
- [ ] **Feita? Não — Entrar na conta sandbox nos dois aparelhos.** Em Ajustes do aparelho → Desenvolvedor → Sandbox Apple Account, usar a conta criada. Se a opção ainda não aparecer, seguir a orientação Apple sobre a primeira tentativa de compra, após confirmar o acordo ativo.
- [x] **Feita? Sim — Registrar o login sandbox no iPhone.** O usuário confirmou que entrou, validou e que a conta criada aparece em Conta Apple Sandbox. Esse relato não confirma login no iPad ou transação Apple.
- [x] **Feita? Sim — Enviar e conferir os formulários fiscais.** Captura de 15/10 às 23:10 mostra formulário Brasil, certificado estrangeiro EUA e W-8BEN Ativos; questionário México Concluído. O usuário executou o preenchimento, certificação e envio. Isso registra os status apresentados pela Apple, sem homologar o conteúdo fiscal declarado.
- [x] **Feita? Sim — Conferir a conta bancária ativa.** Em 16/10 o portal mostra Ativa, substituindo a captura Processando de 15/10. A [TN3186](https://developer.apple.com/documentation/technotes/tn3186-troubleshooting-in-app-purchases-availability-in-the-sandbox) inclui dados bancários/fiscais incompletos entre as causas de produto ausente no sandbox.
- [ ] **Feita? Não — Preparar uma conta de teste do app.** Usar uma conta dedicada, com plano gratuito antes da compra, nos dois aparelhos. A API é de produção e a compra aprovada grava o direito nessa conta. Não usar uma conta principal ou de revisão.
- [x] **Feita? Sim — Confirmar o preço localizado no iPhone.** Captura de 16/10 mostra `Desbloquear R$ 23,90` e a folha Apple com o mesmo preço.
- [x] **Feita? Sim — Confirmar a folha Apple de teste.** Captura de 16/10 apresenta aviso explícito de teste sem cobrança; usuário também confirmou Sandbox. O idioma/formato pode variar, sem exigir literalmente `[Environment: Sandbox]`.

A Apple informa que, em um app assinado para desenvolvimento, a opção Sandbox Apple Account aparece em **Ajustes → Desenvolvedor** após a primeira tentativa de compra. Entre ali com a conta sandbox; não é necessário sair da conta Apple pessoal do aparelho para este tipo de instalação. Para a compra, a folha da Apple deve indicar o ambiente sandbox. Consulte [Testing In-App Purchases with sandbox](https://developer.apple.com/documentation/StoreKit/testing-in-app-purchases-with-sandbox) e [Create a Sandbox Apple Account](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/create-a-sandbox-apple-account). Alterações nos metadados da loja podem levar até uma hora para chegar ao sandbox.

O app envia à Apple um `appAccountToken` estável associado ao usuário autenticado. O backend compara esse token ao da transação. Para que a restauração seja aceita, use **a mesma conta do app e a mesma Sandbox Apple Account** nos dois aparelhos. Outra conta do app pode receber `APPLE_ACCOUNT_MISMATCH` (“A compra Apple está vinculada a outra conta.”). A conta sandbox determina quais compras a loja pode restaurar; o login do app determina em qual conta do produto o direito será registrado.

## Compra e cancelamento no iPhone

### Bloqueio observado em 15/10 às 17:34

A captura enviada pelo usuário mostra a conta do app gratuita, com três conversões restantes, e a oferta aberta, com `Preço indisponível` e `Consultar preço novamente`. Não houve comprovação de abertura da folha Apple, cancelamento, compra ou restauração. O texto do app atribui a indisponibilidade ao cadastro incompleto, mas essa causa ainda não foi demonstrada.

- [x] **Feita? Sim — Reconferir cadastro e código da consulta.** API oficial: bundle e produto correspondentes, equipe de assinatura compatível, capacidade `IN_APP_PURCHASE`, compra não consumível pronta para revisão, nome/descrição pt-BR, disponibilidade Brasil e preço R$ 23,90. [Consulta datada](validation/apple-sandbox-2026-10-15/price-unavailable-asc.json). O caminho Expo-IAP 4.2.7/OpenIAP usa StoreKit para consultar o SKU e repassa `displayPrice`; nenhuma divergência concreta de tipo/SKU ou mapeamento foi encontrada. Cinco testes existentes da proteção por preço passaram, sem comprovar StoreKit real.
- [x] **Feita? Sim — Retestar o preço após a ativação.** Em 16/10 o preço apareceu e a folha Apple abriu com R$ 23,90. Isso confirma a recuperação, sem demonstrar uma causa única para a indisponibilidade anterior.

- [ ] **Feita? Não — Abrir a oferta com a conta dedicada.** No iPhone 13 Pro Max, abrir o build instalado, entrar na conta gratuita de teste e seguir **Ajustes → Conversões ilimitadas**. A tela da oferta não consome uma conversão gratuita.
- [x] **Feita? Sim — Cancelar uma tentativa sandbox.** Confirmado no iPhone em 16/10: retorno ao plano gratuito. A mensagem amigável falhou; apareceu o erro técnico em inglês documentado acima. Cancelamento funcional e qualidade da mensagem são validações distintas.
- [x] **Feita? Sim — Concluir a compra sandbox no iPhone.** Em 16/10, captura às 18:11 confirma sucesso da Apple com `[Environment: Sandbox]`; usuário confirmou o benefício ativo ao reabrir a oferta. Preço exibido R$ 23,90. Evento de compra não consultado independentemente no servidor.

## Restauração no iPad e no iPhone

- [ ] **Feita? Não — Restaurar no iPad Pro.** Entrar no mesmo usuário da conta do app e na mesma Sandbox Apple Account usada no iPhone. Abrir **Ajustes → Conversões ilimitadas** e tocar `Restaurar compra`. A busca inicial informa `Buscando compras anteriores na App Store...`; se StoreKit retornar `premium_unlock`, o app envia a transação como restaurada para validação. Após validação aceita, a oferta fecha; reabri-la deve mostrar o plano ativo.
- [ ] **Feita? Não — Comprovar que StoreKit restaurou no iPad.** O plano ativo no iPad, sozinho, só comprova que a conta recebeu o direito pelo servidor; como os dois aparelhos usam a mesma conta do app, esse estado pode sincronizar sem uma restauração da loja. Para marcar este caso concluído, confirmar também a transação retornada pelo StoreKit e o evento de auditoria `purchase_restored` para `premium_unlock` no servidor; o app envia essa solicitação com `restored: true`. Se só houver sincronização do plano, registrar o caso como inconclusivo para restauração.
- [x] **Feita? Sim — Repetir a restauração no iPhone.** Em 17/10, build 13 reiniciado sem desinstalação, oferta aberta, usuário tocou Restaurar compra e autenticou na Apple. Oferta fechou sem erro visível. Auditoria confirmou `purchase_restored` em 17/10 às 15:26:15, na mesma conta da compra original; benefício ativo preservado.

O botão `Restaurar compra` mostra uma mensagem de busca, mas o app fecha a oferta quando o servidor aceita a transação; portanto, não dependa de uma mensagem final visível como prova. Confirme o evento de restauração do servidor junto com o retorno do StoreKit. A mensagem amigável esperada para cancelamento é `Compra cancelada.`; no teste físico de 16/10, o build 13 exibiu o erro técnico em inglês. Problemas de validação são exibidos no status da compra; registre o texto e o código exatos.

## Registro dos resultados

Preencher um item por ação, com horário local e aparelho. Não registrar senha, e-mail da conta sandbox, recibo/JWS, token de vínculo ou token completo de transação.

- [x] **Feita? Sim — Registrar o cancelamento no iPhone.** 16/10 às 18:10 local, teste sem cobrança; erro técnico indica `User cancelled the purchase flow`, conta gratuita 3/3 antes/depois nas capturas. Entitlement não consultado independentemente no servidor.
- [x] **Feita? Sim — Registrar a compra no iPhone.** 16/10, captura às 18:11 local; R$ 23,90; Apple: “Processo completo. Sua compra foi realizada com sucesso. [Environment: Sandbox]”. Usuário confirmou “Conversões ilimitadas ativas nesta conta” ao reabrir. Auditoria do servidor não consultada independentemente.
- [ ] **Feita? Não — Registrar a restauração no iPad.** Horário: ___; resultado/texto/código: ___; retorno StoreKit confirmado: ___; evento `purchase_restored`: ___; entitlement: ___ .
- [x] **Feita? Sim — Registrar a segunda restauração no iPhone.** 17/10 às 15:26:15, build 13. Login Apple informado pelo usuário, oferta fechada, benefício ativo. Evento `purchase_restored` / `entitlement` e `entitlement_changed` / `user` confirmados no painel, mesma conta da compra original. Recibo/JWS e resposta bruta StoreKit não coletados; transação aceita pelo servidor comprovada pelo evento de auditoria.

Não desinstalar o build, apagar o usuário, limpar o histórico sandbox ou redefinir o entitlement durante esta sequência. Essas ações podem remover evidência necessária para restaurar e conferir a mesma compra.

## Configuração operacional e limite de lançamento

A API permanece com a imagem `converter-api:recognition-v7-20261015`. A configuração ativa está em `/root/score-releases/20261015-apple-sandbox/compose.release.yml`; a configuração anterior para rollback permanece em `/root/score-releases/20261015-recognition-v7/compose.release.yml`. Os certificados públicos ficam no volume existente, em `/app/storage/apple-roots/`, e a variável `APPLE_ROOT_CERT_PATHS` aponta para os três arquivos. Nenhuma chave privada da Apple foi criada ou transferida. A implementação usa o JWS esperado do build 13, sem depender de chave da App Store Server API.

- [ ] **Feita? Não — Validar suporte a compras de produção antes do lançamento público.** O serviço atual seleciona um único ambiente Apple e está em sandbox para esta etapa. A configuração sandbox não comprova suporte simultâneo a transações de produção. Esse comportamento precisa ser tratado e testado antes da disponibilização pública.

## Testes locais existentes

- [x] **Feita? Sim — Executar os testes focais de UI e oferta.** Em 15/10/2026, passaram 13 testes mobile: Settings (1), Scores (7) e disponibilidade da oferta (5).
- [x] **Feita? Sim — Executar os testes focais do vínculo de compra no backend.** Em 15/10/2026, passaram 6 testes da API em `purchasePreservation.test.ts`, incluindo vínculo estável de conta e rejeição de token Apple vinculado a outro usuário.
- [x] **Feita? Sim — Validar abertura da folha de compra e cancelamento no iPhone.** Evidência física de 16/10 com preço real da loja e aviso de teste; mensagem de cancelamento ainda técnica em inglês.
- [x] **Feita? Sim — Validar compra sandbox aprovada e benefício ativo no iPhone.** Sucesso Apple comprovado por captura e benefício confirmado pelo usuário.
- [x] **Feita? Sim — Validar restauração física do iPhone e evento do servidor.** Build 13, 17/10 às 15:26:15; evidência vinculada no início deste documento.
- [ ] **Feita? Não — Validar restauração física e evento do iPad.** Teste no iPad ainda não realizado pelo usuário.


## Preparação para produção — 17/10/2026

- [x] **Feita? Sim — Preparar e testar localmente o backend para produção e sandbox em paralelo.** 84 testes passaram; inclui histórico persistente, isolamento de ambientes, lista de contas de avaliação e notificações de reembolso. [Roteiro e evidências](APPLE_PRODUCTION_VALIDATION.md).
- [x] **Feita? Sim — Aplicar o preparo no servidor e repetir a restauração no iPhone.** Concluído pelo terminal autenticado do Chrome, com registro sandbox às 19:24:01. Nenhum acesso SSH novo foi habilitado.
- [ ] **Feita? Não — Repetir restauração física no iPad e realizar compra de produção.** Permanecem sem confirmação; produção depende da disponibilização posterior na App Store.
