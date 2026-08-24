# Google Play Submission

## Descricao Curta

Converta partituras em MusicXML, exporte MIDI e acompanhe a reproducao das notas.

## Descricao

Conversor de Partituras ajuda musicistas, professores e estudantes a transformar fotos, imagens ou PDFs de partituras em MusicXML. Acompanhe o processamento, visualize e ouca a partitura com destaque das notas e exporte MusicXML e MIDI para apps compativeis, como MuseScore e Arquivos.

MusicXML e recomendado para revisar e editar a notacao. MIDI representa principalmente a execucao e pode perder detalhes de diagramacao ao ser importado. Quando a partitura nao informa andamento, a reproducao e a exportacao MIDI usam 70 BPM como valor padrao.

A versao gratuita permite tres scans totais por conta. Depois disso, o desbloqueio pago libera novos envios na mesma conta.

O resultado de OMR pode exigir revisao. O app mostra status, confianca e alertas quando a conversao precisa ser conferida em um editor como MuseScore.

## Produto E Preco

- Produto: `premium_unlock`
- Tipo: compra unica nao consumivel
- Oferta: desbloqueio de novos envios depois dos tres scans gratuitos
- Preco planejado: R$ 29,90 ou ponto de preco equivalente no Google Play

## Checklist Do Play Console

- [ ] Registrar o pacote Android definitivo e conferir que ele corresponde a `android.package`.
- [ ] Ativar Play App Signing e guardar as credenciais de upload fora do repositorio.
- [ ] Criar o produto `premium_unlock` como compra unica.
- [ ] Vincular a conta de servico da Google Play Developer API e configurar a notificacao RTDN no Cloud Pub/Sub.
- [ ] Cadastrar testadores de licenca e publicar primeiro na faixa interna.
- [ ] Preencher classificacao etaria, contato, categoria e ficha da loja.
- [ ] Publicar uma politica de privacidade em URL publica e aponta-la na ficha e dentro do app.
- [ ] Preencher Data Safety com e-mail, arquivos enviados, identificadores de conta/transacao, diagnosticos e as praticas de seguranca reais.
- [ ] Fornecer conta demo e passos de login para revisao.

## Notas Para Revisao

O app cria conta e permite testar tres scans gratuitos totais por conta. Depois do terceiro scan, o quarto envio abre o paywall com a compra unica `premium_unlock` no Google Play.

Para revisar:

1. Entrar com a conta demo cadastrada no Play Console.
2. Enviar uma foto, imagem ou PDF de partitura.
3. Abrir a tela de detalhes, reproduzir a partitura e acompanhar o destaque das notas.
4. Exportar MusicXML e MIDI e conferir o seletor de compartilhamento Android.
5. Repetir ate atingir o limite de tres scans.
6. Validar compra de teste, compra pendente, restauracao e revogacao/reembolso quando aplicavel.

## Declaracao De Dados

- Dados de contato: e-mail.
- Conteudo do usuario: fotos/PDFs de partituras, MusicXML gerado e MIDI solicitado pelo usuario.
- Identificadores: identificadores internos de usuario e tokens/identificadores de compra da loja.
- Dados de uso: contagem de scans, status de conversao e auditoria.
- Diagnosticos/seguranca: IP, fase, resultado e duracao da operacao MIDI, tamanho do MIDI em caso de sucesso, codigo seguro do erro e logs de auditoria; o conteudo musical nao e incluido nos logs.

Revise esta lista contra a versao final e as declaracoes dos SDKs antes de enviar: a declaracao Data Safety precisa refletir o comportamento efetivo do app e das bibliotecas embarcadas.
