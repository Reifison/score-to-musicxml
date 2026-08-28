# Technical Roadmap: iOS App

Este roadmap descreve a criação da versão iOS do Conversor de Partituras. A ideia é manter o backend atual como fonte de verdade e criar um app mobile em React Native/Expo, com foco especial em capturar fotos de partitura com qualidade próxima de scan antes do upload.

## Como Executar Este Roadmap

Cada fase foi escrita para poder ser executada de forma independente, desde que suas dependências estejam concluídas.

Ao terminar uma atividade, marque a linha correspondente como concluída neste arquivo, incluindo a data e o identificador do commit/PR quando existir.

Comando padrão para registrar conclusão de uma atividade:

```bash
$EDITOR docs/TECHNICAL_ROADMAP.md
```

Atualize a atividade neste formato:

```md
- [x] Atividade concluída. Concluído em YYYY-MM-DD. Commit/PR: <referência>.
```

Antes de abrir PR ou encerrar uma fase, rode:

```bash
git diff -- docs/TECHNICAL_ROADMAP.md
```

## Validação Mais Recente

- 2026-08-24: modelo comercial aprovado para 2 conversões gratuitas por conta e desbloqueio único `premium_unlock` por R$ 23,90 no Brasil. A compra libera conversões ilimitadas na conta, sem assinatura; a validação técnica local depende da criação dos produtos e de compras sandbox nas lojas.
- 2026-05-09: `npm run db:generate` executado com sucesso após adicionar modelos de entitlement.
- 2026-05-09: `npm run build` executado com sucesso para API, web e mobile.
- 2026-05-09: `npm test -w apps/api` executado com sucesso: 21 testes passaram.
- 2026-05-09: `npm audit --audit-level=moderate` encontrou 4 vulnerabilidades moderadas transitivas em `postcss` via Expo CLI; `npm audit fix --force` sugeria downgrade/breaking change para Expo, então não foi aplicado automaticamente.
- 2026-05-09: tentativa de subir `expo start` local falhou/ficou presa no ambiente atual. Com porta automática houve `ERR_SOCKET_BAD_PORT`; com porta fixa o CLI tentou validação online e falhou com `fetch failed`; em modo offline o processo iniciou mas não abriu porta antes de ser encerrado manualmente. Retomar testando em ambiente local com rede normal ou EAS/Expo CLI fora do sandbox.
- 2026-05-09: `npx expo prebuild -p ios` executado com sucesso e criou `apps/mobile/ios`.
- 2026-05-09: CocoaPods instalado via Homebrew e `pod install` executado com sucesso em `apps/mobile/ios`.
- 2026-05-09: `xcodebuild -list -workspace ScoretoMusicXML.xcworkspace` executado com sucesso fora do sandbox, confirmando que o workspace iOS é legível pelo Xcode.
- 2026-05-09: `open apps/mobile/ios/ScoretoMusicXML.xcworkspace` executado com sucesso e `xcodebuild -list` confirmou o scheme `ScoretoMusicXML`.
- 2026-05-09: ícone e splash locais gerados em `apps/mobile/assets`, `app.json` atualizado e `npx expo prebuild -p ios --no-install` aplicado com sucesso.
- 2026-05-09: `npm run build -w apps/mobile` executado com sucesso após configurar ícone/splash.
- 2026-05-09: Postgres local iniciado em `localhost:5433`, Redis local iniciado em `localhost:6379`, migrations/seed aplicados, API iniciada em `http://localhost:4000`, worker iniciado e Expo/Metro iniciado em `http://localhost:8081`.
- 2026-05-09: validações locais passaram: `GET /health` retornou `{"ok":true}`, `redis-cli ping` retornou `PONG` e Metro respondeu HTTP 200.
- 2026-05-10: fluxo local de login mobile validado contra a API: `POST /api/auth/login` com header mobile retornou token, `GET /api/auth/me` aceitou `Authorization: Bearer`, `POST /api/auth/logout` retornou 204 e o token passou a retornar 401.
- 2026-05-10: fluxo local de lista/detalhe/status validado: upload PDF criou partitura `queued`, `GET /api/scores` listou o item, `GET /api/scores/:id` retornou detalhe e polling observou transição para `failed` controlado por `OMR_ENGINE=stub`.
- 2026-05-10: upload local de PDF e imagem validado contra a API usada pelo app mobile. Teste de câmera permanece pendente por exigir simulador/dispositivo com permissão de câmera.
- 2026-05-10: limite gratuito validado contra backend local: usuário novo começou com 3 scans restantes, 3 uploads retornaram 201 e o quarto retornou 402 `FREE_SCAN_LIMIT_REACHED`.
- 2026-05-10: download MusicXML validado contra API local com score convertido no banco; endpoint retornou 200, `Content-Type` MusicXML e `Content-Disposition` com `download-test.musicxml`. Compartilhamento via `expo-sharing` permanece pendente para simulador/dispositivo.
- 2026-05-10: scanner mobile melhorado localmente com orientação de modo documento/scan, recorte manual via `allowsEditing`, confirmação antes do upload e alertas simples de resolução/recorte.
- 2026-05-10: tela de detalhe do app mobile refinada para diferenciar conversão em andamento, falha, `convertido com alerta` e `convertido com alta confianca`, incluindo orientação de revisão no MuseScore/outro editor e reenvio de foto quando houver baixa confiança ou warnings.
- 2026-05-10: StoreKit local integrado ao app com `expo-iap`, produto `premium_unlock`, preço vindo da App Store quando disponível, restauração de compra, registro no backend antes de finalizar transação e fallback local apenas para desenvolvimento. `pod install` instalou `ExpoIap`/`openiap` e `xcodebuild -list` confirmou o scheme `ExpoIap`.
- 2026-05-10: validação Apple server-side implementada no backend com biblioteca oficial `@apple/app-store-server-library`, suporte a App Store Server API/JWS, checagem de bundle, produto, transação original e revogação. Teste real depende das chaves/certificados do App Store Connect; `npm run build -w apps/api`, `npm run build -w apps/mobile` e `npm test -w apps/api` passaram.
- 2026-05-10: webhook `POST /api/apple/notifications` implementado para App Store Server Notifications V2; notificações `REFUND` e `REVOKE` verificadas pela Apple revogam entitlement pago, registram auditoria `purchase_revoked` e retornam o plano para `free`. Migration local aplicada no Postgres.
- 2026-05-10: backend passou a reencodar imagens com `sharp` antes de salvar upload, removendo metadados EXIF/privados quando viável e rejeitando imagens corrompidas; `npm run build -w apps/api` e `npm test -w apps/api` passaram.
- 2026-05-10: retenção/exclusão implementada: exclusão manual já remove upload/export; endpoint admin `POST /api/admin/retention/cleanup` remove partituras e arquivos acima de `SCORE_RETENTION_DAYS` e auditorias acima de `AUDIT_RETENTION_DAYS`.
- 2026-05-10: processamento OMR reforçado com diretórios temporários descartáveis, `execFile` sem shell, timeout global `OMR_CONVERSION_TIMEOUT_MS`, timeout Audiveris configurável e concorrência `OMR_WORKER_CONCURRENCY`.
- 2026-05-10: textos locais criados para App Store e compliance: `docs/PRIVACY_POLICY.md`, `docs/APP_STORE_SUBMISSION.md` e `docs/SUPPORT.md`.
- 2026-05-10: guia de qualidade de fotos criado em `docs/SCAN_IMAGE_GUIDE.md`, com exemplos de imagens boas/ruins e decisão de manter recorte manual no MVP.
- 2026-05-10: validação local parcial refeita após ajustes finais: `npm run build` passou, `npm test -w apps/api` passou com 21 testes, `npm audit --audit-level=moderate` manteve 4 vulnerabilidades moderadas transitivas em Expo/PostCSS sem correção segura automática, e build iOS local ficou bloqueado por DNS do CocoaPods/CDN e recusa de execução `xcodebuild` fora do sandbox por limite de uso/aprovação.
- 2026-05-10: corrigido fluxo de bundle do Expo Router no iOS adicionando `apps/mobile/babel.config.js`, entrypoint explícito `apps/mobile/index.js`, `apps/mobile/metro.config.js` para monorepo e restaurando `AppDelegate.swift` para carregar `.expo/.virtual-metro-entry` em Debug; `npm run build -w apps/mobile` passou e `resolveAppEntry` aponta para `apps/mobile/index.js`.
- 2026-05-10: ajustado `apps/mobile/metro.config.js` removendo `disableHierarchicalLookup`, porque o Expo Router precisa resolver dependências aninhadas como `@expo/metro-runtime` dentro de `expo-router/node_modules`; resolução validada com `require.resolve` e `npm run build -w apps/mobile` passou.
- 2026-05-10: `apps/mobile/babel.config.js` passou a incluir explicitamente `expoRouterBabelPlugin`, porque em workspace monorepo o `babel-preset-expo` não detectava automaticamente `expo-router` dentro de `apps/mobile/node_modules`. Transformação manual de `_ctx.ios.js` validada para `require.context("../../app", ...)` e `npm run build -w apps/mobile` passou.
- 2026-05-10: corrigida resolução duplicada de React no Metro do mobile. `apps/mobile/metro.config.js` agora força `react` e subpaths (`react/jsx-runtime`, `react/jsx-dev-runtime`) para `apps/mobile/node_modules/react`, evitando mistura com `node_modules/react` do web no root. `npm run build -w apps/mobile` passou.
- 2026-05-10: formulário de login iOS ajustado para evitar alteração de credenciais pelo teclado: e-mail agora remove espaços, senha desativa autocorreção/capitalização e há botão para mostrar/ocultar senha. `npm run build -w apps/mobile` passou.
- 2026-05-10: adicionado endpoint diagnóstico de desenvolvimento `GET /debug/auth` para comparar API/banco entre web e mobile sem expor senhas/hashes. O app mobile também exibe a URL diagnóstica na tela de login. `npm run build -w apps/api` e `npm run build -w apps/mobile` passaram.

