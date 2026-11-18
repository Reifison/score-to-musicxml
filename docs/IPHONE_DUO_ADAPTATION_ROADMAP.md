# Planejamento de adaptação para iPhone Duo

Atualizado em 22 de outubro de 2026. Prioridade confirmada pelo usuário: **leitura da partitura e player na tela interna aberta**. O objetivo é ampliar a área de leitura, manter os controles alcançáveis e continuar no mesmo ponto musical ao abrir, fechar, girar ou redimensionar o app.

Este planejamento complementa o [roadmap central](PROJECT_ROADMAP.md). **Feita?** indica conclusão comprovada: ☑ Sim para concluída e ☐ Não para pendente. Preparação, implementação e validação são registradas separadamente. **As seis etapas de implementação estão concluídas, incluindo o candidato Release local e o manifesto do web pareado.** A homologação integral permanece pendente: a continuação de 22/10 confirmou leitura, ciclo principal de reprodução e retomada pausada no simulador; acessibilidade completa, escuta/hardware e demais plataformas continuam separados. O archive mencionado abaixo é histórico e antecede as mudanças de UI posteriores. [Entrega integral e evidências](validation/iphone-duo-2026-10-16/final/REPORT.md).

## Continuação da validação — 22/10/2026

- [x] **Feita? Sim — Reutilizar o ambiente existente.** Mesmo iPhone Duo `EFFD44A5-4716-43DD-BE1F-FE3CFF4AAF4F`, iOS 27.1 e host Debug 1.0 (13), compilado com SDK 27.1; nenhum aparelho novo ou rebuild nativo. Diretórios de build/caches existentes identificados e preservados.
- [x] **Feita? Sim — Revalidar o código disponível no início da rodada.** 254 testes mobile + 172 web = **426 aprovações**, além dos dois typechecks. A revisão independente de continuidade passou 69 testes, incluídos nas suítes completas. Alterações simultâneas posteriores de conferência/versões/repetição precisam de suas próprias verificações.
- [x] **Feita? Sim — Exercitar a leitura pausada nos formatos prioritários.** Página 2/70 BPM mantidos na tela externa vertical, nas duas paisagens externas, na interna vertical e nas duas paisagens internas, na dobra parcial vertical/horizontal e no retorno à tela fechada. Acesso à última ação da barra nas janelas baixas continua separado.
- [x] **Feita? Sim — Identificar a interferência das recargas de desenvolvimento.** Edições autorizadas em outra conversa recarregaram host e web durante os ciclos de reprodução. A pausa observada nessas tentativas não é atribuída à dobra. Código de diagnóstico temporário removido; fontes e recursos da outra implementação preservados.
- [x] **Feita? Sim — Confirmar o ciclo completo do player sem recarga concorrente.** Fechado → aberto → giro → parcial → fechado, com botão Pausar e relógio avançando de 0:02 a cerca de 0:56, mantendo 20 BPM. Cópia mínima temporária de código; dependências e imagens referenciadas, mesmo simulador/portas. Isso valida continuidade observável; escuta permanece pendente.
- [x] **Feita? Sim — Confirmar segundo plano e retorno à rota sem autoplay.** Continuar em 1:02/3:39 e 20 BPM após Home/retorno, saída de rota e atualização intencional do layout. Interrupção sonora e relançamento frio continuam separados.
- [x] **Feita? Sim — Aplicar a margem de segurança solicitada nos títulos.** Gutter comum de 24 pt no leitor e nos cabeçalhos de Partituras/Favoritas, Perfil, Configurações, Lixeira, Usuários e Logs. Capturas nativas do leitor e Perfil confirmadas; quatro testes de layout e typecheck mobile passaram após a alteração.
- [ ] **Feita? Não — Confirmar a nova margem com fonte máxima e todas as posturas.** Implementação comum concluída; a rodada visual confirmou a paisagem externa nos dois componentes.
- [ ] **Feita? Não — Homologar o conjunto com os novos controles de estudo.** Conferência/versões/repetição continuam em implementação paralela. Verificar paginação, rolagem e última ação nas janelas baixas após integrar esse conjunto.
- [ ] **Feita? Não — Concluir acessibilidade, interrupções e matriz restante.** Escuta/hardware, scanner real, multitarefa, fonte máxima/VoiceOver, interrupção sonora e regressões nas outras plataformas permanecem separados. [Relatório, recursos reutilizados e capturas desta rodada](validation/iphone-duo-2026-10-22/REPORT.md).

