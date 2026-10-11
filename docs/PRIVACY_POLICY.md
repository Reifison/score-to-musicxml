# Politica De Privacidade

Última atualização do documento local: 2026-10-06. A publicação em URL pública e as declarações finais das lojas ainda precisam ser conferidas.

O Conversor de Partituras converte partituras enviadas pelo usuario em MusicXML, permite gerar MIDI e oferece reproducao visual da partitura.

## Dados Coletados

- Conta: nome, e-mail e senha protegida por hash.
- Arquivos enviados: fotos, imagens ou PDFs de partituras.
- Arquivos gerados: MusicXML resultante da conversao e MIDI gerado sob demanda quando o usuario solicita a exportacao.
- Uso do app: quantidade de scans gratuitos usados, status de conversao e logs de auditoria.
- Diagnostico da exportacao MIDI: fase de geracao ou download, sucesso ou falha, duracao da operacao, tamanho do arquivo em caso de sucesso e codigo seguro do erro em caso de falha, sem registrar o conteudo da partitura, o arquivo MIDI em base64 ou credenciais.
- Compras: identificadores de transação da App Store ou tokens de compra do Google Play, produto comprado e eventos de restauração/revogação.
- Dados tecnicos: endereco IP e metadados basicos de requisicoes para seguranca e auditoria.

## Como Usamos Os Dados

Usamos esses dados para autenticar usuarios, processar uploads, gerar MusicXML e MIDI, exibir e reproduzir a partitura, aplicar o limite gratuito de 3 scans, liberar a versao paga, prevenir abuso, investigar falhas e atender solicitacoes de suporte.

## Arquivos Enviados

Imagens sao reencodadas no servidor para remover metadados sensiveis quando viavel, incluindo EXIF de localizacao. PDFs com conteudo ativo suspeito podem ser rejeitados. Arquivos maliciosos ou acima do limite permitido nao sao aceitos.

## Retencao E Exclusao

O usuário pode mover uma partitura para a lixeira e restaurá-la durante sete dias. Após esse prazo, a limpeza remove o arquivo original, os MusicXML das tentativas e o registro da partitura. Também existe limpeza administrativa configurável para remover partituras antigas e logs de auditoria antigos conforme `SCORE_RETENTION_DAYS` e `AUDIT_RETENTION_DAYS`.

O MIDI é gerado em memória pelo servidor a partir do MusicXML quando solicitado e não é salvo como um novo arquivo permanente no armazenamento do servidor. No aplicativo, o player mantém uma cópia local do MusicXML associada à conta e à revisão do resultado. Sua reutilização expira após sete dias sem abertura; a verificação e remoção ocorrem ao acessar o cache. A cópia pode permanecer no armazenamento do aplicativo até sua limpeza ou remoção do app. Esse cache não garante abertura do player sem internet. No navegador, os dados usados pelo player ficam na memória da página durante a sessão.

Um MIDI exportado pode permanecer no cache local do app ate ser substituido ou removido pelo sistema. Copias salvas em Arquivos, MuseScore ou outro app por escolha do usuario passam a seguir as regras de retencao e exclusao desse destino.

## Compartilhamento

Não vendemos dados pessoais. Compartilhamos dados somente com provedores necessários para operar o app, como infraestrutura de hospedagem, banco de dados, fila de processamento, Apple e Google para compras in-app. Quando o usuário exporta um arquivo para MuseScore, Arquivos ou outro app, o envio ocorre por ação explícita do usuário e o tratamento posterior é responsabilidade do destino escolhido.

## Seguranca

Usamos identificadores UUID, validacao de tipo real de arquivo, Prisma para acesso ao banco, cookies/tokens seguros, rate limit, auditoria e validacao server-side de compras Apple quando configurada.

## Contato

Para suporte, privacidade ou exclusão de dados, escreva para [reifison@hotmail.com](mailto:reifison@hotmail.com).
