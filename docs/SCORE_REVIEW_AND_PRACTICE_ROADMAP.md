# Conferência, versões e estudo por compassos

Implementação autorizada em 22/10/2026. A prévia precisa ser apresentada ao usuário antes de qualquer reenvio à Apple. O lançamento permanece manual.

## Atividades e evidências

- [x] Implementar a conferência guiada na web e no app, com original, resultado, avisos e sugestões de notas/pausas.
- [x] Validar decisões de aceitar, rejeitar e desfazer, incluindo revisões desatualizadas e troca de conta.
- [x] Implementar histórico autenticado de conversões e correções e abertura/exportação de versões anteriores.
- [x] Validar integridade, ordem das versões, acesso por proprietário e arquivos ausentes.
- [x] Implementar repetição de um intervalo de compassos no player compartilhado com o app.
- [x] Validar limites musicais, andamento, pausas, repetição impressa e mudança de partitura.
- [x] Integrar os três recursos aos detalhes da partitura sem ocupar permanentemente a área de leitura.
- [x] Conferir a interface nos simuladores existentes de iPhone, iPad e Duo e preparar capturas para a apresentação.
- [ ] Fazer a validação final em aparelho físico.
- [ ] Preparar um novo build de distribuição após a avaliação da prévia.
- [ ] Reenviar à Apple após a avaliação do usuário e a preparação da resposta às diretrizes 4.3 e 4.2.6.

## Escopo desta entrega

Conferência com propostas existentes e decisão explícita do usuário; não é um editor livre de notação. Aprovar uma revisão não certifica precisão musical. Abrir ou exportar uma versão anterior preserva a versão atual. O player continua dependendo de internet.

Validação local: **523 testes API, 205 web e 271 mobile aprovados (999)**. Dezessete testes de banco opt-in ficaram sem execução. Tipos, build API/web e build nativo Debug aprovados. [Relatório, capturas e limites](validation/score-study-features/REPORT.md).

## Recursos reutilizados

Inventário anterior aos testes: dependências e caches `.vite` já existentes em cada workspace; compilados em `apps/api/dist`, `apps/web/dist` e `apps/mobile/ios/build`. Nenhuma limpeza ou clonagem foi solicitada.

Simuladores existentes compatíveis: iPhone Duo de partituras `BDBB5A08-75A0-4C71-804E-068B39E578DF` (iOS 27.1), iPhone 18 Pro `5C319EC8-D9A9-4E9C-9AE4-7FF820199ED0` e iPad Pro 13 `81E3E6CC-F1E8-4E2A-BFD7-9C8FF87E67D2` (iOS 27.0). O Duo `EFFD44A5-4716-43DD-BE1F-FE3CFF4AAF4F` estava ligado no inventário e não será assumido sem confirmar que está livre. Os aparelhos efetivamente usados e as verificações serão registrados ao concluir.

Os três simuladores de QA acima foram efetivamente reutilizados, sem criação, clonagem ou reset. O Duo `EFFD44A5-4716-43DD-BE1F-FE3CFF4AAF4F` e os aparelhos físicos permaneceram fora desta validação. A instalação de QA usa a compilação Debug; não representa um novo IPA de distribuição ou um build enviado à Apple.

A prévia web usa porta 5175 e o cache estável `apps/web/node_modules/.vite/score-study-preview`, isolados porque a porta 5173 e o cache padrão estavam sendo usados por outro servidor durante o inventário. A compilação nativa reutiliza `apps/mobile/ios/build/splash-validation` e seu produto `Debug-iphonesimulator` já existente.