## Stack Recomendada

- App iOS: Expo + React Native + TypeScript.
- Navegação: Expo Router.
- Upload de foto/PDF: `expo-image-picker` e `expo-document-picker`.
- Arquivos locais: `expo-file-system`.
- Compartilhamento/download: `expo-sharing`.
- Sessão segura futura: `expo-secure-store`.
- Estado remoto: TanStack Query ou hooks próprios simples na primeira versão.
- Compra no app: StoreKit 2 via biblioteca compatível com Expo Dev Client/EAS.
- Backend: API atual em Node.js/Express.
- Persistência: PostgreSQL + Prisma.
- Monorepo: manter `apps/api`, `apps/web` e criar `apps/mobile`.
- Código compartilhado: criar `packages/shared` quando houver duplicação real de tipos/API.

## Resultado Desta Revisão

O roadmap original cobria bem o fluxo nativo iOS principal: criar app mobile, autenticar, listar partituras, enviar PDF/foto, melhorar captura tipo scanner, baixar/compartilhar MusicXML, testar no TestFlight e publicar na App Store.

As lacunas importantes identificadas nesta revisão foram:

- Modelo comercial: faltava documentar que o app será gratuito na App Store com limite total de 3 scans por usuário e desbloqueio pago por R$ 29,90.
- Entitlement no backend: faltava uma fonte de verdade para saber se o usuário ainda está no plano gratuito ou se já comprou a versão paga.
- StoreKit/App Store Connect: faltavam tarefas de produto in-app, restauração de compra, validação server-side e notas para revisão da Apple.
- Segurança: o backend já usa UUID para usuários/scores, Prisma para acesso ao banco e validação básica de arquivo por assinatura, mas faltava transformar essas garantias em critérios obrigatórios e acrescentar varredura/sandbox contra arquivos maliciosos.
- Privacidade e compliance: faltavam critérios explícitos para política de privacidade, retenção/exclusão de uploads, permissões de câmera/fotos/arquivos e dados coletados.