## Direção da experiência

**Correção posterior da posição da barra em 16/10:** a navegação agora ocupa a região UIKit de barra na borda, abaixo do relógio/Wi‑Fi, recuperando a coluna extra. Lixeira e Ajustes seguem Detalhes no leitor e deixam os cartões grandes do início quando há lateral. Larguras dos cartões e reflow do andamento corrigidos. 373 testes passaram, com capturas e toques no Duo e composição de regressão no iPad. [Entrega atual e pendências](validation/iphone-duo-2026-10-16/system-rail/REPORT.md). A implementação local não está no IPA 13 já enviado à Apple.

**Refinamento posterior em 16/10:** navegação lateral nas duas telas, detalhes concentrados na lateral e controles/paginação compactos implementados e conferidos no simulador. 355 testes da integração atual passaram; reprodução, pausa, posição e andamento exercitados. [Capturas e relatório](validation/iphone-duo-2026-10-16/refinement/REPORT.md). O archive e o manifesto da primeira entrega são anteriores a esse refinamento; novo build de distribuição e web publicado permanecem pendentes.

A partitura digital ocupa a maior área contínua disponível. Reprodução, pausa, posição, andamento e páginas ficam próximos da leitura; dados da conversão, original e exportações ficam em uma área secundária recolhível. Na tela interna, a composição se expande sem transformar o player em um cartão de telefone esticado.

Preservar a identidade atual: laranja, superfícies claras e quentes, tipografia do sistema, ícones existentes e linguagem do Conversor de Partituras. Reaproveitar de Jogos Duo os padrões de geometria, navegação e preservação de estado, adaptados ao trabalho musical e aos destinos existentes. O modo de uso é **Operate**, com foco em consultar e ouvir a partitura.

| Espaço disponível | Composição proposta para leitura e player |
| --- | --- |
| Tela externa ou janela compacta | Partitura em primeiro plano, controles essenciais visíveis e acesso recolhível a original, detalhes e exportação. Navegação posicionada na região segura conforme a configuração do sistema. |
| Tela interna ampla | Partitura ampliada e painel secundário opcional. A biblioteca não ocupa uma coluna permanente durante a leitura; o usuário pode recuperar a área fechando o painel. |
| Janela larga e baixa, em ambos os sentidos | Controles reorganizados para consumir pouca altura; partitura com rolagem própria e navegação lateral quando a geometria permitir. |
| Postura parcial | Partitura e controles em superfícies contínuas, afastados da dobra ativa. Dividir painéis somente quando as duas áreas mantiverem legibilidade e alvos inteiros. |
| Fonte ampliada ou janela muito pequena | Recolher conteúdo secundário e permitir rolagem independente. Preservar nomes, tamanho do texto e alvos de toque. |

Essas composições são propostas do projeto. A Apple orienta preservar funcionalidades e estado entre telas, adaptar controles às regiões reservadas e acompanhar o posicionamento vertical das barras, com exceções conforme a configuração. A decisão deve usar o espaço útil e os sinais nativos, sem identificar o aparelho por nome ou fixar um lado universal para a barra. [Orientações de design da Apple](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo).

## Preparação concluída

