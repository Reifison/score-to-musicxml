# Android Release Runbook

## Pre-requisitos Externos

- Conta Google Play Console verificada e perfil de pagamentos configurado.
- Projeto Google Cloud com a Google Play Developer API ativada.
- Conta de servico com acesso minimo necessario no Play Console; a chave fica somente no gerenciador de segredos do ambiente.
- Topico Cloud Pub/Sub configurado para Real-time Developer Notifications (RTDN) e endpoint HTTPS da API acessivel.
- Produto `premium_unlock` criado e testadores de licenca cadastrados.

## Antes Da Build

1. Incrementar `android.versionCode` e atualizar `version` quando for uma nova versao publica.
2. Configurar no ambiente de build `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_PLAYER_URL` com URLs HTTPS de producao.
3. Configurar os segredos `GOOGLE_PLAY_*` somente no ambiente da API; nunca em `app.json`, `eas.json` ou no aplicativo.
4. Executar `npm run lint`, `npm run build` e `npm test`.
5. Validar `npm exec --workspace=@score-to-musicxml/mobile -- expo config --type prebuild --json` e conferir permissões do manifesto gerado.

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
- Paywall, compra de teste, pendente, restauracao e revogacao/reembolso.
- Atualizacao da versao anterior e retorno do link `scoretomusicxml://`.

## Publicacao E Rollback

1. Enviar o AAB para a faixa interna e concluir a matriz acima.
2. Conferir logs da API para falhas de validacao Google e entrega de RTDN, sem registrar tokens ou conteudo musical.
3. Promover gradualmente para faixa fechada e producao.
4. Em incidente, interromper a promocao, manter a API retrocompativel, revogar apenas o artefato novo e preparar correcao. Uma versao Android ja instalada nao pode ser removida remotamente.
