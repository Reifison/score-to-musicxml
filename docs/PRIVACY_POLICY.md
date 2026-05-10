# Politica De Privacidade

Ultima atualizacao: 2026-05-10

O Score to MusicXML converte partituras enviadas pelo usuario em arquivos MusicXML.

## Dados Coletados

- Conta: nome, e-mail e senha criptografada.
- Arquivos enviados: fotos, imagens ou PDFs de partituras.
- Arquivos gerados: MusicXML resultante da conversao.
- Uso do app: quantidade de scans gratuitos usados, status de conversao e logs de auditoria.
- Compras: identificadores de transacao da App Store, produto comprado e eventos de restauracao/revogacao.
- Dados tecnicos: endereco IP e metadados basicos de requisicoes para seguranca e auditoria.

## Como Usamos Os Dados

Usamos esses dados para autenticar usuarios, processar uploads, gerar MusicXML, aplicar o limite gratuito de 3 scans, liberar a versao paga, prevenir abuso, investigar falhas e atender solicitacoes de suporte.

## Arquivos Enviados

Imagens sao reencodadas no servidor para remover metadados sensiveis quando viavel, incluindo EXIF de localizacao. PDFs com conteudo ativo suspeito podem ser rejeitados. Arquivos maliciosos ou acima do limite permitido nao sao aceitos.

## Retencao E Exclusao

O usuario pode excluir uma partitura no app; isso remove o arquivo original e o MusicXML gerado. Tambem existe limpeza administrativa configuravel para remover partituras antigas e logs de auditoria antigos conforme `SCORE_RETENTION_DAYS` e `AUDIT_RETENTION_DAYS`.

## Compartilhamento

Nao vendemos dados pessoais. Compartilhamos dados somente com provedores necessarios para operar o app, como infraestrutura de hospedagem, banco de dados, fila de processamento e Apple para compras in-app.

## Seguranca

Usamos identificadores UUID, validacao de tipo real de arquivo, Prisma para acesso ao banco, cookies/tokens seguros, rate limit, auditoria e validacao server-side de compras Apple quando configurada.

## Contato

Para suporte, privacidade ou exclusao de dados, entre em contato pelo canal de suporte informado na App Store.