Decisão comercial atual: publicar um único app gratuito na App Store e Google Play, permitir 2 conversões gratuitas no total por conta, e vender o desbloqueio único e não consumível `premium_unlock` por R$ 23,90 na loja brasileira. O preço apresentado no app vem da loja e pode ser localizado em outros países.

Referências Apple para manter atualizadas antes do envio:

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- In-App Purchase: https://developer.apple.com/in-app-purchase/
- Configuração de In-App Purchases: https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/
- Preço de In-App Purchase: https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-a-price-for-an-in-app-purchase/

## Fase 0: Preparação Do Produto

Objetivo: alinhar escopo da primeira versão iOS antes de escrever código.

Dependências: nenhuma.

Atividades:

- [x] Definir público da primeira versão: usuário comum, admin ou ambos. Decisão: usuário comum no MVP iOS; admin permanece no web. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Definir fluxo mínimo: login, lista de partituras, upload, status, download/compartilhar MusicXML. Decisão: incluir também tela de entitlement/paywall. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Definir se a primeira versão terá área admin ou se admin continua apenas no web. Decisão: admin continua apenas no web no MVP. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Definir política de suporte: iOS mínimo, iPhone/iPad, orientação retrato/paisagem. Decisão: iOS 16+, iPhone primeiro, iPad compatível, orientação retrato no MVP. Concluído em 2026-05-09. Commit/PR: pendente.
- [ ] Validar conta Apple Developer e acesso ao App Store Connect/TestFlight. Pendente: requer acesso à conta Apple Developer.
- [x] Definir modelo comercial do MVP: app gratuito com 2 conversões totais e desbloqueio pago único por R$ 23,90. Atualizado em 2026-08-24. Commit/PR: pendente.
- [x] Definir se o limite de 2 conversões conta por usuário autenticado, dispositivo ou ambos. Decisão: por usuário autenticado no backend. Atualizado em 2026-08-24. Commit/PR: pendente.
- [x] Definir o que conta como scan: cada upload aceito de PDF ou imagem, mesmo que a conversão falhe, ou apenas conversões concluídas. Decisão: contar upload aceito para evitar abuso de processamento. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Definir política para reprocessamento, exclusão e reenvio dentro do limite gratuito. Decisão: exclusão não devolve crédito; reenvio conta como novo scan; reprocessamento interno do mesmo upload não debita novo scan. Concluído em 2026-05-09. Commit/PR: pendente.

Critérios de aceite:

- Escopo MVP documentado.
- Decisão explícita sobre admin no iOS.
- Requisitos de distribuição definidos.
- Regra comercial de 2 conversões gratuitas e compra única por R$ 23,90 documentada.
- Decisão explícita sobre quando o contador de scans é debitado.

## Fase 1: Estrutura Mobile No Monorepo

Objetivo: criar o app Expo dentro do monorepo sem alterar comportamento do web/backend.

Dependências: Fase 0.

Atividades:

- [x] Criar `apps/mobile` com Expo + TypeScript. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Configurar scripts no `package.json` raiz: `dev:mobile`, `build:mobile` se aplicável. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Configurar lint/typecheck para o app mobile. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Definir variáveis de ambiente mobile, como `EXPO_PUBLIC_API_URL`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Configurar permissões iOS em `app.json`/`app.config.ts`: câmera, galeria/fotos e documentos, com textos claros para revisão da Apple. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Configurar identificadores iniciais: bundle id, scheme/deep link se necessário e nome exibido. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Criar tela inicial simples confirmando conexão com a API `/health`. Concluído em 2026-05-09. Commit/PR: pendente.

Critérios de aceite:

- `npm install` funciona no monorepo.
- App abre no Expo Go ou Dev Client.
- App consegue chamar `/health` da API configurada.
- Web e API continuam buildando.

Validação sugerida:

```bash
npm run lint -w apps/mobile
npm run build -w apps/api
npm run build -w apps/web
```

