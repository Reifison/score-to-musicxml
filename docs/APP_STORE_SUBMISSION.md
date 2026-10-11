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

O app permite testar 3 conversoes gratuitas totais por conta. A quarta tentativa de envio abre o paywall com a compra dentro do app nao consumivel `premium_unlock`.

Para revisar:

1. Entrar com a conta demo informada no App Store Connect.
2. Enviar uma foto, imagem ou PDF de partitura.
3. Abrir a tela de detalhes para ver status, cobertura e alertas. Em resultado completo, reproduzir a partitura e acompanhar o destaque das notas; em parcial, conferir as páginas ausentes e a exportação MusicXML com aviso.
4. Exportar MusicXML e MIDI e conferir a folha nativa de compartilhamento.
5. Repetir ate atingir o limite de 3 conversoes gratuitas; a quarta tentativa abre o paywall.
6. Validar o paywall, compra sandbox e restauracao de compra.

O app usa camera para escanear partituras, biblioteca de fotos para selecionar imagens e seletor de arquivos para PDFs. Os arquivos enviados sao usados para conversao, exportacao e reproducao e podem ser excluidos pelo usuario. O MIDI e gerado sob demanda e o MusicXML usado pelo player passa por cache temporario no aparelho.

## Checklist App Privacy

- Dados de contato: e-mail.
- Conteudo do usuario: fotos/PDFs de partituras, MusicXML gerado e MIDI solicitado pelo usuario.
- Identificadores: identificadores internos de usuario e transacoes Apple.
- Dados de uso: contagem de scans, status de conversao e auditoria.
- Diagnosticos/seguranca: IP, fase, resultado e duracao da operacao MIDI, tamanho do MIDI em caso de sucesso, codigo seguro do erro e logs de auditoria; o conteudo musical nao e incluido nos logs.

## Suporte

Usar o texto de [SUPPORT.md](SUPPORT.md) como base para URL ou pagina publica de suporte.

Contato: [reifison@hotmail.com](mailto:reifison@hotmail.com). Consulta de 2026-10-06 confirmou suporte `https://converter.nossateoria.com.br/suporte` e privacidade `https://converter.nossateoria.com.br/privacidade` cadastrados. As páginas locais foram preparadas para acesso sem login; publicação e conteúdo no servidor continuam pendentes.

Estado consultado: versão 1.0 `REJECTED`, build 6 `VALID` e IAP `premium_unlock` `READY_TO_SUBMIT`. [Evidência datada](app-store/status-2026-10-06.json). O build 7 é candidato local; não foi enviado. O registro de setembro permanece histórico. Verificar o motivo atual da rejeição, a conta de revisão, os acordos e o IAP antes de nova submissão.

O player requer internet para carregar a superfície HTTPS e seus recursos. Homologar compras/restauração em sandbox e inspecionar o IPA final antes de enviar.