- [x] **Feita? Sim — Confirmar a prioridade com o usuário.** Leitura e player primeiro; digitalização, conversão e telas secundárias na etapa seguinte.
- [x] **Feita? Sim — Inspecionar a arquitetura e as alterações em andamento.** Expo 54, React Native 0.81.5, Expo Router, nova arquitetura, WebView para a partitura digital e áudio. Há alterações locais anteriores, inclusive no scanner e nas telas; a implementação deverá preservar esse trabalho.
- [x] **Feita? Sim — Mapear os pontos de adaptação no código.** Navegação lateral exclusiva do Android, quadro do player com altura fixa, tratamento parcial de áreas seguras e ausência de restauração da sessão do player no host.
- [x] **Feita? Sim — Conferir a ferramenta e as APIs nativas instaladas.** Xcode 27.1, build 27A9275, SDK iPhoneOS 27.1; os headers locais declaram regiões reservadas e interação com a dobradiça desde iOS 27.1. Isso comprova disponibilidade das declarações, sem comprovar compilação ou comportamento do app no Duo.

## Diagnóstico inicial e lacunas — 15/10/2026

O quadro abaixo registra a situação encontrada no planejamento. As mudanças entregues e seus estados atuais estão nas etapas de implementação e validação a seguir.

| Evidência atual | Consequência para a adaptação |
| --- | --- |
| [Quadro do player](../apps/mobile/src/player/ScorePlayerWebView.tsx) com `height: 620`. | O tamanho precisa vir da área realmente disponível. A altura da WebView também determina quais regras responsivas o visualizador web consegue aplicar. |
| [Detalhe da partitura](../apps/mobile/app/score/%5Bid%5D.tsx) em uma coluna rolável, com conteúdo limitado a 960 pontos. | Separar a área de leitura dos detalhes e reservar espaço medido para o player. |
| [BottomNav](../apps/mobile/src/components/BottomNav.tsx) e [layout raiz](../apps/mobile/app/_layout.tsx) escolhem barra lateral apenas em Android com largura a partir de 600. | Reaproveitar os destinos e adaptar a composição iOS por largura, altura, fonte e regiões seguras. O limite atual não define as características do Duo. |
| Início e [conferência da captura](../apps/mobile/src/documentScanner/DocumentReviewModal.tsx) usam `SafeAreaView` do núcleo do React Native. | Uniformizar a proteção por borda com `react-native-safe-area-context`, incluindo modais e páginas secundárias. |
| O [player web](../apps/web/src/components/ScorePlayer.tsx) já oferece reprodução, andamento, posição, páginas e destaque musical; seu [CSS](../apps/web/src/styles/global.css) contempla rolagem, pinça e paisagem baixa. | Evoluir a superfície existente e comprovar os gestos no iOS. O CSS atual não comprova preservação do zoom nem adequação à dobra. |
| O host envia `dispose` ao sair da rota e recria a WebView no retorno. A [ponte](../apps/mobile/src/player/bridge.ts) recebe posição e andamento, mas o componente não os guarda para restaurar. | Separar uma mudança de composição da saída real da sessão. Criar snapshot e restauração para as recargas necessárias. |
| O [SceneDelegate](../apps/mobile/plugins/ios/SceneDelegate.swift) já cria a janela pela cena e reaproveita o controlador RN. | Preservar essa integração e validar reconexão sem iniciar outro runtime ou duplicar áudio. |

A abertura ou rotação, isoladamente, não aparece como causa explícita de remontagem no código atual. Portanto, a continuidade nessas transições precisa ser medida; a perda de estado já identificada está no descarte e na recarga da rota.

## Ordem de implementação

