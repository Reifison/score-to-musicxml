# Politica De Privacidade

Ultima atualizacao: 2026-07-28

O Conversor de Partituras converte partituras enviadas pelo usuario em MusicXML, permite gerar MIDI e oferece reproducao visual da partitura.

## Dados Coletados

- Conta: nome, e-mail e senha criptografada.
- Arquivos enviados: fotos, imagens ou PDFs de partituras.
- Arquivos gerados: MusicXML resultante da conversao e MIDI gerado sob demanda quando o usuario solicita a exportacao.
- Uso do app: quantidade de scans gratuitos usados, status de conversao e logs de auditoria.
- Diagnostico da exportacao MIDI: fase de geracao ou download, sucesso ou falha, duracao da operacao, tamanho do arquivo em caso de sucesso e codigo seguro do erro em caso de falha, sem registrar o conteudo da partitura, o arquivo MIDI em base64 ou credenciais.
- Compras: identificadores de transacao da App Store, produto comprado e eventos de restauracao/revogacao.
- Dados tecnicos: endereco IP e metadados basicos de requisicoes para seguranca e auditoria.

## Como Usamos Os Dados

Usamos esses dados para autenticar usuarios, processar uploads, gerar MusicXML e MIDI, exibir e reproduzir a partitura, aplicar o limite gratuito de 3 scans, liberar a versao paga, prevenir abuso, investigar falhas e atender solicitacoes de suporte.

## Arquivos Enviados

Imagens sao reencodadas no servidor para remover metadados sensiveis quando viavel, incluindo EXIF de localizacao. PDFs com conteudo ativo suspeito podem ser rejeitados. Arquivos maliciosos ou acima do limite permitido nao sao aceitos.

## Retencao E Exclusao

O usuario pode excluir uma partitura no app; isso remove o arquivo original e o MusicXML gerado. Tambem existe limpeza administrativa configuravel para remover partituras antigas e logs de auditoria antigos conforme `SCORE_RETENTION_DAYS` e `AUDIT_RETENTION_DAYS`.

O MIDI e gerado em memoria pelo servidor a partir do MusicXML quando solicitado e nao e salvo como um novo arquivo permanente no armazenamento do servidor. Para o player no iOS, o MusicXML e baixado para uma area temporaria do app, lido e removido em seguida; se uma limpeza imediata falhar, o cache fica sujeito a sobrescrita e limpeza pelo app ou pelo sistema operacional. No navegador, os dados usados pelo player ficam na memoria da pagina durante a sessao.

Um MIDI exportado pode permanecer no cache local do app ate ser substituido ou removido pelo sistema. Copias salvas em Arquivos, MuseScore ou outro app por escolha do usuario passam a seguir as regras de retencao e exclusao desse destino.

## Compartilhamento

Nao vendemos dados pessoais. Compartilhamos dados somente com provedores necessarios para operar o app, como infraestrutura de hospedagem, banco de dados, fila de processamento e Apple para compras in-app. Quando o usuario exporta um arquivo para MuseScore, Arquivos ou outro app, o envio ocorre por acao explicita do usuario e o tratamento posterior e responsabilidade do destino escolhido.

## Seguranca

Usamos identificadores UUID, validacao de tipo real de arquivo, Prisma para acesso ao banco, cookies/tokens seguros, rate limit, auditoria e validacao server-side de compras Apple quando configurada.

## Contato

Para suporte, privacidade ou exclusao de dados, entre em contato pelo canal de suporte informado na App Store.
