# Resposta para a revisao da App Store — 08/09/2026

> Atualização de estado em 2026-10-06: a consulta atual retornou versão 1.0 rejeitada e IAP pronto para envio. Este documento preserva os fatos de setembro; não comprova aprovação atual. Ver [evidência](app-store/status-2026-10-06.json) e [gates atuais](validation/RELEASE_GATES_2026-10-06.md).

## Diagnostico

- A captura de tela de iPad de 13 polegadas enviada mostra somente o login e nao comunica a funcao principal do app.
- A ficha descreve corretamente uma compra unica, mas a primeira compra dentro do app `premium_unlock` ainda esta em **Preparar para envio** e precisa ser anexada ao mesmo envio da versao 1.0.
- O produto e nao consumivel, tem o nome de referencia **Conversoes ilimitadas** e nao e uma assinatura.
- O ambiente de producao confirma 3 conversoes gratuitas por conta. A descricao e as notas da App Store precisam ser atualizadas de 2 para 3; a quarta tentativa de envio abre o paywall.
- Nao existe compra externa, assinatura, conteudo pago de terceiros ou recurso pago liberado sem In-App Purchase.

## Resposta pronta para a Apple

Hello App Review Team,

Thank you for your feedback. We have addressed both points:

1. We replaced the 13-inch iPad login-only screenshot with new screenshots captured from the app in use. They show the main conversion screen, the photo review step, and the converted score detail/player experience.

2. Our business model is as follows:

   1. The paid feature is intended for musicians, music students, teachers, arrangers, and other users who want to submit more scores after using the three free conversions included with their account.
   2. The feature can be purchased only inside the iOS/iPadOS app through Apple's In-App Purchase system. The product identifier is `premium_unlock`, and its type is non-consumable. We do not direct users to an external purchase method.
   3. A user who previously purchased `premium_unlock` can restore the purchase in the app. The purchase permanently unlocks unlimited new score submissions/conversions for that app account. Existing converted scores remain viewable and exportable; the paid unlock specifically removes the limit on new conversions.
   4. No paid content, subscriptions, or paid features are unlocked in the app without using In-App Purchase. The app has no external checkout and no third-party paid content.

The first non-consumable In-App Purchase, `premium_unlock`, has also been included in the same review submission as app version 1.0.

Review steps:

1. Sign in with the review credentials provided in App Store Connect.
2. Open “Minhas partituras” to see converted scores.
3. Open a completed score to view the notation, play it, and export MusicXML or MIDI.
4. With an account that has used its three free conversions, tap PDF, Photo, or Scan Score to display the paywall.
5. Use “Restore Purchase” to test restoration of the non-consumable product.

Please let us know if any additional information is needed.

## Notas prontas para a revisao do IAP

`premium_unlock` is a non-consumable In-App Purchase that permanently unlocks unlimited new score submissions/conversions for the signed-in app account. To display the paywall, sign in with the review credentials provided with the app version and tap PDF, Photo, or Scan Score after the three free conversions have been used. The paywall also provides Restore Purchase. No external purchase method is available.

## Capturas preparadas

Todas as capturas finais estao em JPEG sem transparencia, orientacao vertical e 2064 x 2752 pixels, tamanho aceito para iPad de 13 polegadas.

1. `docs/app-store/2026-09-08/screenshots/final/01-player-reproduzindo-ipad-13.jpg` — partitura convertida em reproducao, com a nota atual destacada.
2. `docs/app-store/2026-09-08/screenshots/final/02-conferir-partitura-ipad-13.jpg` — etapa de conferencia da imagem antes do envio.
3. `docs/app-store/2026-09-08/screenshots/final/03-converter-partituras-ipad-13.jpg` — tela principal com opcoes para escanear, escolher PDF ou foto.
4. `docs/app-store/2026-09-08/iap-review/paywall-premium-unlock-review-ipad-2048x2732.jpg` — paywall real com o preco retornado pela App Store, redimensionado para 2048 x 2732 pixels, RGB, JPEG, 72 dpi e sem transparencia; captura aceita para a revisao do IAP.

## Checklist antes de reenviar

- [x] Confirmado no ambiente de producao: o limite e 3 conversoes gratuitas por conta.
- [x] Preparadas e verificadas tres capturas do app em uso para o iPad de 13 polegadas.
- [x] Preparada e verificada a captura do paywall para a revisao do IAP.
- [x] Corrigir a descricao da App Store de 2 para 3 conversoes gratuitas.
- [x] Substituir a captura de login do iPad de 13 polegadas por tres capturas do app em uso.
- [x] Adicionar ao produto `premium_unlock` uma captura de revisao mostrando o paywall.
- [x] Adicionar ao produto `premium_unlock` as notas para revisao e salvar.
- [x] Clicar em **Adicionar para revisao** no IAP e inclui-lo no mesmo envio da versao 1.0.
- [x] Atualizar as notas da versao para indicar que a quarta tentativa abre o paywall.
- [x] Responder a mensagem da Apple com o texto acima.
- [x] Corrigir o nome publico de “Converter Partiruras” para “Conversor de Partituras”.
- [x] Reenviar a versao 1.0 (6) e `premium_unlock` juntos para revisao.

## Estado final no App Store Connect

- Novo ID do envio: `84080029-774a-4519-a540-1a12ed48369a`.
- Versao 1.0 (6): **Aguardando revisao**.
- Compra dentro do app “Conversoes ilimitadas”: **Aguardando revisao**.
- Resposta a equipe de revisao enviada em 08/09/2026.