| Etapa | Entrega e critério de conclusão | Dependência | Feita? Implementação | Feita? Validação |
| --- | --- | --- | --- | --- |
| 1 — Base de layout | Centralizar medidas da janela, fonte, insets independentes e regiões reservadas. Fornecer área contínua segura e fallback para os aparelhos atuais. | Diagnóstico | ☑ Sim — módulo Expo, geometria e hooks | ☐ Não — código/build e posturas selecionadas passaram; confirmação da fonte máxima após correção e regressão nas demais plataformas pendentes |
| 2 — Continuidade do player | Separar sessão musical da composição; guardar e restaurar posição, andamento e âncora de leitura quando necessário. Redimensionar não recria a sessão. | Etapa 1 e contrato da ponte | ☑ Sim — snapshots por conta/partitura/revisão, ponte e resize | ☐ Não — testes de suspensão combinada, refoco e resize passaram; ciclo e retomada no simulador passaram em 22/10; escuta/interrupções reais pendentes |
| 3 — Leitura e reprodução | Remover a altura fixa e entregar as composições compacta, ampla e baixa. Controles e páginas permanecem acessíveis; original e exportações são secundários. | Etapas 1 e 2 | ☑ Sim — área medida e detalhes recolhíveis | ☐ Não — primeira inspeção e confirmação registradas; acessibilidade e formatos baixos extremos pendentes |
| 4 — Navegação adaptável | Adaptar a navegação existente ao iOS e às regiões livres; manter destinos estáveis e Voltar acessível. Preservar navegação hierárquica e gesto nativo de retorno. | Etapa 1; integrar com etapa 3 | ☑ Sim — navegação única, barra/lateral, Voltar e permissões | ☐ Não — código e capturas nativas passaram; gesto de retorno e barra com fonte máxima após correção aguardam teste interativo |
| 5 — Fluxos complementares | Adaptar importação, conferência da captura, lista, login, perfil, configurações, lixeira e administração, respeitando permissões de cada perfil. | Estrutura de navegação estabilizada | ☑ Sim — oito rotas e conferência da captura | ☐ Não — código e capturas nativas dos perfis comum/admin passaram; câmera, conferência, teclado e últimos controles por toque aguardam teste interativo |
| 6 — Integração final | Reproduzir o módulo no build nativo e combinar versões compatíveis do host e da página web do player. Registrar artefato, configurações e evidências do candidato. | Etapas 1 a 5; distribuição depende da homologação | ☑ Sim — archive de engenharia e manifesto host/web | ☑ Sim — Debug/Release, bytecode HTTPS, módulo e 94 hashes do archive; distribuição/publicação continuam separadas |

### Etapa 1 e integração nativa