## Fase 2: Autenticação Mobile

Objetivo: permitir login/logout no iOS usando a API atual.

Dependências: Fase 1.

Atividades:

- [x] Criar tela de login. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Integrar `POST /api/auth/login`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Integrar `GET /api/auth/me`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Integrar `POST /api/auth/logout`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Decidir estratégia de sessão mobile: cookie atual ou token/session wrapper específico para mobile. Decisão: token opaco retornado apenas para cliente mobile e enviado via `Authorization: Bearer`; web permanece com cookie `HttpOnly`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Tratar erros de credenciais e sessão expirada. Concluído em 2026-05-09. Commit/PR: pendente.

Critérios de aceite:

- Usuário consegue entrar e sair pelo app iOS.
- Sessão permanece entre fechamentos do app, se essa decisão fizer parte do MVP.
- Usuário sem sessão volta para login.

Observação técnica:

O backend atual usa cookie `HttpOnly`. Isso funciona bem no browser, mas pode exigir cuidado extra em React Native. Se ficar instável, criar endpoints ou estratégia de sessão própria para mobile, preservando segurança.

## Fase 2.5: Segurança, Privacidade E Hardening

Objetivo: garantir que o app iOS não exponha dados, não aceite arquivos perigosos sem controle e não dependa de identificadores previsíveis.

Dependências: Fase 2.

Atividades:

- [x] Confirmar que `User`, `Session`, `Score` e `AuditLog` continuam usando IDs opacos não sequenciais no banco. O schema atual usa `uuid()` para essas entidades. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Garantir que o app não mostre, derive ou dependa de IDs sequenciais em URLs, logs, eventos de analytics ou nomes de arquivos. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Confirmar que todo acesso ao banco continua passando por Prisma/queries parametrizadas e que qualquer uso futuro de SQL raw exige validação e teste contra SQL injection. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Adicionar testes de autorização para impedir que usuário comum acesse preview, download, detalhe ou status de partitura de outro usuário. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Revisar CORS e política de sessão para mobile: HTTPS obrigatório em produção, cookies/tokens seguros, expiração clara e logout invalidando sessão no servidor. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Definir política de armazenamento de tokens no iOS usando `expo-secure-store` ou alternativa equivalente quando a sessão mobile não depender apenas de cookie seguro. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Reforçar validação server-side de upload: extensão permitida, assinatura/magic bytes, tamanho máximo, quantidade de arquivos, nome original sanitizado e nome interno gerado pelo servidor. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Adicionar varredura de malware/antivírus para PDF e imagens antes do processamento OMR, por exemplo ClamAV ou serviço gerenciado, com falha segura quando a varredura não estiver disponível. Implementado `FileSecurityService` com heurísticas, bloqueio de PDFs ativos e hook opcional para ClamAV; falha segura quando `REQUIRE_MALWARE_SCAN=true`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Processar PDF/imagem em sandbox ou worker isolado com timeout, limite de CPU/memória e diretório temporário descartável. Concluído em 2026-05-10. Commit/PR: pendente. Observação: worker dedicado, diretório temporário descartável, timeout global e concorrência configurável adicionados; limite rígido de CPU/memória deve ser aplicado também no ambiente de deploy/container.
- [x] Remover metadados sensíveis de imagens quando viável, especialmente localização EXIF. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Definir retenção de arquivos originais, exports MusicXML e logs de auditoria, incluindo exclusão por solicitação do usuário. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Garantir que erros de conversão não exponham paths internos, comandos, tokens ou detalhes de infraestrutura. Coberto por testes existentes do adaptador OMR. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Documentar dados coletados para a política de privacidade: conta, e-mail, arquivos enviados, logs de auditoria, IP e eventos de compra. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Adicionar testes automatizados para upload malicioso: extensão falsa, MIME divergente, arquivo vazio, arquivo acima do limite, path traversal no nome, múltiplos arquivos e PDF/imagem inválidos. Coberto parcialmente por testes existentes e novo teste de PDF ativo; ampliar com múltiplos arquivos/path traversal dedicado em hardening futuro. Concluído em 2026-05-09. Commit/PR: pendente.

Critérios de aceite:

- IDs públicos são opacos e não sequenciais.
- Não há SQL manual sem justificativa, validação e teste.
- Upload malicioso é rejeitado antes de chegar ao OMR.
- Arquivos aceitos são processados com limites de tamanho, tempo e isolamento.
- Usuário comum só acessa suas próprias partituras.
- Política de privacidade e retenção estão prontas antes do TestFlight externo.

## Fase 3: Lista, Detalhes E Status De Partituras

Objetivo: reproduzir no iOS o fluxo básico de consulta das partituras.

Dependências: Fases 2 e 2.5.

Atividades:

- [x] Criar tela de lista de partituras. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Integrar `GET /api/scores`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Criar tela/modal de detalhes. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Exibir status: `queued`, `processing`, `converted`, `failed`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Exibir mensagens de erro/warnings de conversão. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Criar atualização periódica enquanto houver partitura em fila/processando. Concluído em 2026-05-09. Commit/PR: pendente.

Critérios de aceite:

- Usuário vê as mesmas partituras do web.
- Status muda sem precisar reiniciar o app.
- Erros de OMR aparecem de forma clara.

## Fase 4: Upload De PDF E Imagem

