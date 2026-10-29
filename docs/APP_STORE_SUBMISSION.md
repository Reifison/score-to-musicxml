# App Store Submission

## Descricao Curta

Converta partituras em MusicXML, exporte MIDI e acompanhe a reproducao das notas.

## Descricao

Conversor de Partituras ajuda musicistas, professores e estudantes a transformar fotos, imagens ou PDFs de partituras em MusicXML. Acompanhe o processamento, visualize e ouca a partitura com destaque das notas e exporte MusicXML ou MIDI para apps compativeis, como MuseScore e Arquivos.

MusicXML e recomendado para revisar e editar a notacao. MIDI representa principalmente a execucao e pode perder detalhes de diagramacao ao ser importado. Quando a partitura nao informa andamento, a reproducao e a exportacao MIDI usam 70 BPM como valor padrao.

A versao gratuita permite 3 conversoes totais por conta. Depois disso, a compra unica libera conversoes ilimitadas na mesma conta.

O resultado de OMR exige revisão. O app mostra status, cobertura das páginas e alertas. Resultados parciais permitem MusicXML com aviso; player e MIDI são liberados somente para cobertura completa. Compare o resultado com o original em um editor como MuseScore.

## Palavras-Chave

partitura, musicxml, MIDI, OMR, musica, MuseScore, PDF, scanner, player

## Preco E Compra

- Produto: `premium_unlock`
- Tipo: In-App Purchase nao consumivel
- Oferta: desbloqueio pago para novos envios apos as 3 conversoes gratuitas
- Preço planejado: R$ 29,90 ou ponto de preço equivalente no App Store Connect. O aplicativo exibe o preço localizado retornado pela loja e não permite comprar antes de carregar o produto.

## Notas Para Revisao Da Apple

O app permite testar 3 conversoes gratuitas totais por conta. A compra nao consumivel `premium_unlock`, “Conversões ilimitadas”, pode ser aberta diretamente em **Ajustes → Conversões ilimitadas**, sem consumir a cota gratuita. A quarta tentativa de envio continua abrindo a oferta automaticamente.

Para revisar:

1. Entrar com a conta demo informada no App Store Connect.
2. Abrir Ajustes → Conversões ilimitadas para localizar a compra. A conta de revisão conferida em 12/10 já usou os três envios gratuitos: testar a compra sandbox primeiro para liberar novos envios, ou usar uma conta gratuita com cota para testar a câmera.
3. No candidato 12, escolher o tipo da partitura e tocar “Escanear partitura”. Permitir a câmera e digitalizar as folhas no scanner nativo da Apple. Ajustar os cantos se necessário, concluir a digitalização, conferir todas as páginas no app e tocar “Enviar PDF”. Imagem e PDF também podem ser escolhidos pelos seletores existentes.
4. Abrir a tela de detalhes para ver status, cobertura e alertas. Em resultado completo, reproduzir a partitura e acompanhar o destaque das notas; em parcial, conferir as páginas ausentes e a exportação MusicXML com aviso.
5. Exportar MusicXML e MIDI e conferir a folha nativa de compartilhamento.
6. Validar a oferta, preço da App Store, compra sandbox e “Restaurar compra”. Uma conta já paga mostra o plano ativo e não oferece uma nova compra.

O app usa camera para escanear partituras, biblioteca de fotos para selecionar imagens e seletor de arquivos para PDFs. Os arquivos enviados sao usados para conversao, exportacao e reproducao e podem ser excluidos pelo usuario. O MIDI e gerado sob demanda e o MusicXML usado pelo player passa por cache temporario no aparelho.

## Checklist App Privacy

- Dados de contato: e-mail.
- Conteudo do usuario: fotos/PDFs de partituras, MusicXML gerado e MIDI solicitado pelo usuario.
- Identificadores: identificadores internos de usuario e transacoes Apple.
- Dados de uso: contagem de scans, status de conversao e auditoria.
- Diagnosticos/seguranca: IP, fase, resultado e duracao da operacao MIDI, tamanho do MIDI em caso de sucesso, codigo seguro do erro e logs de auditoria; o conteudo musical nao e incluido nos logs.

## Suporte

Usar o texto de [SUPPORT.md](SUPPORT.md) como base para URL ou pagina publica de suporte.

Contato: [reifison@hotmail.com](mailto:reifison@hotmail.com). Suporte `https://converter.nossateoria.com.br/suporte` e privacidade `https://converter.nossateoria.com.br/privacidade` cadastrados. Em 2026-10-12, ambas renderizaram conteúdo público e contato sem login no navegador.

Estado Apple consultado em 2026-10-12: versão 1.0 `REJECTED`, último build enviado 6 `VALID`, IAP `premium_unlock` `READY_TO_SUBMIT`. O item está incluído no envio existente, “Pronto para revisão”. Após a mudança solicitada para scanner de documentos, o candidato atual é **1.0 (12)**: IPA assinado/conferido e cópia Release instalada no iPad e iPhone. No iPhone 13 Pro Max, o usuário confirmou abertura/conferência e envio do PDF. Em 13/10 corrigiu a identificação do parcial para a foto anterior `scan.jpg`, “SONATA Nº 1”. O PDF recente “Quem sabe?!” está “Convertido” na web e contém uma página. Ambas as saídas têm defeitos musicais confirmados, registrados separadamente. No iPad, teste do scanner nativo ainda não confirmado. Nenhum desses builds foi enviado à Apple. A conta de revisão passou no login e na vinculação de compras; o acordo de apps pagos está “Novo”. Ver [preparação e pendências atuais](APP_STORE_RESUBMISSION_2026-10-12.md). O registro de setembro permanece histórico.

O player requer internet para carregar a superfície HTTPS e seus recursos. Em 12/10/2026, o usuário confirmou que a câmera do build 11 abriu no iPad, mostrou a foto para conferência e que o envio retornou uma conversão parcial. Em 13/10, identificou esse parcial como `scan.jpg`; a fonte “SONATA Nº 1” tem 37 compassos e a saída tem 22 registros, com perdas de conteúdo e símbolos. O build 12 teve captura/envio do PDF exercitados no iPhone; seu PDF de uma página aparece “Convertido”, embora tenha defeitos musicais próprios. Correções/fidelidade, PDF com duas páginas, scanner/PDF no iPad e compras/restauração reais continuam abertos antes do reenvio. [Avaliação da captura](SCAN_IMAGE_GUIDE.md), [diagnóstico da foto](validation/scan-jpg-partial-2026-10-13/REPORT.md).

No reenvio da mesma primeira página da SONATA pelo iPhone em 13/10, o scanner nativo produziu um PDF de uma página que chegou a Convertido. A cobertura do XML melhorou de 22 para 36 registros e retomou repetições/hairpins, mas persistem perdas rítmicas no início e armadura tardia. [Comparação do novo teste](validation/sonata-native-2026-10-13/REPORT.md). Não aprova fidelidade musical nem encerra os testes de duas páginas/iPad/compras.
