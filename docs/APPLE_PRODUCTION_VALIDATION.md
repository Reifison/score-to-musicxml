# Compras Apple em produção — preparo de 17/10/2026

**Atualização instalada e verificada no servidor em 17/10/2026 às 19:19:47 (America/Campo_Grande).** As 13 verificações administrativas passaram e a restauração real em sandbox foi confirmada às 19:24:01. Nenhuma compra de produção foi realizada. O build 1.0 (15) e a compra “Conversões ilimitadas” seguem Aguardando revisão, com lançamento manual. Estes ajustes são do backend; o IPA enviado à Apple não foi alterado.

## Feita?

- [x] Conferir o serviço público: `/health` e `/ready` responderam 200, com banco, Redis e worker prontos.
- [x] Conferir a situação na Apple: app e IAP aguardando revisão; lançamento manual preservado. Notifications V2 de produção e sandbox configuradas e reconferidas pela API às 19:22.
- [x] Preparar o modo `auto`: verificar transações Production e Sandbox com os verificadores oficiais da Apple, sem confiar em campos apenas decodificados de um JWS.
- [x] Restringir novos desbloqueios sandbox, no modo auto, aos UUIDs das contas de avaliação/teste explicitamente cadastrados. Uma compra sandbox não substitui um direito pago de produção.
- [x] Preparar histórico persistente por ambiente + transação original, preservando titularidade e reembolsos quando o resumo do plano muda.
- [x] Cobrir reembolso, reversão de reembolso, notificações repetidas/antigas e bloqueio de restauração por recibo anterior ao reembolso.
- [x] Preparar e testar a migração no PostgreSQL local de QA, preservando dados de outros testes. A migração de registros antigos exige confirmação explícita de que o servidor anterior aceitava apenas sandbox.
- [x] Passar 63 testes específicos, incluindo nove de persistência no PostgreSQL, e 21 testes de rotas: **84 testes aprovados**. Compilação e TypeScript passaram.
- [x] Executar o preflight com os três certificados públicos oficiais e suas impressões digitais conferidas. Validadores Production/Sandbox foram construídos com checagem online habilitada e rejeitaram dados sem assinatura. O banco e a conta temporária de QA foram conferidos.
- [x] Conferir a configuração administrativa e instalar somente os ajustes de compras na API ativa. Backup do banco validado; uma única migração Apple aplicada; 34 usuários, 28 partituras e a compra existente preservados. Worker manteve o mesmo contêiner saudável. Nenhum acesso SSH novo foi criado; instalação pelo terminal autenticado do Chrome.
- [x] Cadastrar e conferir Notifications V2 para produção e sandbox na Apple. Endpoint público respondeu 400 para conteúdo sem assinatura; `/health` e `/ready` responderam 200.
- [x] Repetir restauração real no iPhone contra o backend atualizado. Usuário relatou ausência de mensagem; servidor confirmou `purchase_restored` e `entitlement_changed` às 19:24:01, ambiente sandbox, produto `premium_unlock`, transação presente e benefício pago ativo. Não foi uma nova compra.
- [ ] Validar entrega de notificação Apple assinada, reembolso sandbox e reversão contra o serviço atualizado. A configuração e a rejeição de conteúdo sem assinatura não substituem essa evidência.
- [ ] Confirmar compra e restauração reais em Production após disponibilização na App Store. Os testes automatizados não substituem essa evidência.

## O que depende do usuário

- [x] Abrir o terminal do servidor pelo painel da hospedagem. Atualização e checagens concluídas por essa sessão, sem reutilizar ou ampliar o SSH temporário anterior.
- [ ] Testar “Restaurar compra” no iPad, usando a mesma conta do Conversor e Conta Apple Sandbox; informar resultado e horário para conferência no servidor.
- [ ] Após a aprovação e a validação do backend, autorizar o lançamento manual na App Store.
- [ ] Ter uma conta **gratuita do Conversor**, sem o desbloqueio já concedido no sandbox, para a compra real; utilizar sua Conta Apple normal. Não é necessário criar outra conta Apple Sandbox para esse teste de produção.
- [ ] No app distribuído pela App Store, conferir o preço e confirmar pessoalmente uma única compra real. Essa etapa tem cobrança. Em seguida, realizar a restauração nos aparelhos e informar o resultado/horário para conferência no servidor.