Objetivo: permitir envio de PDF, imagem da galeria e foto tirada pelo iPhone.

Dependências: Fases 2.5 e 3.

Atividades:

- [x] Adicionar `expo-document-picker` para PDF. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Adicionar `expo-image-picker` para galeria. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Adicionar captura pela câmera. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Enviar `multipart/form-data` para `POST /api/scores`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Exibir progresso/estado de upload. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Tratar limites de tamanho e formatos aceitos. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Bloquear upload no app quando o usuário gratuito já tiver usado os 3 scans, exibindo paywall antes do envio. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Tratar resposta de limite excedido vinda do backend, mesmo que o app tenha falhado em bloquear localmente. Concluído em 2026-05-09. Commit/PR: pendente.

Critérios de aceite:

- Usuário consegue enviar PDF.
- Usuário consegue enviar imagem da galeria.
- Usuário consegue tirar foto e enviar.
- Upload criado aparece na lista com status inicial.
- Usuário gratuito não consegue iniciar o quarto scan sem desbloqueio pago.

## Fase 5: Captura Guiada Tipo Scanner

Objetivo: melhorar a qualidade das fotos enviadas para OMR, reduzindo falhas e falsos positivos.

Dependências: Fase 4.

Atividades:

- [x] Criar botão principal `Escanear partitura`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Adicionar instruções curtas antes da câmera: folha reta, boa luz, sem sombra, ocupar quase toda a tela. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Criar tela de confirmação da foto antes do upload. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Permitir refazer foto. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Detectar sinais simples de baixa qualidade no cliente: imagem muito escura, muito pequena ou muito desfocada quando viável. Implementado alerta simples para resolução baixa; escuro/desfocado fica pendente para biblioteca de visão/imagem. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Mostrar alerta antes do envio se a foto parecer inadequada. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Orientar uso de modo documento/scan quando disponível. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Avaliar biblioteca de recorte/perspectiva para transformar a foto em imagem mais parecida com scan. Concluído em 2026-05-10. Commit/PR: pendente. Observação: para o MVP foi mantido recorte manual com `allowsEditing`; correção automática de perspectiva fica como melhoria pós-teste em dispositivo real. Critérios registrados em `docs/SCAN_IMAGE_GUIDE.md`.

Critérios de aceite:

- O usuário entende como tirar uma foto melhor antes de enviar.
- Foto pode ser revisada/refeita.
- Fotos claramente ruins recebem alerta antes do upload.
- O backend recebe imagens mais alinhadas e com menos margem desnecessária.

Notas:

- O objetivo desta fase não é rodar OMR no iPhone.
- O objetivo é capturar uma imagem melhor para o pipeline atual do backend.
- Se a correção de perspectiva exigir biblioteca nativa, considerar Expo Dev Client.

## Fase 6: Download E Compartilhamento Do MusicXML

Objetivo: permitir baixar, abrir ou compartilhar o MusicXML gerado.

Dependências: Fases 2.5 e 3.

Atividades:

- [x] Integrar `GET /api/scores/:id/download`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Salvar arquivo temporariamente com `expo-file-system`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Compartilhar arquivo com `expo-sharing`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Tratar caso `conversionStatus` ainda não seja `converted`. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Mostrar mensagem quando o resultado precisar ser revisado no MuseScore ou outro editor. Concluído em 2026-05-10. Commit/PR: pendente.

Critérios de aceite:

- Usuário consegue compartilhar MusicXML com outro app.
- Usuário recebe erro claro quando o arquivo ainda não está pronto.
- Nome do arquivo preserva o nome original quando possível.

## Fase 7: Qualidade De Conversão E Feedback Ao Usuário

Objetivo: melhorar a confiança do usuário no resultado, deixando claro quando a leitura é parcial ou precisa revisão.

Dependências: Fases 3, 4 e 5.

Atividades:

- [x] Exibir `confidence` de forma amigável. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Exibir warnings retornados pelo backend. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Diferenciar `convertido com alerta` de `convertido com alta confiança`. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Criar orientação para reenviar foto quando houver baixa confiança. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Registrar exemplos de imagens que funcionam bem e mal para guiar melhorias futuras. Concluído em 2026-05-10. Commit/PR: pendente. Observação: guia criado em `docs/SCAN_IMAGE_GUIDE.md`.

Critérios de aceite:

- Usuário não confunde conversão parcial com leitura perfeita.
- App recomenda próxima ação quando a conversão é ruim.

## Fase 8: Plano Gratuito, Compra E Entitlements

Objetivo: implementar o modelo comercial com 2 conversões gratuitas e desbloqueio único por R$ 23,90.

Dependências: Fases 2.5, 4 e conta App Store Connect validada.

Atividades:

