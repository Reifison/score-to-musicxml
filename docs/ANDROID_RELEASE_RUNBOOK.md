# Android Release Runbook

## Pre-requisitos Externos

- Conta Google Play Console verificada e perfil de pagamentos configurado.
- Projeto Google Cloud com a Google Play Developer API ativada.
- Conta de servico com acesso minimo necessario no Play Console; a chave fica somente no gerenciador de segredos do ambiente.
- Topico Cloud Pub/Sub configurado para Real-time Developer Notifications (RTDN) e endpoint HTTPS da API acessivel.
- Produto `premium_unlock` criado e testadores de licenca cadastrados.

## Antes Da Build

O candidato local de 2026-10-06 usa versão 1.0 e `versionCode` 1 nos fontes; o próximo código disponível no Play não foi consultado. O EAS incrementa `versionCode` no perfil Android de produção e `buildNumber` no iOS; o build iOS 7 é somente candidato após o build 6 consultado na Apple.

Execute `npm run release:preflight -w apps/mobile` antes do build. As verificações de fonte não aprovam o artefato. Após gerar o AAB, informe seu caminho e o SHA-256 conhecido da credencial de upload ao preflight, junto ao manifesto de release mesclado:

```sh
ANDROID_UPLOAD_CERT_SHA256='<SHA-256 do certificado de upload já configurado>' npm run release:preflight -w apps/mobile -- --aab /caminho/app-release.aab --merged-manifest /caminho/AndroidManifest.xml
```

O Gradle local não usa mais o certificado debug como fallback de release. O EAS deve aplicar a credencial de produção configurada; um artefato local sem assinatura não serve para envio. Não criar uma chave nova para substituir a credencial de upload existente sem confirmar a identidade esperada no Play Console.

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
- Player com internet, erro claro sem rede, áudio, pausa em segundo plano, retomada e rotação. O MusicXML cacheado não garante reprodução offline.
- Exportacao/compartilhamento MusicXML e MIDI, inclusive para MuseScore.
- Paywall, compra de teste, pendente, restauracao e revogacao/reembolso.
- Atualizacao da versao anterior e retorno do link `scoretomusicxml://`.

## Publicacao E Rollback

1. Enviar o AAB para a faixa interna e concluir a matriz acima.
2. Conferir logs da API para falhas de validacao Google e entrega de RTDN, sem registrar tokens ou conteudo musical.
3. Promover gradualmente para faixa fechada e producao.
4. Em incidente, interromper a promocao, manter a API retrocompativel, revogar apenas o artefato novo e preparar correcao. Uma versao Android ja instalada nao pode ser removida remotamente.