A restauração física no iPad continua pendente. A compra e a restauração anteriores do iPhone foram testes sandbox do build 13; em 17/10 às 19:24:01, houve nova restauração real, solicitada no iPhone com o build 15, validada contra o backend atualizado. O cancelamento físico no build corrigido foi dispensado pelo usuário; não foi convertido em teste aprovado.

## Ordem de instalação e validação do servidor

1. Conferir imagem, código e compose realmente ativos. A evidência administrativa mais recente disponível era sandbox-only; a consulta pública de saúde não comprova a configuração de compras. Salvar backup do banco, arquivos de configuração e referência da imagem anterior. Não imprimir credenciais, JWS ou senhas nos relatórios.
2. Integrar somente a alteração de compras à release ativa. A árvore de desenvolvimento contém outras alterações de reconhecimento/conversão; **não publicar toda a árvore por inferência**. Não reiniciar o worker nem interromper conversões para esta preparação.
3. Antes da migração `20261017020000_apple_purchase_environments`, comprovar no runtime anterior `APPLE_IAP_ENVIRONMENT=sandbox` e a ausência de validação de produção. Somente após essa verificação e o backup, definir temporariamente `APPLE_LEGACY_PURCHASES_FROM_SANDBOX=true`. Se a origem não puder ser comprovada, parar: a classificação precisa ser reconciliada antes de migrar.
4. Aplicar a migração pelo fluxo protegido. O entrypoint Docker e `npm run db:migrate:deploy` verificam registros antigos antes de migrar. A migração preserva os direitos atuais e copia os vínculos antigos para o histórico sandbox. Remover a confirmação temporária depois da aplicação. Não apagar o histórico para fazer rollback.
5. Configurar `APPLE_IAP_ENVIRONMENT=auto`, `APPLE_APP_APPLE_ID=6778062424`, `APPLE_BUNDLE_ID=com.scoretomusicxml.app`, `APPLE_PREMIUM_PRODUCT_ID=premium_unlock` e os caminhos dos certificados Apple existentes. Manter o segredo de vínculo de contas; não rotacioná-lo como parte deste teste.
6. Configurar `APPLE_SANDBOX_ACCOUNT_IDS` com os UUIDs reais e ativos das contas de revisão/teste no **Conversor**. Não usar e-mails ou IDs das contas Apple Sandbox. Incluir a conta privada de avaliação antes de ativar o modo auto para preservar o caminho da App Review.
7. Executar `node apps/api/dist/scripts/appleProductionPreflight.js` dentro do serviço em execução, com seu ambiente real. No host, `npm run apple:production:preflight` carrega explicitamente `.env.production`; não usar a configuração de desenvolvimento `.env`. A checagem do banco é obrigatória por padrão; `--config-only` é apenas diagnóstico e nunca atesta prontidão para verificação online. O comando só lê configuração/banco e testa rejeição de conteúdo sem assinatura. Todos os checks devem passar. Segredos de exemplo são recusados; preservar o segredo real existente, sem rotacioná-lo para contornar uma falha. O preflight local usa uma conta temporária de QA; seu resultado não comprova o servidor online.
8. Conferir a saúde da API e do worker, a manutenção dos direitos existentes e uma compra/restauração sandbox permitida. Conferir que uma conta comum fora da lista não recebe novo direito por transação sandbox.
9. Na Apple, configurar **App Store Server Notifications V2**, produção e sandbox, para `https://converter.nossateoria.com.br/api/apple/notifications`. A URL existente aceita notificações assinadas; não há segredo na URL. Testar entrega e resposta, depois testar um reembolso sandbox e sua reversão. Um evento TEST sem transação só confirma entrega/validação da mensagem.
10. Preservar lançamento manual até a conclusão das etapas anteriores. Depois da aprovação, disponibilizar o app com autorização do usuário e realizar o teste real abaixo.

A chave privada da App Store Server API é opcional no fluxo atual, pois o app envia a transação assinada. É necessária para consultas de transação sem JWS e para solicitar notificações TEST pela Server API. Não criar ou transferir uma chave sem necessidade. Se não houver essa chave no servidor, testar o endpoint com o fluxo sandbox existente e registrar separadamente a entrega da Apple.

