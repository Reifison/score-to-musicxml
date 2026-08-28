# Pacote local de submissão — App Store e Google Play

Status: preparação de publicação em andamento. As páginas públicas de privacidade e suporte estão publicadas; o AAB Android de produção 1.0 (código 4) está em geração no EAS. Nenhum envio às lojas foi realizado.

Data da consolidação: 2026-08-27.

Este documento reúne os materiais e bloqueios para a submissão das versões iOS e Android. Os valores e textos abaixo são referências já existentes no repositório; itens que dependem de conta, console, dispositivo físico ou URL pública permanecem pendentes.

## Identidade do aplicativo

- Nome de exibição: `Conversor de Partituras`.
- Identificador iOS: `com.scoretomusicxml.app`.
- Identificador Android: `com.scoretomusicxml.app`.
- Versão declarada atualmente: `1.0`.
- Android `versionCode` atual: `4` (incrementado pelo EAS para o AAB em geração).
- Produto único: `premium_unlock`.
- Tipo do produto: compra única não consumível.
- Preço de referência no Brasil: R$ 23,90; a loja deve aplicar localização nos demais mercados.

Fonte: `apps/mobile/app.json`, [APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md), [GOOGLE_PLAY_SUBMISSION.md](GOOGLE_PLAY_SUBMISSION.md) e [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md).

## Metadados prontos

Os textos prontos para copiar para cada console estão em:

- Apple: [APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md).
- Google: [GOOGLE_PLAY_SUBMISSION.md](GOOGLE_PLAY_SUBMISSION.md).
- Suporte e perguntas frequentes: [SUPPORT.md](SUPPORT.md).
- Política de privacidade: [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

Antes de publicar, revisar acentuação, limite de caracteres do campo no console, categoria, classificação etária e idioma/região. Não alterar o preço ou o comportamento comercial sem atualizar os quatro documentos relacionados.

## Privacidade e segurança

### Apple App Privacy

Usar como fonte de verdade [APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md), seção “Checklist App Privacy”, em conjunto com [PRIVACY_POLICY.md](PRIVACY_POLICY.md). A declaração inclui e-mail, arquivos de partituras, MusicXML/MIDI solicitado, identificadores internos/transações, dados de uso e diagnósticos operacionais.

### Google Data Safety

Usar a seção “Declaração De Dados” de [GOOGLE_PLAY_SUBMISSION.md](GOOGLE_PLAY_SUBMISSION.md) e conferir novamente contra a versão final e os SDKs embarcados. A declaração precisa refletir coleta, finalidade, compartilhamento, retenção e exclusão efetivos.

### Permissões

Conferir [STORE_SUBMISSION_PERMISSIONS.md](STORE_SUBMISSION_PERMISSIONS.md). O pacote declara câmera/fotos conforme a função de digitalização, Internet e Billing no Android; não deve reintroduzir microfone, biometria ou armazenamento amplo.

### URLs públicas

- Política de privacidade: `https://converter.nossateoria.com.br/privacidade` — publicada e verificada em HTTPS em 2026-08-27.
- Suporte: `https://converter.nossateoria.com.br/suporte` — publicado e verificado em HTTPS em 2026-08-27.

## Compra e revisão da loja

### Produto `premium_unlock`

Configurar como não consumível/compra única, com R$ 23,90 no Brasil. A compra deve ser iniciada pelo StoreKit ou Google Play Billing, validada no backend e vinculada à conta do usuário. Não colocar chaves, tokens, conta de serviço ou certificados no repositório.

### Instruções de revisão

Usar as instruções completas em [APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md) e [GOOGLE_PLAY_SUBMISSION.md](GOOGLE_PLAY_SUBMISSION.md): login com conta demo, envio de partitura, conversão, player, exportação, duas conversões gratuitas, paywall na terceira tentativa e restauração da compra.

A conta demo, senha, instruções de acesso e eventuais códigos de revisão devem ser inseridos diretamente no campo seguro do console. Não registrar esses dados neste pacote.

## Imagens e screenshots

### Arquivos reais disponíveis

- Ícone fonte: `apps/mobile/assets/icon.png` — 1024×1024 PNG.
- Splash: `apps/mobile/assets/splash.png` — 1024×1024 PNG.
- Ícone iOS incorporado: `apps/mobile/ios/ScoretoMusicXML/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png` — 1024×1024 PNG.
- Feature graphic Google Play: `apps/mobile/store-assets/google-play/feature-graphic-v1.png` — 1024×500 PNG.
- Fonte da feature graphic: `apps/mobile/store-assets/google-play/feature-graphic-v1-source.png` — 1774×887 PNG.

A feature graphic está pronta para o Google Play. O ícone e o splash não substituem screenshots de uso do produto.

### Matriz de screenshots pendentes

As capturas devem ser feitas com builds reais e sem inserir dados pessoais. A lista de telas segue [STORE_SCREENSHOTS_STATUS.md](STORE_SCREENSHOTS_STATUS.md): login; início/upload; lista de partituras; player com painel de faixas.

| Destino | Capturas a preparar | Formato de entrega | Estado |
|---|---|---|---|
| App Store — iPhone | 6,7", 6,5" e 5,5"; incluir player com duas faixas | PNG ou JPEG, resolução nativa aceita pelo App Store Connect | Pendente de simulador/dispositivo |
| App Store — iPad | 12,9" quando o suporte a tablet for publicado | PNG ou JPEG, resolução nativa aceita pelo App Store Connect | Pendente de simulador/dispositivo |
| Google Play — telefone | Capturas verticais do fluxo principal e do player com faixas | PNG ou JPEG, sem moldura promocional obrigatória | Pendente de emulador/dispositivo |
| Google Play — tablet | Somente se a ficha publicar suporte específico a tablet | PNG ou JPEG, dimensões aceitas pelo Play Console | Pendente de decisão/dispositivo |

Para cada imagem, registrar plataforma, modelo, resolução, versão do app e data. Validar no console o conjunto de dimensões aceito no momento do upload; não redimensionar uma captura de outro aparelho para simular uma resolução nativa. O procedimento e o bloqueio atual estão documentados em [STORE_SCREENSHOTS_STATUS.md](STORE_SCREENSHOTS_STATUS.md).

## Checklist de ações externas bloqueadoras

### Apple

- [ ] Confirmar equipe e conta do App Store Connect.
- [ ] Registrar/verificar o app com bundle ID `com.scoretomusicxml.app`.
- [ ] Criar o IAP não consumível `premium_unlock`, preço e textos/localizações.
- [ ] Configurar chaves/certificados necessários no ambiente seguro de build e validação server-side.
- [x] Publicar e testar URLs HTTPS de suporte e privacidade.
- [ ] Preencher instruções da conta demo no App Review.
- [ ] Produzir screenshots reais em iPhone/iPad e anexá-las à ficha.
- [ ] Gerar build assinado, subir para TestFlight, adicionar testadores e concluir compra/restauração sandbox.
- [ ] Definir categoria, classificação etária, direitos de conteúdo e disponibilidade de países.

### Google Play

- [ ] Confirmar conta de desenvolvedor, pacote `com.scoretomusicxml.app` e perfil de pagamentos.
- [ ] Ativar Play App Signing e configurar credenciais de upload fora do repositório.
- [ ] Criar o produto não consumível `premium_unlock`, preço e localizações.
- [ ] Configurar Google Play Developer API, conta de serviço e RTDN/Cloud Pub/Sub no ambiente seguro.
- [x] Publicar e testar URLs HTTPS de suporte e privacidade.
- [ ] Preencher instruções da conta demo na revisão.
- [ ] Cadastrar testadores de licença e publicar primeiro na faixa interna.
- [ ] Produzir screenshots reais e anexar a feature graphic existente.
- [ ] Gerar AAB assinado com `versionCode` novo, instalar a faixa interna e validar Billing/restauração/reembolso.
- [ ] Preencher Data Safety, categoria, classificação etária, contato, países e ficha da loja.

### Bloqueios comuns às duas lojas

- [ ] Definir URLs públicas finais e e-mail de suporte; nenhum valor foi inventado neste pacote.
- [ ] Definir responsável nominal pelo go/no-go, SHA do candidato e número final de build.
- [ ] Disponibilizar iPhone e Android físicos ou emuladores funcionais para screenshots e regressão.
- [ ] Confirmar preço/localização no console, sem assumir que o valor planejado foi aplicado.
- [ ] Registrar testadores, janela de observação e plano de rollback.

## Ordem de execução e validação

1. Fechar identidade, versão e metadados; validar textos contra os limites dos consoles.
2. Criar produtos e dados de revisão nos consoles; validar compra sandbox/internal.
3. Publicar e testar as URLs de suporte/privacidade; validar os links em navegador e no app.
4. Capturar cada screenshot real, verificar legibilidade e dimensões; validar upload no console.
5. Gerar artefatos assinados iOS/Android, testar em dispositivos e enviar primeiro para TestFlight/faixa interna.
6. Fazer a validação final antes de qualquer envio público: instalação, login, upload, conversão, player/faixas, exportações, duas conversões, paywall, compra, restauração, privacidade, permissões, screenshots, logs e rollback.

## Estado desta etapa

Pacote local consolidado e validado contra os documentos existentes. As imagens disponíveis foram inventariadas; screenshots de produto ainda não foram geradas porque os ambientes iOS/Android não estavam disponíveis, conforme [STORE_SCREENSHOTS_STATUS.md](STORE_SCREENSHOTS_STATUS.md). O envio às lojas permanece bloqueado até as ações externas acima serem concluídas.