- [x] **Feita? Sim — Criar uma fonte única de geometria.** `useAdaptiveLayout`, `useReservedRegions` e `readingLayout` combinam janela, fonte e insets por borda; o reader mede sua área com `onLayout`. O snapshot nativo reúne medidas e regiões da mesma janela. [Documentação do React Native 0.81](https://reactnative.dev/docs/0.81/usewindowdimensions).
- [x] **Feita? Sim — Expor e compilar as regiões reservadas do iOS.** Módulo Expo `ScoreAdaptiveLayout` com snapshot inicial, eventos, observação da janela/cena e encerramento dos listeners. Frames locais convertidos para a janela, sem margem duplicada; autolinking, registro nos Pods e build do simulador com SDK 27.1 concluídos. Comportamento nas posturas continua separado da compilação.
- [x] **Feita? Sim — Manter o fallback e a integração nativa.** APIs protegidas por versão do compilador e disponibilidade do iOS 27.1; mínimo do app preservado em 15.1. Testes cobrem ausência do módulo e eventos; o módulo foi incluído no development build. O plugin existente de cenas foi ajustado para iniciar o Expo Dev Launcher depois que a janela existe, com teste de geração idempotente.
- [x] **Feita? Sim — Integrar a geometria ao player embutido.** O RN aplica os insets e escolhe uma área contínua para conteúdo e navegação; a página HTML não reaplica safe areas. A WebView recebe a altura medida, e o HTML reorganiza controles pela largura e altura efetivas.

O SDK local confirma `UIView.reservedRegions(kind:options:)` e `UIHingeInteraction`. O primeiro recurso atende à proteção de conteúdo; fluxo contínuo de ângulo e efeitos de dobradiça ficam fora da primeira entrega. Compilar com o SDK 27.1 faz parte da integração, mas não substitui adaptar as barras personalizadas do app. [Preparação oficial da Apple](https://developer.apple.com/iphone-duo/prepare/).

### Etapas 2 e 3 com foco musical

- [x] **Feita? Sim — Manter uma única sessão nas mudanças de layout.** Dimensões, fonte e postura não entram nas chaves da partitura nem provocam novo `score.load`. Testes verificam a mesma instância do leitor e nenhuma recarga por resize.
- [x] **Feita? Sim — Implementar snapshot e restauração compatíveis.** Conta autenticada, partitura e revisão isolam posição executada, andamento, página, âncora de compasso e razão de rolagem. A posição executada preserva a ocorrência em repetições. Revisão diferente não restaura snapshot anterior; logout invalida leases e impede gravações tardias. O store expira em sete dias e não guarda XML ou credenciais. Zoom de pinça não é serializado.
- [x] **Feita? Sim — Invalidar o snapshot na exclusão da partitura.** Exclusão individual ou em lote limpa a posição após confirmação da API. Leases anteriores à exclusão são rejeitadas, inclusive com gravação em voo; favoritar e exclusão recusada preservam o snapshot. Limpeza por IDs únicos cobre as contas locais; o store também aceita escopo por conta.
- [x] **Feita? Sim — Preservar as regras de pausa no código.** Geometria sozinha não pausa nem reinicia. App inativo, rota sem foco e painel modal são fontes combinadas de suspensão; retorno ou restauração aguardam ação do usuário para tocar.
- [x] **Feita? Sim — Evoluir a ponte dos dois lados.** Host consome reprodução e leitura, com capacidades anunciadas separadamente da mensagem v1 original. Restauração é enviada somente quando negociada; timeout mantém compatibilidade com página antiga. Validação estrita, origem confiável e isolamento por sessão preservados.
- [x] **Feita? Sim — Dimensionar a leitura pela área útil.** O detalhe da partitura mede o painel, cabeçalho e barras; a WebView ocupa o restante. Resize pausado restaura a âncora; tocando, segue o relógio atual sem recarregar XML/áudio/renderizador.
- [x] **Feita? Sim — Reorganizar controles e conteúdo secundário.** Original, detalhes e exportações ficam em painel recolhível, lateral quando há espaço. Navegação alterna entre barra e lateral; controles web têm mínimo de 48 CSS px. Paginação tem área própria em janelas baixas e o scroll da partitura permite encadeamento. A fonte da janela é encaminhada ao HTML; fonte máxima foi inspecionada e corrigida, mas a confirmação interativa final foi interrompida.
- [x] **Feita? Sim — Confirmar a primeira entrega no simulador.** Tela externa vertical sem corte do andamento; painel lateral no Duo aberto; página 2/118 BPM preservados entre posturas e retomada pausada em 0:09/118 BPM após sair e reabrir. [Relatório e capturas](validation/iphone-duo-2026-10-16/REPORT.md).
- [x] **Feita? Sim — Implementar a navegação fora do leitor.** `AdaptiveScreen` e `AdaptiveNavigation` reservam a mesma região segura para as oito rotas; conservam destinos por perfil, pilha e gesto nativo. Testes confirmam permissão, destino ativo e estado do formulário após resize/fonte. A validação nativa permanece separada.
- [x] **Feita? Sim — Unificar fonte e composição por janela.** O módulo publica `fontScale` e categoria da janela; texto, campos e player usam a mesma medida, sem limitar a preferência de fonte nem aplicar escala duas vezes. Fallback para RN e ausência do módulo cobertos por testes; validação ao vivo em andamento.
- [x] **Feita? Sim — Adaptar os fluxos complementares.** Início/importação, biblioteca, login, perfil, configurações, lixeira e administração usam a estrutura comum. Login permite rolagem com teclado; conferência mantém prévias proporcionais, ordem e ações alcançáveis. As regras existentes de captura, compra e acesso foram preservadas.
- [x] **Feita? Sim — Corrigir o lote encontrado na inspeção integral.** A barra lateral cresce para os nomes completos com fonte ampliada; nome/e-mail do perfil quebram linha e os campos de login/senha têm rótulos acessíveis. A conferência da captura acompanha Reduzir Movimento. Arquivos gerados de build/evidências foram excluídos do monitoramento do Metro para evitar recargas durante a validação.

### Etapa 6 — candidato de engenharia e preparação de distribuição

- [x] **Feita? Sim — Gerar e verificar o archive Release local.** `apps/mobile/ios/build/candidates/score-duo-build13-local.xcarchive`, versão 1.0 (13), arm64, iOS mínimo 15.1, módulo confirmado nos símbolos e 94/94 hashes verificados. Caches/DerivedData existentes reaproveitados; IPAs e símbolos anteriores preservados. O candidato não tem assinatura/perfil de distribuição.
- [x] **Feita? Sim — Conferir configuração HTTPS e parear o web.** Bytecode Hermes confirma API `https://converter.nossateoria.com.br` e player `/mobile/player`; HTTP desativado no Release. [Manifesto host/web](validation/iphone-duo-2026-10-16/final/artifact-pair.json) registra fontes e 73 arquivos do web, sem duplicar mídias. Contrato v1 e capacidades opcionais testados.
- [x] **Feita? Sim — Executar o preflight existente.** 16 verificações aprovadas, zero falhas e quatro pendências de distribuição/Android; os testes desse verificador também passaram.
- [ ] **Feita? Não — Homologar a matriz interativa restante.** Ciclo principal e retomada pausada confirmados em 22/10; concluir gestos, escuta, acessibilidade, scanner, multitarefa e integração dos novos controles. Preservar recursos em uso por outras tarefas.
- [ ] **Feita? Não — Preparar um build efetivamente distribuível após a homologação.** Definir o próximo número de build, assinar/exportar e conferir o artefato sem substituir o IPA 13 anterior. Android depende de SDK/ADB e configuração de assinatura disponíveis.
- [ ] **Feita? Não — Publicar e conferir o web pareado antes de distribuir o host novo.** O endereço público responde HTTP 200, mas serve assets diferentes dos desta entrega. Publicação web, TestFlight e App Store permanecem etapas posteriores; nenhuma foi executada nesta adaptação.

## Escopo preservado

O trabalho adapta o app existente. A entrega automática do resultado, os avisos essenciais, o piano como timbre padrão, as regras de retentativa, os scans e os direitos de acesso continuam seguindo os contratos atuais. Resultados parciais mantêm seus avisos; o player reproduz os trechos permitidos e a exportação MIDI permanece sujeita às regras existentes em `scoreAvailability`.

O player mobile continua dependendo de uma página HTTPS para abrir. Cache do MusicXML não equivale a suporte offline. Editor musical, leitura de duas páginas simultâneas e múltiplas janelas independentes ficam para outro escopo. A comparação com o original pode usar o painel secundário quando houver espaço, sem exigir sincronização automática de paginações diferentes.

## Plano de validação

### Código e integração

- [x] **Feita? Sim — Testar decisões de geometria no código.** Insets assimétricos, oclusão/divisão ativa ou inativa, ausência do módulo, snapshot tardio, janela baixa, fonte ampliada e painel lateral cobertos. Geometria simulada não substitui toque e acessibilidade no aparelho.
- [x] **Feita? Sim — Testar continuidade musical no código.** Resize sem nova carga, painel e app inativo simultâneos, refoco com gravação assíncrona, restauração sem autoplay e invalidação por revisão/usuário cobertos. Resize tocando usa o relógio/compasso atual. Escuta, duplicação sonora e gestos nativos permanecem na matriz prática.
- [x] **Feita? Sim — Testar ponte, armazenamento e resize.** Snapshot/restore, negociação v1, mensagens inválidas/obsoletas, revisão e conta ativa diferentes, logout/exclusão com gravação tardia e resize pausado/tocando cobertos. A confirmação sonora em repetições e posturas reais continua pendente.
- [x] **Feita? Sim — Conferir TypeScript, suítes afetadas e builds nativos finais.** Mobile: 44 arquivos/181 testes; web: 24 arquivos/144 testes (**325 aprovações**). Typechecks, build web, Debug ad hoc e archive Release unsigned passaram. Módulo/plugin compilados; caches reutilizados. Detector: apenas Inter preexistente no CSS global, fora do diff Duo; nenhuma alteração de identidade foi feita por esse alerta.

### Simulador e aparelho

| Cenário | Critério de aceite | Evidência prevista | Feita? |
| --- | --- | --- | --- |
| Tela externa vertical com texto padrão | Leitura, andamento e paginação completos, fora da câmera/status. | `confirm-outer-portrait.png`, posição 0:09 e 118 BPM | ☑ Sim |
| Tela externa em ambas as paisagens, inspeção da leitura | Leitura enquadrada, página preservada e composição fora da câmera. | Capturas dos dois sentidos em 22/10; alcance por toque da última ação é separado abaixo | ☑ Sim |
| Tela interna vertical e paisagem testada | A partitura ganha área útil; painel lateral opcional preserva a leitura. | `confirm-inner-portrait.png` e `confirm-inner-landscape-details.png` | ☑ Sim |
| Tela interna na paisagem oposta | Confirmar leitura e controles no segundo sentido. | Orientações Landscape Left/Right enumeradas e página 2 preservada em 22/10 | ☑ Sim |
| Parcialmente aberto com dobra vertical/horizontal, texto padrão | Leitura e navegação em superfície contínua fora da dobra ativa. | `partial-vertical-page2-tempo118.png` e `partial-horizontal-page2-tempo118.png`, antes do ajuste de controles | ☑ Sim |
| Câmera inferior e última ação após os ajustes | Conferir ambos os lados, altura da barra e alcance completo por toque. | Primeira rodada capturada; cruzamento final ainda incompleto | ☐ Não |
| Fechado → aberto → giro → parcial → fechado, leitura e estado de reprodução no simulador | Mesma partitura/revisão, andamento e relógio em avanço. | Página 2 pausada; ciclo isolado em 20 BPM, 0:02 → cerca de 0:56; capturas `isolated-*` de 22/10 | ☑ Sim |
| Escuta durante as transições | Continuidade sonora, sem duplicação ou falhas audíveis. | Escuta independente e hardware ainda necessários | ☐ Não |
| Abrir/fechar detalhes e voltar à biblioteca | Preservar leitura e restaurar posição pausada sem autoplay. | Capturas antes/depois em 0:09/118 BPM; painel lateral e sobreposição exercitados | ☑ Sim |
| Ajustes, original/exportação e fontes de pausa simultâneas | Retomar sem duplicar áudio; ações secundárias e pausas combinadas respeitadas. | Exercício completo com áudio ainda necessário | ☐ Não |
| Segundo plano e reabertura da rota | Retomada no ponto salvo e áudio aguardando ação do usuário. | Home/retorno e refoco em 1:02/20 BPM, confirmado em 22/10 | ☑ Sim |
| Interrupção sonora e relançamento frio | Retomada consistente sem autoplay após interrupção real/processo encerrado. | Cenários adicionais não executados nesta rodada | ☐ Não |
| Margem comum dos títulos | Títulos afastados da borda nos dois cabeçalhos adaptativos. | 24 pt, leitor/Perfil em paisagem externa, quatro testes e typecheck; fonte máxima/todas as posturas separados | ☑ Sim |
| Fonte ampliada, Reduzir Movimento e VoiceOver | Nomes completos, foco previsível, controles operáveis e sem corte no fim da barra. | Execução real de acessibilidade | ☐ Não |
| Fluxos complementares com fonte padrão na tela interna | Início, login, perfil, configurações, lixeira e administração enquadrados; nomes completos e distinção entre perfis. | Capturas nativas finais; scanner/teclado/toques não incluídos nesta aprovação visual | ☑ Sim |
| Split View real e redimensionamento | Composição responde à janela; não depende de orientação/modelo. | Multitarefa executada, separada de simulação geométrica | ☐ Não |
| iPhone convencional, iPad e Android afetado | Navegação, leitura, scanner e compartilhamento preservados. | iPad 27.0 instalado, parado no alerta de abertura; iPhone pré-existente preservado; Android sem SDK/ADB | ☐ Não |
| Duo físico | Legibilidade, toque, pinça, áudio e fluidez aceitáveis nas posturas suportadas. | Homologação física identificando aparelho e build | ☐ Não |

Organizar a inspeção visual em uma rodada conjunta dos formatos afetados, corrigir os problemas em lote e executar no máximo uma rodada de confirmação, conforme Impeccable. Executar o detector nos alvos web alterados ao final. Testes de código e execução nativa continuam sendo evidências distintas.

Registrar poucas capturas representativas com data, build, runtime, display, postura e fonte. Enumerar os displays antes de capturar; seus IDs não são universais. Testar descarte, exclusão e relançamento com dados próprios de validação, preservando o acervo do usuário.

## Organização do trabalho

O agente principal integra geometria, composição e critérios de aceite. Orchestrate pode atribuir a um agente a sessão e a ponte do player, e a outro a integração nativa, com arquivos e contratos definidos antes das edições. `ScorePlayerWebView.tsx`, o layout raiz e o CSS compartilhado precisam de um único responsável por vez. A revisão independente confere o resultado integrado, dentro das mesmas rodadas visuais.

Impeccable orienta a adaptação nativa com a identidade atual. Antes das edições de UI, carregar craft-floor; o diagnóstico desta sessão já carregou o contexto e as referências de adaptação e iOS. A documentação de produto ainda não tem a seção `## Platform` com o valor `adaptive`; essa manutenção do contexto pode ser tratada quando solicitada, sem bloquear o planejamento.

## Critério de conclusão e situação atual

- [x] **Feita? Sim — Entregar o primeiro incremento de leitura e player.** Código, 310 testes, build nativo e cenários selecionados do simulador registrados; as validações restantes estão explicitadas acima.
- [x] **Feita? Sim — Concluir as seis etapas de implementação.** Base, player, leitor, navegação, fluxos complementares e candidato de engenharia entregues; 325 testes aprovados, tipos/builds e evidências registradas.
- [ ] **Feita? Não — Homologar integralmente a adaptação funcional.** Confirmar por interação os critérios restantes da matriz, sem confundir capturas ou mocks com gesto, áudio e scanner reais.
- [ ] **Feita? Não — Concluir a validação no simulador.** Matriz executada, evidências registradas e falhas corrigidas dentro das rodadas previstas.
- [ ] **Feita? Não — Homologar em aparelho.** Leitura, continuidade, gestos, áudio e acessibilidade executados no hardware disponível, mantendo como pendente o que depender de um Duo físico ainda indisponível.
- [x] **Feita? Sim — Preparar o candidato local e o pareamento para eventual lançamento.** Archive e manifesto do web verificados; publicação e assinatura de distribuição não integram essa conclusão local.
- [ ] **Feita? Não — Concluir os requisitos de distribuição.** Homologação, número de build distribuível, assinatura/exportação e página web pareada publicada/conferida permanecem pendentes.

Evidência histórica de 16/10: **181 testes mobile + 144 web = 325 aprovações**, typechecks, build web, Debug nativo e archive Release. Na continuação autorizada, houve uma inspeção conjunta das novas superfícies, um lote de correções e confirmação limitada por capturas nativas; o bloqueio do Mac impediu terminar os testes interativos. [Relatório final, artefatos e limites](validation/iphone-duo-2026-10-16/final/REPORT.md). Servidor de teste, contas e partitura são fictícios; não houve OMR nem alteração do acervo/publicação. As pendências de validação continuam desmarcadas.