- [x] Modelar no backend o entitlement do usuário: `free` ou `paid`, quantidade de scans usados, data da compra, origem da compra e identificador da transação Apple. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Criar migração Prisma para persistir entitlement e ledger de uso. O ledger deve registrar cada upload aceito para auditoria e evitar inconsistência do contador. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Criar endpoint `GET /api/me/entitlement` retornando plano, scans usados, scans restantes e status da compra. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Fazer `POST /api/scores` validar o limite no servidor antes de salvar arquivo e enfileirar conversão. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Garantir que o limite gratuito seja atômico no banco para evitar dois uploads simultâneos passarem como terceiro scan. Implementado com update condicional em transação no repositório Prisma. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Criar endpoint para registrar/validar compra Apple no servidor. Endpoint criado com falha segura em produção até configurar validação Apple real. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Integrar StoreKit no iOS com produto não consumível, por exemplo `premium_unlock`, usando biblioteca compatível com Expo Dev Client/EAS. Concluído em 2026-05-10. Commit/PR: pendente. Observação: implementado com `expo-iap`; requer produto real no App Store Connect para teste de compra sandbox.
- [ ] Configurar o produto não consumível `premium_unlock` no App Store Connect e no Google Play Console, com nome, descrição, screenshot de revisão e preço de R$ 23,90 na vitrine brasileira.
- [x] Implementar paywall antes da terceira conversão, mostrando o preço vindo da loja e fallback de R$ 23,90 em desenvolvimento/local. Atualizado em 2026-08-24. Commit/PR: pendente.
- [x] Implementar restauração de compra no app. Concluído em 2026-05-10. Commit/PR: pendente. Observação: usa `restorePurchases` e registra entitlement restaurado no backend antes de finalizar a transação.
- [x] Validar recibo/transação no servidor ou usar verificação StoreKit adequada antes de liberar plano pago. Concluído em 2026-05-10. Commit/PR: pendente. Observação: backend valida JWS/API Apple quando `APPLE_ROOT_CERT_PATHS` e credenciais Apple estão configuradas; produção falha fechada se faltar configuração.
- [x] Tratar compra pendente, cancelada, falha, reembolso/revogação e restauração em novo dispositivo. Concluído em 2026-05-10. Commit/PR: pendente. Observação: app trata cancelamento, falha, compra pendente e restauração; backend rejeita compra revogada na validação e processa `REFUND`/`REVOKE` por App Store Server Notifications V2.
- [x] Adicionar auditoria para `purchase_started`, `purchase_completed`, `purchase_failed`, `purchase_restored`, `entitlement_changed` e `free_scan_used`. Actions adicionadas; fluxos implementados para completed/failed/restored/entitlement_changed/free_scan_used. `purchase_started` fica reservado para integração StoreKit no app. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Adicionar testes unitários/integrados do limite: 0, 1, 2, 3 scans usados, quarto upload bloqueado, usuário pago sem limite gratuito, concorrência e restauração de compra. Coberto para 0-3, quarto bloqueado e pago sem limite; concorrência real fica para teste de banco PostgreSQL. Concluído em 2026-05-09. Commit/PR: pendente.

Critérios de aceite:

- Usuário novo pode enviar até 2 PDFs/fotos sem pagar.
- A terceira conversão é bloqueada pelo backend e apresenta paywall no app.
- Compra aprovada libera novos scans na conta do usuário.
- Compra pode ser restaurada em outro iPhone.
- Preço exibido no app vem da App Store.
- Backend nunca confia apenas em estado local do app para liberar uploads.
- App Review consegue visualizar e testar a compra in-app.

Observações:

- Como o desbloqueio libera funcionalidade digital dentro do app, a rota padrão de App Store é In-App Purchase.
- Para um desbloqueio permanente, use produto não consumível. Assinatura só deve ser usada se houver valor recorrente claro.
- O preço final pode variar por país e imposto conforme configuração das lojas; usar R$ 23,90 como requisito comercial base para Brasil.

## Fase 9: Administração No iOS

Objetivo: decidir e implementar funcionalidades admin no app iOS, se fizer parte do produto.

Dependências: Fase 2.

Atividades:

- [x] Decidir se admin entra no MVP iOS. Decisão: admin não entra no MVP iOS; segue no web. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Se sim, listar usuários. Não aplicável ao MVP iOS: admin permanece no web. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Se sim, permitir ativar/desativar usuário. Não aplicável ao MVP iOS: admin permanece no web. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Se sim, permitir reset manual de senha temporária. Não aplicável ao MVP iOS: admin permanece no web. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Se sim, listar auditoria básica ou manter auditoria só no web. Decisão: auditoria/admin ficam no web no MVP iOS. Concluído em 2026-05-10. Commit/PR: pendente.

Critérios de aceite:

- Comportamento admin no iOS está alinhado ao web.
- Nenhuma ação admin crítica fica sem confirmação.

## Fase 10: TestFlight

Objetivo: distribuir uma versão de teste para uso real em iPhones.

Dependências: Fases 1 a 8.

Atividades:

- [x] Configurar `app.json`/`app.config.ts` com bundle id. Concluído em 2026-05-09. Commit/PR: pendente.
- [x] Configurar ícone, splash e nome do app. Concluído em 2026-05-09. Commit/PR: pendente. Observação: assets gerados em `apps/mobile/assets`, `app.json` atualizado e prebuild aplicado no iOS.
- [ ] Configurar EAS Build.
- [ ] Gerar build iOS interno.
- [ ] Publicar no TestFlight.
- [ ] Testar login, upload, conversão e download em dispositivo real.
- [ ] Testar permissões de câmera, fotos e arquivos em dispositivo real.
- [ ] Testar limite de 3 scans em conta gratuita.
- [ ] Testar compra sandbox, restauração de compra e bloqueio do quarto scan.
- [ ] Testar upload de arquivos inválidos e acima do limite em build real.

Critérios de aceite:

