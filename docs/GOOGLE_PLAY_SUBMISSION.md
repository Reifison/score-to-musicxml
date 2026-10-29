# Google Play Submission

## Descricao Curta

Converta partituras em MusicXML, exporte MIDI e acompanhe a reproducao das notas.

## Descricao

Conversor de Partituras ajuda musicistas, professores e estudantes a transformar fotos, imagens ou PDFs de partituras em MusicXML. Acompanhe o processamento, visualize e ouca a partitura com destaque das notas e exporte MusicXML e MIDI para apps compativeis, como MuseScore e Arquivos.

MusicXML e recomendado para revisar e editar a notacao. MIDI representa principalmente a execucao e pode perder detalhes de diagramacao ao ser importado. Quando a partitura nao informa andamento, a reproducao e a exportacao MIDI usam 70 BPM como valor padrao.

A versao gratuita permite tres scans totais por conta. Depois disso, o desbloqueio pago libera novos envios na mesma conta.

O resultado de OMR exige revisão. O app mostra status, cobertura das páginas e alertas. Resultados parciais permitem MusicXML com aviso; player e MIDI são liberados somente para cobertura completa. Compare o resultado com o original em um editor como MuseScore.

## Produto E Preco

- Produto: `premium_unlock`
- Tipo: compra unica nao consumivel
- Oferta: desbloqueio de novos envios depois dos tres scans gratuitos
- Preço planejado: R$ 29,90 ou ponto de preço equivalente no Google Play. O aplicativo exibe o preço localizado da loja e só permite comprar depois de carregar o produto.

## Checklist Do Play Console

Contato definitivo: [reifison@hotmail.com](mailto:reifison@hotmail.com). A publicação das páginas de suporte/privacidade e o estado atual da loja ainda precisam de evidência. O player requer internet; arquivos exportados podem ser usados em aplicativos que ofereçam acesso offline.

- [ ] Registrar o pacote Android definitivo e conferir que ele corresponde a `android.package`.
- [ ] Ativar Play App Signing e guardar as credenciais de upload fora do repositorio.
- [ ] Criar o produto `premium_unlock` como compra unica.
- [ ] Vincular a conta de servico da Google Play Developer API e configurar a notificacao RTDN no Cloud Pub/Sub.
- [ ] Cadastrar testadores de licenca e publicar primeiro na faixa interna.
- [ ] Preencher classificacao etaria, contato, categoria e ficha da loja.
- [ ] Publicar uma politica de privacidade em URL publica e aponta-la na ficha e dentro do app.
- [ ] Preencher Data Safety com e-mail, arquivos enviados, identificadores de conta/transacao, diagnosticos e as praticas de seguranca reais.
- [ ] Configurar `PLAY_REVIEWER_EMAIL` e `PLAY_REVIEWER_PASSWORD` no ambiente de producao e executar o seed/deploy para provisionar a conta de revisao com acesso ilimitado.
- [ ] Copiar as credenciais ativas e os passos abaixo para **Detalhes de login** no Play Console.

## Notas Para Revisao

A conta de revisao cadastrada no Play Console recebe acesso ilimitado por uma concessao administrativa, sem precisar realizar uma compra. Ela e criada ou atualizada pelo seed de producao a partir de `PLAY_REVIEWER_EMAIL` e `PLAY_REVIEWER_PASSWORD`.

Para revisar:

1. Abrir o app e entrar com o e-mail e a senha informados em **Detalhes de login** do Play Console.
2. Enviar uma foto, imagem ou PDF de partitura.
3. Abrir a tela de detalhes, reproduzir a partitura e acompanhar o destaque das notas.
4. Exportar MusicXML e MIDI e conferir o seletor de compartilhamento Android.
5. Repetir os envios livremente: a conta de revisao tem acesso liberado e nao precisa concluir a compra.
6. Para avaliar a compra, entre com outra conta e use os tres envios gratuitos; o quarto envio abre o paywall com a compra unica `premium_unlock` no Google Play.

## Declaracao De Dados

- Dados de contato: e-mail.
- Conteudo do usuario: fotos/PDFs de partituras, MusicXML gerado e MIDI solicitado pelo usuario.
- Identificadores: identificadores internos de usuario e tokens/identificadores de compra da loja.
- Dados de uso: contagem de scans, status de conversao e auditoria.
- Diagnosticos/seguranca: IP, fase, resultado e duracao da operacao MIDI, tamanho do MIDI em caso de sucesso, codigo seguro do erro e logs de auditoria; o conteudo musical nao e incluido nos logs.

Revise esta lista contra a versao final e as declaracoes dos SDKs antes de enviar: a declaracao Data Safety precisa refletir o comportamento efetivo do app e das bibliotecas embarcadas.
