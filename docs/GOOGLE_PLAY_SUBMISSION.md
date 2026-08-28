# Google Play Submission

## Descricao Curta

Converta partituras em MusicXML, exporte MIDI e acompanhe a reproducao das notas.

## Descricao

Conversor de Partituras ajuda musicistas, professores e estudantes a transformar fotos, imagens ou PDFs de partituras em MusicXML. Acompanhe o processamento, visualize e ouca a partitura com destaque das notas e exporte MusicXML e MIDI para apps compativeis, como MuseScore e Arquivos.

MusicXML e recomendado para revisar e editar a notacao. MIDI representa principalmente a execucao e pode perder detalhes de diagramacao ao ser importado. Quando a partitura nao informa andamento, a reproducao e a exportacao MIDI usam 70 BPM como valor padrao.

A versao gratuita permite duas conversoes totais por conta. Depois disso, o desbloqueio pago libera conversoes ilimitadas na mesma conta.

O resultado de OMR pode exigir revisao. O app mostra status, confianca e alertas quando a conversao precisa ser conferida em um editor como MuseScore.

## Produto E Preco

- Produto: `premium_unlock`
- Tipo: compra unica nao consumivel
- Oferta: desbloqueio permanente de conversoes depois das duas conversoes gratuitas
- Preco planejado no Brasil: R$ 23,90; usar a conversao/localizacao de preco administrada pelo Google Play nos demais mercados
- Cobranca: exclusivamente pelo Google Play Billing para este recurso digital vendido dentro do app

## Checklist Do Play Console

- [ ] Registrar o pacote Android definitivo e conferir que ele corresponde a `android.package`.
- [ ] Ativar Play App Signing e guardar as credenciais de upload fora do repositorio.
- [ ] Criar o produto `premium_unlock` como compra unica.
- [ ] Definir `premium_unlock` como produto nao consumivel (compra unica), com preco de R$ 23,90 no Brasil e precos localizados revisados para os demais paises.
- [ ] Integrar a versao atual da Google Play Billing Library e abrir o fluxo de compra apenas pelo BillingClient/Google Play.
- [ ] No app, reconhecer a compra e enviar o `purchaseToken` ao backend; nao liberar Premium apenas pelo retorno local do dispositivo.
- [ ] No backend, validar cada token com a Google Play Developer API, registrar somente o minimo necessario e conceder a permissao Premium vinculada a conta.
- [ ] Confirmar (acknowledge) a compra validada em ate tres dias para evitar cancelamento/reembolso automatico; nunca consumir `premium_unlock`.
- [ ] Vincular a conta de servico da Google Play Developer API e configurar a notificacao RTDN no Cloud Pub/Sub.
- [ ] Processar RTDN de compra, cancelamento/revogacao e reembolso, consultar a API para confirmar o estado e atualizar a permissao da conta de forma idempotente.
- [ ] Cadastrar testadores de licenca e publicar primeiro na faixa interna.
- [ ] Preencher classificacao etaria, contato, categoria e ficha da loja.
- [ ] Publicar uma politica de privacidade em URL publica e aponta-la na ficha e dentro do app.
- [ ] Preencher Data Safety com e-mail, arquivos enviados, identificadores de conta/transacao, diagnosticos e as praticas de seguranca reais.
- [ ] Fornecer conta demo e passos de login para revisao.

## Notas Para Revisao

O app cria conta e permite testar duas conversoes gratuitas totais por conta. Depois da segunda conversao, a proxima tentativa de envio abre o paywall com a compra unica nao consumivel `premium_unlock` no Google Play. A compra desbloqueia conversoes ilimitadas para a mesma conta e pode ser restaurada em outro aparelho ao entrar nessa conta.

Para revisar:

1. Entrar com a conta demo cadastrada no Play Console.
2. Enviar uma foto, imagem ou PDF de partitura.
3. Abrir a tela de detalhes, reproduzir a partitura e acompanhar o destaque das notas.
4. Exportar MusicXML e MIDI e conferir o seletor de compartilhamento Android.
5. Repetir ate atingir o limite de duas conversoes.
6. Na terceira tentativa, conferir que o paywall explica o desbloqueio permanente, mostra o preco de R$ 23,90 no Brasil e oferece Restaurar compras.
7. Validar compra de teste, compra pendente, restauracao e revogacao/reembolso quando aplicavel.

## Requisitos De Cobranca E Experiencia

- O limite gratuito e contado no servidor por conta autenticada, inclusive apos reinstalacao ou troca de aparelho. Cada arquivo aceito para processamento consome uma conversao gratuita, mesmo que a conversao posterior falhe.
- Antes de abrir a compra, o paywall informa de forma clara: "Suas 2 conversoes gratis foram usadas", "Desbloqueie conversoes ilimitadas" e "Pagamento unico, sem assinatura". A tela tambem apresenta Restaurar compras.
- O botao de compra deve iniciar o dialogo nativo do Google Play; nao exibir formulario proprio de cartao, PIX ou link externo para adquirir o mesmo recurso digital no Android distribuido pelo Play.
- O estado Premium vem do servidor apos a validacao do token. O app deve sincroniza-lo ao iniciar, apos compra/restauracao e quando receber mudanca de conta.
- Reembolsos, revogacoes e cancelamentos recebidos por RTDN retiram o desbloqueio de forma segura, preservando os arquivos existentes do usuario conforme a politica de dados.

Referencias oficiais para a implementacao e revisao final: [Google Play Billing](https://developer.android.com/google/play/billing), [produtos de compra unica](https://developer.android.com/google/play/billing/one-time-products), [processamento de compras](https://developer.android.com/google/play/billing/integrate) e [Real-time Developer Notifications](https://developer.android.com/google/play/billing/rtdn-reference).

## Declaracao De Dados

- Dados de contato: e-mail.
- Conteudo do usuario: fotos/PDFs de partituras, MusicXML gerado e MIDI solicitado pelo usuario.
- Identificadores: identificadores internos de usuario e tokens/identificadores de compra da loja.
- Dados de uso: contagem de scans, status de conversao e auditoria.
- Diagnosticos/seguranca: IP, fase, resultado e duracao da operacao MIDI, tamanho do MIDI em caso de sucesso, codigo seguro do erro e logs de auditoria; o conteudo musical nao e incluido nos logs.

Revise esta lista contra a versao final e as declaracoes dos SDKs antes de enviar: a declaracao Data Safety precisa refletir o comportamento efetivo do app e das bibliotecas embarcadas.
