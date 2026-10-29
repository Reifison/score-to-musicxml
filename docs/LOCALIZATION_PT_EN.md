# Localização do aplicativo: português e inglês

Atualização em desenvolvimento em 16/10/2026. Escopo: aplicativo Expo/React Native e reprodutor web incorporado. A aplicação web independente e a publicação de metadados na App Store têm entregas próprias; não foram publicadas por esta alteração.

## Política de idioma

1. Escolha manual em Configurações → Idioma: Português (Brasil) ou English. Tem prioridade sobre os sinais automáticos e fica salva neste aparelho, inclusive após logout.
2. Sem escolha manual, reutilizar o idioma inicial já salvo.
3. Na migração, preservar português quando houver evidência de instalação anterior (sessão ou leitura salva).
4. Nova instalação com loja brasileira (`BR`/`BRA`): português. Outra loja conhecida, inclusive Estados Unidos e Canadá: inglês, mesmo com aparelho em português.
5. Loja indisponível: idioma preferido do aparelho em português → português; demais idiomas → inglês.

O sinal é a loja **atual** obtida por `expo-iap`/StoreKit, não o histórico de país de download. A detecção tem limite de tempo e a interface não aguarda indefinidamente por uma resposta da loja. Trocar o país da conta depois da primeira escolha automática não muda o idioma salvo; a pessoa pode escolher manualmente.

Não havia marcador de instalação nas versões anteriores. Uma instalação antiga sem sessão nem leitura salva pode ser indistinguível de instalação nova e seguir a regra automática. Reinstalação também pode preservar dados no Keychain do iOS. Esses casos precisam de validação em atualização real/TestFlight.

Permissões e componentes de sistema seguem o mecanismo de localização do iOS e seus idiomas declarados; o idioma manual controla a interface do aplicativo e o reprodutor. Não há alteração do país da conta Apple, preços, compras ou assinaturas.

## Tradução e preservação dos dados

- `apps/mobile/src/i18n`: preferência persistida, resolução inicial, catálogo, provider e hook de atualização.
- Telas e componentes usam pares explícitos português/inglês e parâmetros de interpolação; números e datas acompanham o idioma selecionado.
- `src/score/*Presentation.ts` e `sourceVisualReview.ts`: apresentação de cobertura, revisão e valores musicais.
- `src/score/localizedMessages.ts`: mensagens conhecidas do servidor traduzidas sem alterar códigos. Diagnósticos futuros desconhecidos recebem uma orientação cautelosa em inglês com o código disponível, sem afirmar que a verificação passou.
- O reprodutor recebe o idioma pela bridge, sem usar o idioma como identidade do documento; a troca não deve recarregar a música nem perder a posição.
- Nomes de arquivos, títulos, nomes próprios, conteúdo original da partitura, códigos, XML e eventos MIDI não são traduzidos ou reescritos.

## Referências e glossário musical

Inglês americano consistente na interface. Não se trata de tradução certificada: as equivalências foram conferidas em documentação oficial/institucional.

