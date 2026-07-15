# Roadmap: alinhar web e app nativo

Objetivo: manter o app como nativo, mas reduzir retrabalho quando uma regra, texto, status ou fluxo precisar mudar.

## Decisao tecnica

Nao vale transformar o app em uma WebView completa agora. Isso reduziria duplicacao visual, mas perderia parte das vantagens do app nativo: camera, compartilhamento, comportamento do iPhone, barra inferior nativa e futura integracao com recursos do dispositivo.

O caminho recomendado e compartilhar a camada de produto e manter renderizacao especifica por plataforma:

- compartilhado: textos, formatacao, status, regras de exibicao, nomes de arquivos, labels, validacoes e view-models;
- web: componentes React DOM;
- app: componentes React Native.

## Fase 1 - Detalhe da partitura

Status: em andamento.

- [x] Comparar tela web e tela nativa.
- [x] Redesenhar tela nativa com base na tela web.
- [x] Manter barra inferior no app nativo.
- [x] Ajustar rolagem para a barra inferior nao esconder o conteudo.
- [x] Extrair helpers iniciais de apresentacao no app nativo.
- [ ] Adicionar preview PDF inline nativo com uma dependencia propria, se aprovado.
- [ ] Adicionar endpoint para renomear partitura, se a edicao de nome continuar sendo requisito.

## Fase 2 - Camada compartilhada

Status: proxima.

- [ ] Criar pacote `@score-to-musicxml/shared`.
- [ ] Mover helpers de partitura para o pacote compartilhado.
- [ ] Fazer web e mobile consumirem os mesmos helpers.
- [ ] Padronizar labels de status, detalhes, mensagens de erro e nomes de download.
- [ ] Adicionar teste unitario para os helpers compartilhados.

## Fase 3 - Design system multiplataforma

Status: planejada.

- [ ] Criar tokens compartilhados de cor, raio, espacamento e tipografia.
- [ ] Mapear componentes equivalentes: badge, detalhe, aviso, card, botao principal e barra inferior.
- [ ] Documentar diferencas intencionais entre web e app.

## Fase 4 - Fluxos unificados

Status: planejada.

- [ ] Criar view-model para lista de partituras.
- [ ] Criar view-model para detalhe da partitura.
- [ ] Criar view-model para upload.
- [ ] Deixar web e app renderizando a mesma estrutura de dados.

## Fase 5 - Qualidade visual

Status: planejada.

- [ ] Capturar screenshots mobile/web de telas principais.
- [ ] Criar checklist visual antes de cada release.
- [ ] Validar no iPhone real: login, upload, detalhe, preview, download/compartilhamento e barra inferior.