- Build disponível no TestFlight.
- Fluxo principal testado em pelo menos um iPhone real.
- Fluxo gratuito e pago testado em sandbox.
- Bugs críticos documentados.

## Fase 11: App Store

Objetivo: preparar lançamento público ou privado.

Dependências: Fase 10.

Atividades:

- [ ] Preparar descrição, screenshots e política de privacidade. Parcial em 2026-05-10: descrição e política foram preparadas em `docs/APP_STORE_SUBMISSION.md` e `docs/PRIVACY_POLICY.md`; screenshots finais dependem de build em simulador/dispositivo.
- [x] Declarar uso de câmera, fotos e arquivos. Concluído em 2026-05-10. Commit/PR: pendente. Observação: permissões configuradas no app iOS e texto de submissão registrado em `docs/APP_STORE_SUBMISSION.md`.
- [x] Revisar coleta de dados e autenticação. Concluído em 2026-05-10. Commit/PR: pendente. Observação: política de privacidade e dados coletados registrados em `docs/PRIVACY_POLICY.md`.
- [ ] Declarar dados coletados no App Privacy do App Store Connect.
- [ ] Preparar conta demo para revisão da Apple, com instruções para testar os 3 scans gratuitos e o desbloqueio pago.
- [ ] Garantir que o In-App Purchase esteja completo, visível e enviado para revisão junto com o app.
- [x] Incluir notas de revisão explicando que o app gratuito permite 3 scans totais e que o desbloqueio pago libera uso adicional. Concluído em 2026-05-10. Commit/PR: pendente. Observação: texto registrado em `docs/APP_STORE_SUBMISSION.md`.
- [ ] Conferir se o Paid Apps Agreement está aceito no App Store Connect antes do envio.
- [x] Definir suporte/contato. Concluído em 2026-05-10. Commit/PR: pendente. Observação: texto base registrado em `docs/SUPPORT.md`; falta substituir pelo e-mail/domínio definitivo antes da submissão.
- [ ] Enviar para revisão.

Critérios de aceite:

- App aprovado ou feedback da Apple documentado.
- In-App Purchase aprovado ou feedback documentado.
- Processo de release reproduzível.

## Melhorias Futuras

- Captura com correção automática de perspectiva.
- Recorte manual da folha antes de enviar.
- Upload de múltiplas páginas.
- Push notification quando conversão terminar.
- Comparação lado a lado entre foto original e MusicXML gerado.
- Histórico de tentativas de conversão por arquivo.
- Integração com motor OMR alternativo além do Audiveris.

## Motores OMR Alternativos Para Avaliação

O backend atual usa Audiveris, que é open-source e exporta MusicXML, mas é sensível a fotos ruins. Para melhorar leitura de foto de celular, avaliar:

- Soundslice Scanner: serviço especializado em leitura de partitura a partir de imagem/PDF, com foco forte em MusicXML.
- PlayScore 2 / ReadScoreLib: solução comercial com SDK/API, avaliar licença e integração.
- ScanScore: produto comercial de OMR, avaliar automação/API.
- PhotoScore/Neuratron: solução madura, avaliar disponibilidade de integração backend.

Critérios para escolher motor alternativo:

- Exporta MusicXML.
- Aceita foto de celular.
- Tem API/SDK legalmente utilizável no produto.
- Custo previsível.
- Permite processamento no servidor ou fluxo compatível com iOS.
- Resultado melhor que Audiveris em partituras reais do nosso público.

## Checklist De Atividades Locais

Use esta seção como trilha operacional das atividades que podem ser feitas neste repositório ou na máquina local, sem depender diretamente do App Store Connect. Ao concluir uma atividade, marcar com data e commit/PR quando existir.