- [ABRSM: tabela de terminologia britânica/americana](https://www.abrsm.org/sites/default/files/2023-09/abrsm-ot-reference-sheet-example-questions_online-music-theory-from-2020.pdf): breve/double whole note, semibreve/whole note, minim/half note, crotchet/quarter note, quaver/eighth note e variantes.
- [Manual MuseScore em português: armaduras de clave](https://handbook.musescore.org/pt_br/notation/pitch/key-signatures) e [versão inglesa: key signatures](https://handbook.musescore.org/notation/pitch/key-signatures).
- [MusicXML: notas A–G](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/step/), [valores de nota](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/type/) e [claves](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/clef/).
- [Apple: seleção de idioma](https://developer.apple.com/library/archive/qa/qa1828/_index.html), [localização](https://developer.apple.com/localization/) e [Storefront atual](https://developer.apple.com/documentation/storekit/storefront/current).

| Português | Inglês usado | Observação |
|---|---|---|
| Partitura | Score / Sheet music | Conforme o contexto da interface |
| Pauta | Staff; plural staves | Diferente de parte instrumental |
| Parte instrumental | Part / Instrumental part | Diferente de voz |
| Voz musical | Voice | Linha musical dentro da parte |
| Compasso | Measure | Inglês americano; bar é variante britânica |
| Fórmula de compasso | Time signature | Não confundir com compasso isolado |
| Armadura de clave | Key signature | Não confundir com clave |
| Clave de sol usual | Treble clef | A posição da clave continua no XML |
| Clave de fá usual | Bass clef | A posição da clave continua no XML |
| Andamento | Tempo | BPM é preservado |
| Pausa musical | Rest | Botão de reprodução usa Pause |
| Semibreve | Whole note | Britânico: semibreve |
| Mínima | Half note | Britânico: minim |
| Semínima | Quarter note | Britânico: crotchet |
| Colcheia | Eighth note | Britânico: quaver |
| Semicolcheia | Sixteenth note | Britânico: semiquaver |
| Fusa | Thirty-second note | Britânico: demisemiquaver |
| Semifusa | Sixty-fourth note | |
| Ligadura de prolongamento | Tie | Não confundir com slur |
| Ligadura de expressão | Slur | Não confundir com tie |
| Violão solo | Solo guitar | |
| Duo de violões | Guitar duet | Duas partes instrumentais |
| Dó Ré Mi Fá Sol Lá Si | C D E F G A B | Exibição; MusicXML mantém A–G em ambos os idiomas |

## Roadmap e validação

- [x] Levantar arquitetura e referências oficiais.
- [x] Traduzir componentes compartilhados e apresentação musical.
- [x] Traduzir mensagens conhecidas de erro e manter códigos para suporte.
- [x] Integrar e validar preferência, telas e reprodutor por testes automatizados.
- [x] Validar checagem de tipos, build web, exportação do bundle iOS e testes automatizados finais.
- [ ] Conferir visualmente os dois idiomas em iPhone/iPad.
- [ ] Testar loja BR, EUA e Canadá no sandbox Apple/TestFlight.
- [ ] Testar atualização de instalação antiga e reinstalação no aparelho.
- [x] Atualizar o reprodutor hospedado com esta versão antes de distribuir o app.
- [ ] Preparar/publicar capturas e metadados localizados no App Store Connect.


## Evidência de validação

Em 16/10/2026:

- Aplicativo: 48 arquivos de teste, 202 testes aprovados; checagem TypeScript aprovada.
- Web/reprodutor: suíte completa com 152 testes aprovados e build de produção aprovado. O build mantém os avisos existentes de tamanho do chunk e externalização de `node:module`.
- Exportação de produção do JavaScript iOS via Expo aprovada, em `tmp/localization-ios` (reutilizado entre validações). Isso não equivale a um archive assinado ou upload ao TestFlight.
- `plutil` aprovou o Info.plist e os dois InfoPlist.strings; teste do prebuild verifica geração e execução repetida sem duplicar recursos Xcode.
- Revisão de textos JSX/acessibilidade sem rótulos fixos remanescentes além de formatos e nomes dos idiomas.
- Testes verificam resolução BR/BRA, EUA/Canadá, fallback, preferência manual, gravação, troca imediata, avisos de falha ao salvar, termos musicais, mensagens de servidor, bridge e preservação da rolagem ao trocar idioma.

A validação visual no aparelho e os cenários reais da conta Apple continuam pendentes na lista acima. Naquela etapa, a build nativa completa de distribuição ainda não havia sido gerada nem publicada.

## Notas propostas para a atualização

Português: Agora você pode usar o aplicativo em português ou inglês. Escolha o idioma em Configurações. A atualização também inclui nomes musicais, avisos de conversão e controles do reprodutor nos dois idiomas.

English: You can now use the app in English or Portuguese. Choose your language in Settings. Musical terminology, conversion notices and playback controls are available in both languages.

## Distribuição em 17/10/2026

- [x] **Feita? Sim — Publicar e verificar o player PT/EN em produção.**
- [x] **Feita? Sim — Gerar, assinar e enviar a versão 1.0 (14).** Disponível no TestFlight interno, com declaração de criptografia autorizada.
- [ ] **Feita? Não — Homologar em aparelhos físicos e lojas BR/EUA/Canadá.**

[Evidências e instruções de teste](validation/testflight-build14-2026-10-17/REPORT.md).
