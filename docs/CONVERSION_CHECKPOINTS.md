# Retomada por página e progresso da conversão

Implementação local de 16/10/2026. A implantação exige a migration `20261017000000_conversion_page_progress` antes de iniciar API/worker atualizados; o campo novo é opcional para clientes e partituras anteriores.

Aplicação concluída no banco publicado em 16/10 às 22:19 local, após validar atualização e restauração em QA e restaurar um backup novo do próprio banco publicado em ambiente isolado. Registros e disponibilidade preservados. A ativação do código permanece na etapa de publicação. [Comprovantes](validation/postgres-migration-2026-10-17/PRODUCTION.md).

## Comportamento

A conversão registra preparação, reconhecimento por página e conferência final. O progresso público contém a tentativa atual, página em andamento, total conhecido e listas separadas de páginas reconhecidas, com falha, excluídas e reaproveitadas. O total fica desconhecido durante a preparação inicial. Não há estimativa de tempo ou porcentagem musical.

Uma página só pode ser reaproveitada quando seu reconhecimento e a seleção/reconciliação de candidatos terminaram. O checkpoint inclui o resultado e as evidências necessárias para continuar a conferência, inclusive imagens e arquivos nativos. Uma interrupção dentro de uma página exige refazer essa página; as páginas anteriores válidas podem ser recuperadas na próxima execução.

São reutilizados somente checkpoints compatíveis com a fonte e as opções atuais. Dados incompletos, alterados, incompatíveis ou corrompidos são descartados como fonte de retomada e a página é reconhecida novamente. Páginas com falha também são tentadas novamente. A união entre páginas, a revisão visual e a validação MIDI continuam ocorrendo antes da publicação do novo resultado.

A chave inclui código do processamento, identidade dos executáveis/distribuições identificáveis, opções e hashes das imagens preparadas. Ao mudar modelos externos, parâmetros ou dependências que o executável não contém, alterar `OMR_CHECKPOINT_GENERATION` na configuração do worker (padrão `1`) e reiniciá-lo. Isso invalida a reutilização anterior sem alterar os originais ou exportações. Identidade indisponível e limites de armazenamento podem desabilitar o salvamento de checkpoints; a conversão segue pelo caminho normal e a interface só afirma reaproveitamento quando ele ocorreu. A preparação das páginas e as validações finais são refeitas em cada execução.

A retomada utiliza as tentativas já autorizadas pelo produto: retentativa manual, retentativa automática de falhas temporárias e recuperação de execução abandonada pela fila. Não debita outro scan, pois não cria outro upload. A política existente de limite de retentativas manuais continua aplicável.

## Armazenamento e isolamento

Os checkpoints ficam em `<uploads>/<nome-interno-do-original>.checkpoints`, fora das rotas públicas de download. O nome interno do upload separa cada partitura, inclusive fontes de bytes idênticos enviadas por contas diferentes. O diretório temporário de execução continua sendo removido; as evidências restauradas são materializadas dentro dele para os validadores existentes.

O progresso é persistido em `Score.conversionProgress` e retornado tanto na listagem quanto nos detalhes. Sua atualização exige a tentativa atual em processamento e seu token de execução. Uma execução substituída ou uma partitura excluída não pode publicar progresso. Finalização e interrupção atualizam o progresso na mesma transação que registra o resultado da tentativa. Durante uma nova tentativa, o arquivo e a cobertura anteriores continuam disponíveis.

A exclusão definitiva ou a retenção do original remove também seus checkpoints. A lixeira segue o período de retenção já existente. Não há limpeza de projetos, builds ou arquivos de entrega neste fluxo.

## Escopo de validação

- [x] **Feita? Sim — Validar retomada e evidências em testes locais do adapter.** Dez testes de integração com motor simulado passaram, incluindo retomada em diretório novo, reaproveitamento real do disco, falha de página, corrupção, invalidação e publicação das evidências restauradas. Armazenamento: 17 testes aprovados.
- [x] **Feita? Sim — Validar persistência, fencing e retenção em testes locais dos serviços.** 35 testes aprovados em `scoreConversionService.test.ts` e `fileStorageService.test.ts`; integração PostgreSQL permanece separada.
- [x] **Feita? Sim — Validar textos, estados e atualização da interface web/mobile.** 163 testes web e 228 mobile passaram; tipos dos clientes aprovados e inspeção visual web em 375/1280 px sem corte no componente.
- [x] **Feita? Sim — Aplicar/verificar a migration em PostgreSQL isolado.** PostgreSQL 16.15, backup restaurado e oito testes de integração aprovados na continuação de 16/10. [Evidências](validation/postgres-migration-2026-10-17/REPORT.md).
- [x] **Feita? Sim — Aplicar/verificar a migration no banco publicado.** Backup novo restaurado, histórico de 15 migrations íntegro e oito tabelas preservadas. [Comprovantes](validation/postgres-migration-2026-10-17/PRODUCTION.md).
- [x] **Feita? Sim — Homologar interrupção e retomada com Audiveris real no Mac.** Primeira página de Carcassi salva antes da interrupção, reutilizada em nova execução sem nova chamada ao motor e usada na prévia enquanto a segunda continuava. Na continuação, classificação e quantização MIDI corrigidas; nova conversão com cobertura 2/2 e 1.440 ataques XML–MIDI aprovados. Controle Adelita de uma página aprovado no fluxo e MIDI. Fidelidade ao PDF permanece pendente. [Evidências atuais e limites](validation/omr-qualification-2026-10-17/REPORT.md).
- [x] **Feita? Sim — Homologar funcionalmente no runtime Linux usado pelo servidor, em contêiner isolado.** Mesma imagem base com os módulos atuais, Carcassi 2/2, interrupção/retomada com zero chamadas para a página 1 reutilizada e progresso/prévia aprovados. Controle Adelita de uma página e MIDI aprovados; na continuação, nova conversão Carcassi Linux com 1.454 ataques MIDI aprovados após reparo auditado de 85 pares note-on/off. Serviços publicados preservados, sem ativação dos novos recursos. [Provas atuais e limites](validation/omr-corrections-2026-10-17/REPORT.md).
- [x] **Feita? Sim — Resolver e retestar o MIDI de Carcassi Linux.** Frações exatas do motor, controles negativos e repetição isolada com os XMLs frescos aprovados.
- [ ] **Feita? Não — Homologar fidelidade integral à fonte.** Adelita corrigida por revisão assistida explícita; leitura automática ainda apresenta perdas e não há aprovação editorial humana integral.
- [ ] **Feita? Não — Homologar as telas em builds de distribuição nos aparelhos.**

Progresso por página e prévia musical são recursos separados. A [liberação antecipada da primeira página](FIRST_PAGE_PREVIEW.md) também foi implementada localmente em 16/10, inclusive para uma página recuperada de checkpoint; sua homologação e publicação constam separadamente no roadmap. Não há retomada do meio de uma leitura Audiveris, aprendizado de modelo ou alteração da meta de precisão musical.