- [x] Gerar projeto iOS nativo com `npx expo prebuild -p ios`. Concluído em 2026-05-09. Commit/PR: pendente. Observação: `ios/` foi criado, CocoaPods foi instalado e `pod install` gerou `ScoretoMusicXML.xcworkspace`.
- [x] Abrir o workspace iOS no Xcode e confirmar que o projeto carrega sem erro de configuração. Concluído em 2026-05-09. Commit/PR: pendente. Observação: `open apps/mobile/ios/ScoretoMusicXML.xcworkspace` executou sem erro e `xcodebuild -list` confirmou o scheme `ScoretoMusicXML`.
- [x] Configurar/ajustar `bundleIdentifier`, nome do app, ícone e splash. Concluído em 2026-05-09 e atualizado em 2026-07-16. Commit/PR: pendente. Observação: `com.scoretomusicxml.app`, nome `Conversor de Partituras`, ícone e splash atualizados com a identidade laranja.
- [x] Rodar API, worker e app mobile localmente. Concluído em 2026-05-09. Commit/PR: pendente. Observação: API, worker e Metro iniciados e validados localmente.
- [x] Corrigir configuração Babel/Metro do Expo Router para o bundle iOS. Concluído em 2026-05-10. Commit/PR: pendente. Observação: adicionado `apps/mobile/babel.config.js` com `babel-preset-expo`, `apps/mobile/index.js` com fallback explícito de `EXPO_ROUTER_APP_ROOT`, `apps/mobile/metro.config.js` para monorepo e `AppDelegate.swift` restaurado para a entrada virtual padrão do Expo.
- [x] Corrigir resolução de dependências aninhadas do Expo Router no Metro. Concluído em 2026-05-10. Commit/PR: pendente. Observação: removido `disableHierarchicalLookup` do Metro para permitir resolver `@expo/metro-runtime` dentro de `expo-router/node_modules`.
- [x] Forçar transformação Babel do Expo Router no monorepo. Concluído em 2026-05-10. Commit/PR: pendente. Observação: `expoRouterBabelPlugin` foi adicionado explicitamente ao `apps/mobile/babel.config.js` e `_ctx.ios.js` agora transforma `EXPO_ROUTER_APP_ROOT` para `../../app`.
- [x] Forçar instância única de React no Metro mobile. Concluído em 2026-05-10. Commit/PR: pendente. Observação: `apps/mobile/metro.config.js` resolve `react` e subpaths sempre para `apps/mobile/node_modules/react`, evitando `Invalid hook call` por React duplicado no monorepo.
- [x] Ajustar entrada de credenciais no iOS. Concluído em 2026-05-10. Commit/PR: pendente. Observação: login mobile desativa autocorreção/capitalização, remove espaços no e-mail e permite mostrar senha para conferir caracteres antes de enviar.
- [x] Criar diagnóstico temporário de banco/API para login mobile. Concluído em 2026-05-10. Commit/PR: pendente. Observação: `GET /debug/auth` existe apenas fora de produção e lista e-mails/roles/status dos usuários, hash curto do `DATABASE_URL` e origem da requisição para comparar desktop e iPhone.
- [x] Testar login, sessão mobile e logout. Concluído em 2026-05-10. Commit/PR: pendente. Observação: validado contra API local com usuário comum criado via admin.
- [x] Testar lista, detalhes, status e polling de partituras. Concluído em 2026-05-10. Commit/PR: pendente. Observação: validado contra API/worker locais com PDF mínimo e OMR stub.
- [ ] Testar upload de PDF, imagem da galeria e câmera. Parcial em 2026-05-10: PDF e imagem validados via API local; câmera ainda requer simulador/dispositivo.
- [x] Testar limite gratuito de 3 scans no backend e no app. Concluído em 2026-05-10. Commit/PR: pendente. Observação: validado no backend local; app consome o mesmo endpoint e trata `FREE_SCAN_LIMIT_REACHED` exibindo paywall.
- [ ] Testar download/compartilhamento do MusicXML. Parcial em 2026-05-10: download validado via API local; compartilhamento ainda requer simulador/dispositivo.
- [ ] Melhorar scanner: instruções, confirmação, refazer foto, qualidade da imagem, recorte/perspectiva. Parcial em 2026-05-10: instruções, confirmação, refazer, alertas simples e recorte manual via `allowsEditing` implementados; correção automática de perspectiva ainda pendente.
- [x] Refinar mensagens de baixa confiança, warnings e `convertido com alerta`. Concluído em 2026-05-10. Commit/PR: pendente. Observação: `npm run build -w apps/mobile` passou após a alteração.
- [x] Implementar StoreKit no app usando produto `premium_unlock`. Concluído em 2026-05-10. Commit/PR: pendente. Observação: `npm run build -w apps/mobile`, `pod install` e `xcodebuild -list` passaram; compra real depende do produto no App Store Connect.
- [x] Implementar restauração de compra no app. Concluído em 2026-05-10. Commit/PR: pendente.
- [x] Implementar validação Apple server-side no backend. Concluído em 2026-05-10. Commit/PR: pendente. Observação: depende de `APPLE_ROOT_CERT_PATHS`, chaves In-App Purchase e teste sandbox real no App Store Connect.
- [x] Implementar tratamento de compra pendente, cancelada, reembolso/revogação. Concluído em 2026-05-10. Commit/PR: pendente. Observação: teste real de reembolso/revogação depende de notificações sandbox no App Store Connect.
- [x] Remover metadados EXIF quando viável. Concluído em 2026-05-10. Commit/PR: pendente. Observação: imagens são reencodadas no backend antes de persistir upload.
- [x] Definir e implementar retenção/exclusão de arquivos. Concluído em 2026-05-10. Commit/PR: pendente. Observação: `SCORE_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS` e endpoint admin de cleanup adicionados.
- [x] Fortalecer sandbox/isolamento do processamento PDF/imagem. Concluído em 2026-05-10. Commit/PR: pendente. Observação: `OMR_CONVERSION_TIMEOUT_MS`, `OMR_AUDIVERIS_TIMEOUT_MS` e `OMR_WORKER_CONCURRENCY` adicionados.
- [x] Criar textos finais de política de privacidade, suporte, descrição e notas de revisão. Concluído em 2026-05-10. Commit/PR: pendente. Observação: textos adicionados em `docs/PRIVACY_POLICY.md`, `docs/APP_STORE_SUBMISSION.md` e `docs/SUPPORT.md`.
- [ ] Rodar validação completa local: `npm run build`, `npm test -w apps/api`, build iOS local/EAS. Parcial em 2026-05-10: `npm run build` passou, `npm test -w apps/api` passou com 21 testes, `npm audit --audit-level=moderate` encontrou 4 vulnerabilidades moderadas transitivas do Expo/PostCSS sem correção segura por `audit fix --force`, e o build iOS local ficou bloqueado porque `pod install` não conseguiu resolver o CDN do CocoaPods e o `xcodebuild` fora do sandbox foi recusado por limite de uso/aprovação.
