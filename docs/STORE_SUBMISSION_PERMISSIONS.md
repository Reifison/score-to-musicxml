# Permissões para publicação nas lojas

O app solicita somente permissões compatíveis com suas funções:

- iOS: câmera e biblioteca de fotos, usadas para fotografar ou selecionar partituras; acesso de gravação na biblioteca é mantido para exportações compartilhadas.
- Android: câmera, Internet e `com.android.vending.BILLING`; `VIBRATE` permanece disponível para o comportamento nativo já configurado.
- Documentos e armazenamento seguro são fornecidos pelos módulos Expo correspondentes, sem solicitar armazenamento externo amplo.

Não há uso de microfone ou autenticação biométrica no código do app. O plugin
`apps/mobile/plugins/withStorePermissionCleanup.js` remove essas declarações do
iOS e remove `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` e
`WRITE_EXTERNAL_STORAGE` do Android durante o prebuild/EAS, evitando que
manifests gerados reintroduzam permissões residuais.

Além disso, `expo-secure-store` está configurado com `faceIDPermission: false`;
isso impede que o próprio módulo reintroduza a declaração durante o prebuild.
