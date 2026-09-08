# Screenshots para as lojas

Data da verificação: 2026-08-27

## Resultado

Foram obtidas capturas nativas reais no iPhone físico conectado, sem usar câmera
do computador. O simulador continua indisponível neste Mac: `xcrun simctl list
devices available` não consegue conectar ao CoreSimulatorService.

- iPhone: capturas PNG reais em 1284×2778, dimensão aceita pela App Store para
  iPhone de 6,5 polegadas.
- Android: `adb devices -l` não conseguiu iniciar o daemon (`Operation not
  permitted`); nenhum emulador ou dispositivo foi detectado.
- Não foram criadas imagens sintéticas ou mockups.

Foram geradas capturas reais do site responsivo autenticado, nos formatos aceitos
pelas lojas, em `apps/mobile/store-assets/screenshots/`. Elas são somente rascunhos:
a sessão disponível era administrativa e exibe o nome do administrador e os itens
"Usuários" e "Logs". Portanto, não podem ser enviadas às lojas. Elas servem para
validar dimensões e orientar a captura final com uma conta comum de demonstração.

As capturas nativas limpas disponíveis da conta `Demonstração da Loja` estão em
`apps/mobile/store-assets/screenshots/native/iphone/`:

- `00-login.png` — tela de entrada, sem dados pessoais; útil como evidência,
  mas não demonstra o produto por si só.
- `01-dashboard.png` — tela inicial com conversão por câmera, PDF e foto, sem
  menus administrativos nem dados pessoais; candidata para a loja.

Elas não devem ser enviadas isoladamente às lojas: ainda faltam uma lista limpa
de resultados convertidos, o player e o painel de faixas/mute. As imagens
administrativas e os rascunhos web continuam proibidos para envio.

Uma captura temporária do player foi separada da seleção para envio: ela pode
conter conteúdo visual remanescente da sessão anterior à troca de conta. A
correção de isolamento de cache já entrou em uma nova build, mas as próximas
capturas só serão feitas depois de validar a troca de conta nessa build.

## Assets reais já existentes

- `apps/mobile/assets/icon.png` — 1024×1024 PNG, usado como ícone do app.
- `apps/mobile/assets/splash.png` — 1024×1024 PNG, usado na inicialização.
- `apps/mobile/ios/ScoretoMusicXML/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png`
  — 1024×1024 PNG, ícone iOS incorporado.

## Matriz de screenshots pendentes

| Plataforma | Tela | Estado | Pré-requisito |
|---|---|---|---|
| iPhone | Login | Capturado | Conta de demonstração |
| iPhone | Tela inicial / upload | Capturado | Conta de demonstração |
| iPhone | Lista de partituras | Pendente | Sessão autenticada e dados de demonstração |
| iPhone | Player com painel de faixas | Pendente | Partitura convertida com duas faixas |
| Android | Login | Pendente | Emulador ou aparelho conectado |
| Android | Tela inicial / upload | Pendente | Sessão autenticada ou fixture local |
| Android | Lista de partituras | Pendente | Sessão autenticada e dados de demonstração |
| Android | Player com painel de faixas | Pendente | Partitura convertida com duas faixas |

## Procedimento de fechamento

Quando houver um simulador/emulador funcional, capturar cada tela em resolução
nativa, manter a imagem sem edição de conteúdo, registrar dimensões e revisar
legibilidade antes do envio ao App Store Connect e Google Play Console.