## Teste real após a publicação

- [ ] Instalar a versão da **App Store** no iPhone. Build de desenvolvimento ou TestFlight continua sendo evidência de sandbox, não de Production.
- [ ] Entrar numa conta gratuita do Conversor, ainda sem desbloqueio. Conferir Configurações/Ajustes → Conversões ilimitadas, produto e preço localizado.
- [ ] Confirmar pessoalmente a compra real na Apple. Registrar somente horário, aparelho, versão/build e resultado; não enviar senha nem recibo/JWS no chat.
- [ ] Conferir no servidor a assinatura, ambiente **production**, bundle, produto não consumível e vínculo com a conta correta; evento `purchase_completed`, direito pago e histórico persistente.
- [ ] Fechar e reabrir o app; conferir persistência do direito. No iPhone, tocar Restaurar compra e confirmar `purchase_restored` com ambiente production.
- [ ] No iPad com a mesma conta do app e a mesma Conta Apple normal, tocar Restaurar compra. O plano ativo por sincronização, sozinho, não comprova restauração StoreKit: conferir também o evento de restauração no servidor.
- [ ] Registrar conclusão ou falha. Não efetuar outra compra para corrigir uma falha de validação; investigar a transação existente.

Uma segunda conta do Conversor não deve conseguir tomar a compra da primeira. Reembolso e reversão devem ser ensaiados em sandbox; não é necessário solicitar um reembolso real para concluir a confirmação positiva de produção.

## Evidências da implantação e limites

[Resumo da implantação e restauração](validation/apple-production-deploy-2026-10-17/summary.json), [comprovante visual do servidor e da restauração](validation/apple-production-deploy-2026-10-17/server-verification-final.png), [configuração V2 e lançamento manual](validation/apple-production-deploy-2026-10-17/notifications-configured.json), [checagens HTTP públicas](validation/apple-production-deploy-2026-10-17/public-verification.json) e [autoteste da atualização isolada](validation/apple-production-deploy-2026-10-17/overlay-selftest.json). O relatório administrativo completo e o backup ficam protegidos no servidor. A primeira compilação tentou baixar um engine Prisma já presente no runtime; a imagem final reutilizou os dois engines da instalação ativa e foi compilada sem rede, sem atualizar bibliotecas.

[Relatório dos 63 testes](validation/apple-production-2026-10-17/purchase-tests.json), [21 testes de rotas](validation/apple-production-2026-10-17/api-routes-tests.json), [preflight no QA](validation/apple-production-2026-10-17/preflight-qa.json), [migração de dados antigos no QA](validation/apple-production-2026-10-17/legacy-migration-qa.json), [certificados públicos](validation/apple-production-2026-10-17/certificates.json), [saúde online](validation/apple-production-2026-10-17/live-health.json), [estado da Apple](validation/apple-production-2026-10-17/apple-status.json).

Os testes de roteamento de ambiente injetam respostas de verificador; os testes de persistência usam PostgreSQL real e dados locais. A verificação com raízes oficiais comprova configuração dos verificadores e rejeição de dados sem assinatura, **não** a aceitação de uma compra Apple-signed de produção. Nenhuma cobrança ou liberação pública foi executada. A restauração sandbox real foi registrada após a implantação e os direitos anteriores foram mantidos. A entrega de Notifications V2 assinada, reembolso/reversão sandbox e compra/restauração de produção continuam sem comprovação.

A primeira execução de rotas foi impedida de abrir portas locais; foi repetida com acesso permitido. A execução conjunta com PostgreSQL fez o teste de readiness “sem banco” receber 200; as suítes foram separadas conforme seus ambientes e passaram. Os relatórios anteriores foram preservados como diagnóstico.

A Apple documenta App Review e TestFlight como ambientes de sandbox. A necessidade de confirmar uma transação de produção quando o app puder realizar uma compra real é uma conclusão desses fluxos, não uma aprovação antecipada da cobrança. [Sandbox na App Review](https://developer.apple.com/help/app-review/before-submitting-for-review/configure-in-app-purchases/), [ambientes de teste](https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox), [biblioteca oficial](https://github.com/apple/app-store-server-library-node), [Notifications V2](https://developer.apple.com/documentation/appstoreservernotifications/enabling-app-store-server-notifications).
