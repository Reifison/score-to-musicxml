# Android Release Runbook

## Pre-requisitos Externos

- Conta Google Play Console verificada e perfil de pagamentos configurado.
- Projeto Google Cloud com a Google Play Developer API ativada.
- Conta de servico com acesso minimo necessario no Play Console; a chave fica somente no gerenciador de segredos do ambiente.
- Topico Cloud Pub/Sub configurado para Real-time Developer Notifications (RTDN) e endpoint HTTPS da API acessivel.
- Produto nao consumivel `premium_unlock` criado com preco de R$ 23,90 no Brasil e testadores de licenca cadastrados.

## Antes Da Build

1. Incrementar `android.versionCode` e atualizar `version` quando for uma nova versao publica.
2. Configurar no ambiente de build `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_PLAYER_URL` com URLs HTTPS de producao.
3. Configurar os segredos `GOOGLE_PLAY_*` somente no ambiente da API; nunca em `app.json`, `eas.json` ou no aplicativo.
4. Conferir que a regra de negocio concede duas conversoes gratuitas por conta e que cada arquivo aceito para processamento consome uma conversao.
5. Conferir que `premium_unlock` e compra unica nao consumivel: nao ha chamada de consumo e a confirmacao da compra ocorre somente apos validacao no backend.
6. Conferir que o backend valida o `purchaseToken` na Google Play Developer API, vincula o direito Premium a conta e trata a mesma notificacao/token de forma idempotente.
7. Conferir assinatura e endpoint HTTPS do Pub/Sub para RTDN, incluindo compra, reembolso e revogacao; o endpoint deve consultar a API do Google antes de alterar o direito.
8. Executar `npm run lint`, `npm run build` e `npm test`.
9. Validar `npm exec --workspace=@score-to-musicxml/mobile -- expo config --type prebuild --json` e conferir permissões do manifesto gerado.

## Artefatos

- Desenvolvimento: `eas build --platform android --profile development` (APK com dev client).
- Homologacao interna: `eas build --platform android --profile preview` (APK instalavel).
- Google Play: `eas build --platform android --profile production` (AAB).

## Validacao Em Dispositivo

- Login, logout e renovacao de sessao.
- Selecao de PDF por provedor externo e imagem por galeria.
- Camera, recorte e negacao de permissao.
- Upload, processamento, cache e exclusao de partitura.
- Player offline, audio, pausa em segundo plano, retomada e rotacao.
- Exportacao/compartilhamento MusicXML e MIDI, inclusive para MuseScore.
- Duas conversoes gratuitas por conta, inclusive apos logout/login, reinstalacao e uso em outro aparelho.
- Terceira tentativa: paywall claro com desbloqueio permanente, preco de R$ 23,90 no Brasil, Restaurar compras, Termos e Privacidade.
- Compra de teste: sucesso, cancelamento pelo usuario, pendente, app fechado/aberto durante a compra e repeticao segura do retorno.
- Validacao no backend: token valido, token invalido, token ja processado e usuario autenticado diferente do vinculado a compra.
- Restauracao em novo aparelho e nova sessao, sem nova cobranca.
- RTDN: compra, reembolso e revogacao; conferir que a permissao e atualizada somente apos consulta a Google Play Developer API.
- Atualizacao da versao anterior e retorno do link `scoretomusicxml://`.

## Publicacao E Rollback

1. Enviar o AAB para a faixa interna e concluir a matriz acima.
2. Conferir logs da API para falhas de validacao Google e entrega de RTDN, sem registrar tokens, dados de pagamento ou conteudo musical.
3. Promover gradualmente para faixa fechada e producao.
4. Em incidente, interromper a promocao, manter a API retrocompativel, revogar apenas o artefato novo e preparar correcao. Uma versao Android ja instalada nao pode ser removida remotamente.
