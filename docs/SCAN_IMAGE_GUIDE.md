# Captura de partituras e qualidade da digitalização

Atualizado em 12/10/2026. O candidato iOS 1.0 (12) substitui a captura de foto por digitalização de documentos. Implementação e testes automáticos estão concluídos; a validação desse novo fluxo em aparelho continua separada abaixo.

## Como o iPhone digitaliza documentos

No Notas e no Arquivos, a Apple oferece captura automática da folha, ajuste manual dos cantos, filtros e inclusão de mais páginas. O recurso para incorporar essa experiência a um app é `VNDocumentCameraViewController`, do VisionKit. A Apple descreve o tratamento de recorte, perspectiva e iluminação feito pela câmera de documentos antes de entregar as imagens das páginas ao app.

O scanner captura documentos; o reconhecimento das notas e ritmos continua a cargo do OMR do servidor. Uma entrada mais limpa ajuda esse processamento, mas não comprova que toda partitura será reconhecida integralmente.

Fontes primárias: [digitalização no iPhone e iPad](https://support.apple.com/en-us/108963), [câmera de documentos no VisionKit](https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller), [explicação da Apple sobre perspectiva e iluminação](https://developer.apple.com/videos/play/wwdc2019/234/).

## Decisão implementada para iOS

O app usa um módulo Expo local em Swift que apresenta o scanner nativo em tela cheia. O fluxo é escolher o tipo da partitura, tocar **Escanear partitura**, permitir a câmera quando solicitado, capturar e ajustar as páginas na interface da Apple, concluir a digitalização, conferir todas as páginas no app e tocar **Enviar PDF**. Durante a abertura, o botão mostra **Abrindo scanner...**. Na tela Partituras, a conta precisa ter cota gratuita disponível ou o desbloqueio para iniciar o envio.

Todas as imagens devolvidas pelo scanner são incluídas em um único PDF, na ordem de captura. As páginas preservam sua proporção e orientação, sem recorte quadrado adicional. As prévias menores são usadas somente na conferência; não substituem as imagens incluídas no PDF. Um PDF corresponde a um envio, preservando a regra da cota.

Os limites atuais do servidor são 20 páginas e 10 MiB por arquivo. O app avisa quando o resultado excede esses limites, sem excluir páginas silenciosamente. Permissão negada, indisponibilidade do scanner, cancelamento e erro têm tratamento. O iOS não volta automaticamente à câmera de fotos quando o scanner está indisponível; oferece as alternativas existentes de imagem e PDF. O Android mantém seu fluxo de câmera.

O build 11 usava `expo-image-picker` com `allowsEditing`. No iOS, essa edição recorta em formato quadrado, independentemente do parâmetro `aspect`. É um risco de remover partes de uma página retangular. O `scan.jpg` parcial identificado pelo usuário em 13/10 contém a folha inteira de “SONATA Nº 1”; não há corte visível das oito linhas de pauta nesse caso. A foto tem inclinação, perspectiva e fundo externo, e o classificador local não reconheceu suas pautas. A execução real do servidor não foi inspecionada; não atribuir a ela uma causa única. [Diagnóstico](validation/scan-jpg-partial-2026-10-13/REPORT.md), [documentação do Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/).

## Cuidados na captura

Coloque a folha plana sobre fundo contrastante e mantenha iluminação uniforme, sem reflexos nem sombra sobre as notas. Confira se os cantos incluem toda a página, principalmente as pautas superiores e inferiores. Capture uma folha por página do scanner e revise a ordem antes de enviar. Se um filtro apagar pontos, acidentes ou linhas finas, escolha outro tratamento na interface nativa e confira a prévia.

PDF exportado de editor musical continua sendo uma boa fonte para comparar o reconhecimento. Fotografias borradas, folhas onduladas, anotações sobre as notas e compressão forte podem prejudicar o resultado mesmo com digitalização de documentos.

## Evidências e validação — Feita?

- [x] **Feita? Sim — Confirmar a captura anterior no iPad.** No build 11, o usuário confirmou abertura da câmera e foto na conferência.
- [x] **Feita? Sim — Exercitar o envio anterior no iPad.** O usuário informou “Enviado pelo ipad, conversao foi parcial”. Isso registra chegada a resultado, sem aprovar fidelidade musical ou cobertura completa.
- [x] **Feita? Sim — Implementar o scanner nativo e a conferência das páginas.** Módulo Swift local, integração Expo e telas Home/Partituras atualizados para o candidato 12.
- [x] **Feita? Sim — Verificar os fluxos automaticamente e revisar o código.** 129 testes mobile em 32 arquivos e TypeScript passaram. Revisão independente confirmou tratamento de limites, limpeza e conclusão após saída da tela. Esses testes não executam VisionKit real.
- [x] **Feita? Sim — Registrar abertura do scanner e conferência no iPhone.** Build 12, iPhone 13 Pro Max: o usuário respondeu sim à pergunta sobre scanner e duas prévias. iOS 27.0.1 conferido na instalação. O original do PDF recente encontrado tem uma página; um PDF com duas páginas ainda não foi comprovado.
- [x] **Feita? Sim — Enviar um PDF gerado pelo scanner no iPhone.** O usuário informou “Iphone 13 pro max - Processando”. Isso confirma o envio relatado, sem comprovar término ou cobertura.
- [x] **Feita? Sim — Reconciliar o arquivo referido como parcial.** Em 13/10, o usuário corrigiu a identificação por captura de tela: `scan.jpg`, 534,3 KB, “SONATA Nº 1”, é o parcial. O PDF recente de “Quem sabe?!” está “Convertido” na web; não atribuir a ele o relato corrigido de Parcial.
- [x] **Feita? Sim — Comparar fonte e saída do PDF recente.** “Quem sabe?!”, uma página, nove sistemas, saída com 52 compassos. Há perdas verificadas de armadura, pausas e fermata, além de pausa extra. [Evidência](../tmp/iphone-partial-2026-10-13/diagnosis.json). A página inteira visível não comprova fidelidade musical.
- [ ] **Feita? Não — Homologar a fidelidade das conversões.** As saídas da foto e do PDF têm defeitos verificados. Correções e um PDF com duas páginas continuam pendentes.
- [ ] **Feita? Não — Confirmar scanner de documentos e PDF no iPad.** Capturar duas páginas, conferir ambas e registrar envio/resultado.
- [ ] **Feita? Não — Conferir ajuste dos cantos e cancelamento/reabertura.** Esses comportamentos não foram detalhados no relato do teste.
- [x] **Feita? Sim — Comparar a conversão parcial com sua fonte.** `scan.jpg`: oito sistemas e 37 compassos visíveis; XML com oito grupos de sistema e 22 registros de compasso. Conteúdo e símbolos foram perdidos nas sete primeiras linhas, sem desaparecimento da última linha. Fonte e XML preservados; nenhuma nova conversão ou consumo de cota. [Diagnóstico](validation/scan-jpg-partial-2026-10-13/REPORT.md).
- [x] **Feita? Sim — Comparar a mesma SONATA enviada com o scanner novo.** Em 13/10, o usuário reenviou uma página no iPhone. A folha ficou mais frontal e chegou a Convertido; XML passou de 22 para 36 registros e retomou repetições/hairpins. Ainda há déficit de 4,5 tempos no início e armadura só no XML 4. Captura melhor não significa fidelidade aprovada. [Comparação](validation/sonata-native-2026-10-13/REPORT.md).

O estado de archive, instalação e reenvio está no [registro da preparação Apple](APP_STORE_RESUBMISSION_2026-10-12.md).
