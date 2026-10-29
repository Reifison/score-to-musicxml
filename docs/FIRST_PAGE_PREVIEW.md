# Prévia antecipada da primeira página

Implementação local solicitada em 16/10/2026. Requer a migration aditiva `20261017010000_first_page_preview`, posterior à migration de progresso por página, antes da atualização da API e do worker.

As duas migrations foram aplicadas e verificadas no PostgreSQL isolado e no banco publicado na continuação de 16/10. O backup do banco publicado foi restaurado antes da aplicação, e os registros foram preservados. A publicação do código dos novos recursos continua separada. [Comprovantes](validation/postgres-migration-2026-10-17/PRODUCTION.md).

## Comportamento

Quando a página 1 de um documento com mais de uma página termina o reconhecimento e a seleção dos candidatos, ela pode ser disponibilizada para leitura enquanto as demais continuam convertendo. O mesmo vale quando a página é recuperada de um checkpoint válido. Não há nova chamada ao OMR para criar a prévia. A página é identificada como provisória e ainda não conferida integralmente com a fonte.

Uma primeira página excluída, com falha ou sem suporte não é substituída pela página 2. Documentos de uma página seguem direto para a validação final. A prévia não libera reprodução, exportação MIDI ou o download final da conversão em andamento. O resultado anterior de uma retentativa continua disponível pelas regras existentes.

Preparação do PDF e primeira leitura ainda precisam terminar antes da prévia aparecer. A entrega não permite visualizar a página antes de o motor reconhecê-la nem garante um tempo máximo de espera ou precisão musical.

## Estado e acesso

`Score.conversionPreview` contém tentativa, revisão, página, total, data, avisos e SHA-256 do XML. A publicação exige a tentativa atual em processamento, token de execução válido e partitura não excluída, na mesma trava/transação usada pelo progresso. A prévia não modifica `musicxmlFilename`, cobertura, aprovação ou permissões do resultado final.

`GET /api/scores/:id/first-page-preview?revision=<revisão>` retorna MusicXML com autenticação e autorização de proprietário/admin, cache privado desabilitado e identificação de conteúdo provisório. O servidor confere a revisão e a tentativa antes e depois da leitura do arquivo; uma resposta antiga não pode selecionar outra revisão por caminho informado pelo cliente. Conteúdo ausente/alterado retorna indisponibilidade, sem expor caminhos internos.

Fila de nova tentativa, claim/reclaim, resultado final, falha e exclusão retiram a referência de prévia. Os clientes vinculam a leitura à conta/partitura/tentativa/revisão e descartam respostas antigas. Na tela, a prévia é independente do player e do estado final da partitura.

No app, a prévia da primeira conversão aparece diretamente na área de leitura, com rolagem para acomodar avisos e telas menores. Durante uma retentativa, a partitura anterior permanece na área principal e um aviso abre a prévia no painel de detalhes. As consultas são separadas por conta e os dados ficam ocultos sem sessão autenticada. O XML provisório não usa o cache nem a sessão de leitura/reprodução do resultado final.

## Arquivos e falhas

XMLs temporários ficam no diretório privado `<upload>.previews`, com revisão aleatória exclusiva por publicação, limite de 8 MiB por arquivo e hash verificado na leitura. Arquivos são removidos ao encerrar a execução. Uma execução antiga só remove sua própria revisão; não há compartilhamento de arquivo com a versão de outra execução.

Após uma queda que impeça o `finally`, uma próxima gravação remove somente arquivos de prévia próprios e antigos, após o maior prazo entre uma hora e orçamento de conversão + 60 segundos. Links simbólicos e nomes desconhecidos não são seguidos nem removidos. A exclusão definitiva/retenção do original remove o diretório privado inteiro. Nenhuma exportação final ou evidência musical de histórico é apagada por essa limpeza.

Falhas opcionais de geração/armazenamento da prévia não descartam a página reconhecida nem o resultado final. Timeout e perda do token de execução continuam interrompendo a execução antiga. A publicação integral e suas validações musical/visual/MIDI permanecem obrigatórias.

## Feita?

- [x] Emitir páginas prontas, novas ou restauradas de checkpoints; quatro testes novos e dez de regressão aprovados.
- [x] Implementar persistência, acesso autenticado, integridade e ciclo de vida da prévia; tipos da API e esquema aprovados.
- [x] Integrar a leitura provisória na web e no app; isolamento entre contas revisado e testes focados aprovados.
- [x] Concluir testes locais de acesso, concorrência, retenção, troca de conta e regressões: 854 testes distintos aprovados (API 441, web 172, mobile 241), builds aprovados e avisos/carregamento inspecionados na web. [Evidências e limites](validation/first-page-preview-2026-10-16/REPORT.md).
- [x] Aplicar/testar a migration em PostgreSQL isolado: backup restaurado, registros fictícios preservados e oito testes de integração aprovados. [Evidências](validation/postgres-migration-2026-10-17/REPORT.md).
- [x] Aplicar/verificar a migration no banco publicado, com backup restaurado, histórico íntegro e registros preservados. [Comprovantes](validation/postgres-migration-2026-10-17/PRODUCTION.md).
- [x] Homologar funcionalmente a prévia com Audiveris 5.10.2 real no Mac: página recuperada do disco, leitura durante processamento e retirada na finalização; controle de uma página sem prévia intermediária. [Evidências e limites musicais](validation/omr-homologation-2026-10-17/REPORT.md).
- [x] Corrigir e retestar classificação das páginas e coerência XML–MIDI de Carcassi: nova execução real no Mac com cobertura 2/2, prévia antes da próxima página e 1.440 ataques aprovados. [Evidências atuais](validation/omr-qualification-2026-10-17/REPORT.md).
- [x] Homologar funcionalmente no runtime Linux usado pelo servidor, em execução isolada: página 1 restaurada, prévia antes da página 2 e retirada ao terminar; controle de uma página sem prévia. [Provas](validation/omr-qualification-2026-10-17/linux-verification.json).
- [x] Resolver e retestar o MIDI da saída Carcassi Linux: 1.454 ataques aprovados na nova execução isolada, com reparo temporal auditado e proteção estrita mantida. [Provas atuais](validation/omr-corrections-2026-10-17/REPORT.md).
- [ ] Homologar aparelhos de distribuição e fidelidade musical integral à fonte; as divergências da Adelita automática permanecem registradas.
- [ ] Publicar servidor/web e distribuir o app.
