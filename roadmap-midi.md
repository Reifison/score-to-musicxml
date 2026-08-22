# Roadmap — Exportação MIDI e reprodução visual da partitura

Última atualização: 2026-07-28.

## Objetivo

Adicionar ao produto duas capacidades derivadas do MusicXML já gerado pelo OMR:

1. exportar um arquivo MIDI padrão (`.mid`), que possa ser aberto no MuseScore e em outros programas musicais;
2. exibir e tocar a partitura com destaque sincronizado das notas, primeiro na web e depois no app iOS.

Este documento acompanha a implementação aprovada e registra o estado e as validações de cada atividade.

## Controle de status

Todos os itens executáveis usam exatamente um destes estados:

- `Aguardando`: ainda não iniciado ou aguardando uma dependência/aprovação;
- `Executando`: atividade atualmente em desenvolvimento;
- `Finalizada`: implementação concluída e critérios de aceite verificados.

Regras para atualização deste arquivo:

- manter no máximo uma fase principal como `Executando`;
- antes de iniciar uma tarefa, alterar seu estado de `Aguardando` para `Executando`;
- marcar uma tarefa como `Finalizada` somente depois das validações aplicáveis;
- ao finalizar, registrar data e, quando existir, commit ou PR no histórico;
- se uma tarefa depender de decisão externa, mantê-la como `Aguardando` e registrar o bloqueio nas observações;
- atualizar este roadmap no mesmo conjunto de mudanças da implementação correspondente.

## Decisões técnicas recomendadas

- Usar o MusicXML salvo pela API como única fonte da geração MIDI e da visualização. Não executar um segundo OMR.
- Usar Verovio, com versão fixada no projeto, para importar MusicXML, renderizar SVG, gerar MIDI e mapear as notas ativas durante a reprodução.
- Gerar o `.mid` no backend para que web e iOS recebam exatamente o mesmo arquivo e a autorização permaneça centralizada.
- No MVP, gerar o MIDI sob demanda. Adicionar cache persistente somente se medições demonstrarem necessidade; assim, a primeira entrega não exige migration no Prisma.
- Usar um sintetizador Web Audio controlado pelo player web. Começar com timbre interno simples e só adotar samples externos após validar licença, tamanho e tempo de carregamento.
- Usar o MIDI real gerado pelo Verovio como fonte dos ataques sonoros, interpretado por `@tonejs/midi` 2.0.28; usar o timemap apenas para destaque, compasso e página, evitando reataques incorretos em ligaduras.
- Construir e validar o player primeiro no React web.
- No iOS, reutilizar o player web em uma WebView controlada. O app nativo baixa o MusicXML com o token existente e o envia ao player sem colocar o token na URL.
- Manter o compartilhamento de `.mid` nativo no iOS usando `expo-file-system` e `expo-sharing`.
- Continuar oferecendo MusicXML junto com MIDI: MusicXML é a opção preferencial para preservar edição e diagramação no MuseScore; MIDI representa principalmente a execução.

## Entrega 0 — Aprovação e contrato do MVP

Status da entrega: `Finalizada`.

Objetivo: congelar o escopo mínimo antes de adicionar dependências ou alterar a API.

Tarefas:

- [x] `Finalizada` — M0.1 Roadmap e ordem web → iOS aprovados pelo início explícito do projeto em 2026-07-27.
- [x] `Finalizada` — M0.2 Controles do MVP confirmados: reproduzir, pausar, reiniciar, progresso, andamento e download MIDI.
- [x] `Finalizada` — M0.3 Visual do MVP confirmado: partitura renderizada com destaque da nota atual e mudança/rolagem automática de página.
- [x] `Finalizada` — M0.4 Defaults definidos para MusicXML incompleto: 70 BPM e piano.
- [x] `Finalizada` — M0.5 Estratégia iOS confirmada: WebView controlada e compartilhamento MIDI nativo.
- [x] `Finalizada` — M0.6 Quatro partituras MusicXML de referência adicionadas: melodia simples, piano com acordes/pausas/acidentes/ligadura, múltiplas partes e múltiplas páginas.

Critérios de aceite:

- Escopo do MVP aprovado sem decisões técnicas bloqueadoras.
- Partituras de referência disponíveis sem restrições de uso.
- Formatos e controles esperados documentados.

## Entrega 1 — Fundação MIDI no backend

Status da entrega: `Finalizada`.

Dependência: Entrega 0 finalizada.

Objetivo: disponibilizar um `.mid` válido, seguro e compatível com MuseScore a partir de qualquer partitura convertida.

Tarefas:

- [x] `Finalizada` — M1.1 Verovio 6.1.0 instalado e fixado sem faixa de atualização no workspace da API.
- [x] `Finalizada` — M1.2 `MidiExportService` criado para carregar MusicXML, gerar bytes MIDI e rejeitar saída sem cabeçalho `MThd`.
- [x] `Finalizada` — M1.3 Helper de nome seguro criado para exportação `<nome-da-partitura>.mid`.
- [x] `Finalizada` — M1.4 Operação autorizada de exportação MIDI adicionada ao `ScoreService`.
- [x] `Finalizada` — M1.5 `GET /api/scores/:id/midi` adicionado com `audio/midi`, tamanho e attachment para download.
- [x] `Finalizada` — M1.6 Endpoint protegido pelas mesmas regras de proprietário/admin e `downloadRateLimit` do MusicXML.
- [x] `Finalizada` — M1.7 Erros seguros padronizados para MIDI não pronto, MusicXML inválido e falha de geração.
- [x] `Finalizada` — M1.8 Geração mantida sob demanda: quatro fixtures foram processadas em menos de 0,5 s na suíte local, sem justificar cache ou migration no MVP.
- [x] `Finalizada` — M1.9 Testes unitários e reais adicionados para melodia, acordes, pausas, acidentes, ligadura, canais, múltiplas partes e múltiplas páginas.
- [x] `Finalizada` — M1.10 Testes de integração cobrem sucesso, headers, autenticação, outro usuário, admin e partitura não pronta.
- [x] `Finalizada` — M1.11 Os quatro MIDIs de referência foram importados com sucesso no MuseScore 4.6.5 e reexportados como MusicXML válido.
- [x] `Finalizada` — M1.12 Build da API e suíte com 35 testes executados com sucesso em 2026-07-27.

Critérios de aceite:

- O endpoint retorna um arquivo `.mid` padrão e não uma representação base64 em texto.
- O arquivo abre no MuseScore e contém as notas das partituras de referência.
- Usuário comum não acessa o MIDI de outro usuário.
- Falhas do MusicXML retornam erro compreensível e seguro.
- Build e testes da API passam.

## Entrega 2 — Renderização da partitura na web

Status da entrega: `Finalizada`.

Dependência: Entrega 1 finalizada.

Objetivo: substituir o uso exclusivo da imagem original por uma visualização musical navegável gerada a partir do MusicXML.

Tarefas:

- [x] `Finalizada` — M2.1 Cliente web oferece operações autenticadas para obter MusicXML e baixar MIDI.
- [x] `Finalizada` — M2.2 Verovio WebAssembly 6.1.0 integrado ao Vite com versão fixa e carregamento assíncrono em chunk separado.
- [x] `Finalizada` — M2.3 Motor Verovio isolado em módulo reutilizável e independente do modal de detalhes.
- [x] `Finalizada` — M2.4 `ScorePlayer` criado com estados de carregamento, pronto, vazio e erro recuperável.
- [x] `Finalizada` — M2.5 MusicXML renderizado como SVG responsivo com `viewBox`, proporção preservada e rolagem segura.
- [x] `Finalizada` — M2.6 Navegação anterior/próxima implementada para resultados com múltiplas páginas.
- [x] `Finalizada` — M2.7 Arquivo original mantido em uma aba própria para comparação com o resultado digital.
- [x] `Finalizada` — M2.8 SVG tratado com DOMPurify, perfil SVG e remoção de scripts, eventos e referências externas.
- [x] `Finalizada` — M2.9 Sete testes cobrem carregamento, vazio, erro, SVG responsivo, sanitização, troca de página e liberação do motor.
- [x] `Finalizada` — M2.10 Typecheck, sete testes e build de produção da web executados com sucesso em 2026-07-27.

Critérios de aceite:

- Uma partitura convertida aparece como notação vetorial legível no desktop e no layout móvel da web.
- Partituras com mais de uma página podem ser navegadas.
- O usuário ainda consegue comparar o resultado com o arquivo original.
- Erro em uma partitura não derruba a tela de detalhes.
- Build da web passa.

## Entrega 3 — Reprodução e sincronização na web

Status da entrega: `Finalizada`.

Dependência: Entrega 2 finalizada.

Objetivo: tocar a partitura e mostrar visualmente a posição atual.

Tarefas:

- [x] `Finalizada` — M3.1 Motor Web Audio interno integrado; o `AudioContext` só é criado ou retomado após clique/toque do usuário.
- [x] `Finalizada` — M3.2 Reprodução, pausa, retomada, reinício, busca e encerramento limpo implementados.
- [x] `Finalizada` — M3.3 Relógio do `AudioContext` sincronizado com `getElementsAtTime` e o timemap do Verovio.
- [x] `Finalizada` — M3.4 Notas e acordes ativos recebem destaque, com remoção dos estados anteriores após cada atualização.
- [x] `Finalizada` — M3.5 Página e compasso em execução são acompanhados automaticamente sem interromper o áudio.
- [x] `Finalizada` — M3.6 Barra de progresso implementada com busca, posição atual e duração total.
- [x] `Finalizada` — M3.7 Controle de andamento implementado por escala temporal, preservando a afinação MIDI.
- [x] `Finalizada` — M3.8 Piano digital básico e 70 BPM definidos como fallback, com andamento assumido identificado na interface.
- [x] `Finalizada` — M3.9 Ações distintas `Baixar MusicXML` e `Baixar MIDI` adicionadas ao detalhe da partitura.
- [x] `Finalizada` — M3.10 MIDI nativo do Verovio usado para ligaduras, repetições, acidentes, mudanças de andamento e transposição conforme suporte do motor; quatro fixtures reais processadas.
- [x] `Finalizada` — M3.11 Áudio, timers, vozes e toolkit são liberados ao fechar, trocar de partitura ou desmontar o player.
- [x] `Finalizada` — M3.12 Botões e sliders nativos oferecem operação por teclado, rótulos e valores acessíveis.
- [x] `Finalizada` — M3.13 Testes com relógio e `AudioContext` controlados cobrem transporte, andamento, busca, descarte, destaque e gesto explícito.
- [x] `Finalizada` — M3.14 Typecheck, 28 testes, build de produção, quatro fixtures e fluxo real no navegador validados em 2026-07-27.

Critérios de aceite:

- A reprodução só começa após interação do usuário.
- Play, pausa, reinício, progresso e andamento funcionam de maneira previsível.
- Notas/acordes são destacados aproximadamente no momento em que soam.
- Mudança de página não interrompe a reprodução.
- Fechar o player interrompe completamente o som.
- Os dois formatos continuam disponíveis para download.

## Entrega 4 — Homologação da experiência web

Status da entrega: `Aguardando`.

Dependência: Entrega 3 finalizada.

Objetivo: provar compatibilidade, desempenho e comportamento com resultados reais do OMR antes de levar o player ao iOS.

Tarefas:

- [ ] `Aguardando` — M4.1 Validar manualmente o fluxo completo das partituras de referência no Safari e Firefox atuais; Chrome já homologado.
- [x] `Finalizada` — M4.2 Comparar notas, ritmos, andamento e instrumentos entre MusicXML, player e MIDI aberto no MuseScore.
- [x] `Finalizada` — M4.3 Validar MusicXML com warnings e baixa confiança do Audiveris.
- [x] `Finalizada` — M4.4 Medir tempo de carregamento, memória e responsividade em partituras longas.
- [x] `Finalizada` — M4.5 Validar layout em desktop, tablet e viewport equivalente a iPhone.
- [x] `Finalizada` — M4.6 Corrigir falhas críticas encontradas na homologação.
- [x] `Finalizada` — M4.7 Registrar limitações conhecidas de OMR, MIDI, repetições e timbres na documentação de suporte.
- [x] `Finalizada` — M4.8 Obter aprovação do comportamento web antes de iniciar mudanças no app iOS.

Critérios de aceite:

- Nenhum erro crítico nas partituras de referência e navegadores suportados.
- Limitações de fidelidade são distinguidas entre erro do OMR e erro do player.
- Uso de memória e tempo de carregamento são aceitáveis para o conjunto de teste.
- Experiência web aprovada como base do iOS.

## Entrega 5 — Exportação MIDI no app iOS

Status da entrega: `Finalizada`.

Dependência: comportamento web aprovado em M4.8. A validação manual complementar do Safari e Firefox em M4.1 permanece registrada sem bloquear o início do iOS.

Objetivo: permitir que o usuário baixe e abra o MIDI no MuseScore ou em outro app instalado.

Tarefas:

- [x] `Finalizada` — M5.1 Adicionar ao cliente mobile o download autenticado de `GET /api/scores/:id/midi` para o cache do app.
- [x] `Finalizada` — M5.2 Gerar nome local seguro com extensão `.mid` e substituir arquivo de cache antigo de forma controlada.
- [x] `Finalizada` — M5.3 Adicionar a ação `Exportar MIDI` ao detalhe da partitura sem remover `Exportar MusicXML`.
- [x] `Finalizada` — M5.4 Abrir a folha nativa de compartilhamento com MIME/UTI compatíveis com MIDI.
- [x] `Finalizada` — M5.5 Tratar ausência de apps compatíveis e erros de download/compartilhamento.
- [x] `Finalizada` — M5.6 Validar compartilhamento para MuseScore e pelo menos outro app/Files em iPhone ou simulador compatível. MIDI salvo pela folha nativa em `No Meu iPhone/Arquivos`, reconhecido como Standard MIDI formato 1 e importado com sucesso no MuseScore 4.6.5.
- [x] `Finalizada` — M5.7 Executar typecheck/build do mobile.

Critérios de aceite:

- O botão baixa o mesmo MIDI homologado na web.
- A folha de compartilhamento permite salvar em Arquivos ou enviar a um app compatível.
- MuseScore consegue importar o arquivo compartilhado.
- O usuário entende a diferença entre exportar MusicXML e MIDI.

## Entrega 6 — Player visual no app iOS

Status da entrega: `Finalizada`.

Dependência: Entrega 5 finalizada.

Objetivo: disponibilizar no iPhone o player já homologado na web sem duplicar a lógica musical.

Tarefas:

- [x] `Finalizada` — M6.1 Instalar e configurar `react-native-webview` de forma compatível com Expo Dev Client/iOS.
- [x] `Finalizada` — M6.2 Criar uma superfície web dedicada ao player, com contrato de mensagens versionado.
- [x] `Finalizada` — M6.3 Fazer o app baixar o MusicXML com `Authorization: Bearer` e enviá-lo ao player por mensagem, sem token na URL.
- [x] `Finalizada` — M6.4 Validar e limitar as mensagens aceitas entre React Native e WebView.
- [x] `Finalizada` — M6.5 Integrar o player na tela de detalhe com estados nativos de carregamento, indisponível e erro.
- [x] `Finalizada` — M6.6 Adaptar paginação, escala, rolagem e controles para toque e telas pequenas.
- [x] `Finalizada` — M6.7 Tratar interrupções de áudio, bloqueio de tela, ligação recebida, saída do app e troca de rota.
- [x] `Finalizada` — M6.8 Garantir que áudio e WebView sejam encerrados ao sair da partitura.
- [x] `Finalizada` — M6.9 Verificar VoiceOver, áreas de toque, contraste e Dynamic Type onde aplicável.
- [x] `Finalizada` — M6.10 Testar partitura longa, mudança de página e rotação permitida em dispositivo real.
- [x] `Finalizada` — M6.11 Executar typecheck, build iOS e testes manuais do fluxo completo.

Critérios de aceite:

- A partitura renderiza e toca em iPhone real.
- Destaque e áudio permanecem sincronizados dentro da tolerância aprovada na web.
- Token de autenticação não aparece na URL, HTML ou logs da WebView.
- Sair da tela sempre interrompe o áudio.
- O compartilhamento MIDI continua funcionando independentemente do player.

## Entrega 7 — Release, observabilidade e documentação

Status da entrega: `Executando`.

Dependência: Entrega 6 finalizada.

Objetivo: preparar a funcionalidade para uso real e facilitar diagnóstico após a publicação.

Tarefas:

- [x] `Finalizada` — M7.1 Adicionar métricas sem conteúdo musical sensível: sucesso/falha, duração da geração e tamanho do MIDI.
- [x] `Finalizada` — M7.2 Garantir que logs não contenham MusicXML, token, caminho interno ou arquivo MIDI em base64.
- [x] `Finalizada` — M7.3 Revisar rate limits, headers de cache e política de retenção dos arquivos temporários.
- [x] `Finalizada` — M7.4 Atualizar documentação de suporte explicando MIDI, MusicXML, compatibilidade com MuseScore e limitações do OMR.
- [x] `Finalizada` — M7.5 Atualizar política de privacidade somente se o novo fluxo alterar tratamento ou retenção de dados.
- [x] `Finalizada` — M7.6 Executar regressão de login, upload, conversão, preview, MusicXML, MIDI e player na web.
- [ ] `Executando` — M7.7 Executar regressão equivalente no iOS e preparar build de TestFlight. Testes automatizados, build e archive Release foram aprovados; faltam publicar o player web e gerar a assinatura de distribuição para o TestFlight.
- [ ] `Aguardando` — M7.8 Liberar inicialmente de forma controlada e acompanhar falhas antes da disponibilidade geral.

Bloqueio de liberação em 2026-07-28: o archive Release local foi gerado com sucesso, mas usa certificado Apple Development. Além disso, o bundle público servido por `https://converter.nossateoria.com.br/mobile/player` ainda é o artefato de 2026-07-15 e não contém a rota nem o contrato do novo player. O upload TestFlight e a liberação controlada só devem começar após o deploy conjunto da API/web, smoke test do ambiente e assinatura Apple Distribution.

Atualização em 2026-07-29: a conta Apple está conectada no Xcode como Admin, mas a equipe possui somente certificado Apple Development e está bloqueada por uma atualização pendente do Apple Developer Program License Agreement. O GitHub CLI também precisa ser autenticado novamente antes de publicar o candidato. Enquanto esses acessos não são regularizados, o CI foi ampliado para executar os testes de API, web e mobile em todo pull request.

Critérios de aceite:

- Fluxos existentes não apresentam regressões.
- Diagnóstico de falhas é possível sem registrar conteúdo sensível.
- Usuários recebem orientação clara sobre quando usar MIDI ou MusicXML.
- Build aprovado para TestFlight e liberação controlada.

## Ordem resumida de execução

1. Aprovar escopo e partituras de referência.
2. Entregar o endpoint MIDI e validar o arquivo no MuseScore.
3. Renderizar a partitura na web.
4. Adicionar áudio, sincronização e controles na web.
5. Homologar a experiência web.
6. Adicionar exportação/compartilhamento MIDI nativo no iOS.
7. Incorporar o player homologado em uma WebView controlada no iOS.
8. Fazer regressão, TestFlight e liberação gradual.

## Fora do escopo do MVP

Estes itens só devem entrar após a entrega e medição do fluxo principal:

- editor completo de notas ou correção manual do MusicXML;
- piano roll ou visual de notas caindo;
- gravação de áudio em MP3/WAV;
- instrumentos premium baseados em grandes bancos de samples;
- reprodução offline completa do player WebAssembly no iOS;
- acompanhamento de uma performance captada pelo microfone;
- sincronização colaborativa ou edição em tempo real;
- exportação direta para formatos proprietários de DAWs.

## Riscos e mitigação

| Risco | Mitigação proposta |
| --- | --- |
| Nota ou ritmo incorreto no MIDI | Comparar com o MusicXML e a imagem original; comunicar que erros do OMR se propagam para o MIDI. |
| MusicXML sem andamento/instrumento | Aplicar defaults explícitos e visíveis: 70 BPM e piano. |
| Diferença entre visual e áudio | Usar relógio único e mapeamento temporal do Verovio; testar acordes, ligaduras e mudanças de página. |
| Travamento com partitura longa | Carregar o motor de forma assíncrona, medir memória e avaliar worker/paginação antes do iOS. |
| Som pouco realista | Começar com sintetizador leve; avaliar samples licenciados como melhoria separada. |
| Token exposto no iOS/WebView | Download autenticado no código nativo e envio somente do MusicXML pelo canal de mensagens. |
| MIDI importado com diagramação diferente no MuseScore | Continuar oferecendo MusicXML como formato recomendado para edição visual. |
| Dependência externa mudar comportamento | Fixar versões, manter testes com partituras de referência e atualizar de forma deliberada. |

## Histórico de execução

| Data | Item | Alteração | Commit/PR |
| --- | --- | --- | --- |
| 2026-07-27 | Planejamento | Roadmap inicial criado; todas as tarefas permanecem `Aguardando` até aprovação. | Pendente |
| 2026-07-27 | M0.1–M0.6 | Escopo aprovado, defaults definidos e quatro partituras de referência adicionadas. | Pendente |
| 2026-07-27 | M1.1–M1.12 | Fundação MIDI concluída na API, validada por 35 testes e importação das quatro referências no MuseScore 4.6.5. | Pendente |
| 2026-07-27 | M2.1–M2.10 | Visualização digital concluída na web, validada por typecheck, sete testes, build de produção e renderização real com Verovio no navegador. | Pendente |
| 2026-07-27 | M3.1–M3.14 | Reprodução sincronizada concluída na web, validada por 28 testes, quatro partituras reais, build e interação no navegador. | Pendente |
| 2026-07-27 | M4.2–M4.7 | Semântica musical, baixa confiança, desempenho e layouts homologados; falhas responsivas e acessibilidade do modal corrigidas; limitações registradas. M4.1 continua em execução até os testes manuais completos no Safari e Firefox. | Pendente |
| 2026-07-27 | M4.8 | Comportamento web aprovado pelo usuário após teste de reprodução, acompanhamento visual, fechamento do modal e interrupção do áudio. M4.1 permanece como validação complementar não bloqueante no Safari e Firefox. | Pendente |
| 2026-07-27 | M5.1 | Cliente iOS passou a baixar o MIDI autenticado para `Paths.cache`, com token Bearer e substituição idempotente; build e lint do mobile aprovados. | Pendente |
| 2026-07-27 | M5.2 | Nome MIDI seguro e amigável adicionado; cache isolado por usuário e partitura, sobrescrita idempotente e limpeza pós-sucesso do nome anterior implementadas; nove casos de sanitização, build e lint aprovados. | Pendente |
| 2026-07-27 | M5.3–M5.5 | Tela de detalhe passou a oferecer exportações independentes de MusicXML e MIDI, com folha nativa, MIME/UTI de MIDI, estados separados, mensagens de erro e explicação dos formatos. | Pendente |
| 2026-07-27 | M5.7 | Mobile validado por 15 testes, typecheck, build nativo Xcode para iPhone 17 Pro/iOS 26.5, instalação e inicialização do bundle no simulador. | Pendente |
| 2026-07-28 | M5.6 | Fluxo completo homologado no simulador iPhone 17 Pro/iOS 26.5: exportação abriu a folha nativa, salvou `Estudo para piano.mid` em Arquivos; o arquivo foi confirmado como Standard MIDI formato 1 e importado no MuseScore 4.6.5 com piano e notas renderizadas. Entrega 5 finalizada. | Pendente |
| 2026-07-28 | M6.1 | `react-native-webview` 13.15.0 instalada pelo Expo SDK 54; autolink, codegen `RNCWebViewSpec` e CocoaPods validados. Typecheck, 15 testes e build iOS para iPhone 17 Pro/iOS 26.5 aprovados. | Pendente |
| 2026-07-28 | M6.2 | Superfície dedicada `/mobile/player` criada com contrato WebView v1, MusicXML recebido por mensagem e reaproveitamento do renderer/áudio web. Aprovada por 48 testes, typecheck e build Vite. | Pendente |
| 2026-07-28 | M6.3–M6.5 | Download MusicXML autenticado ficou restrito ao código nativo, com contrato v1 estrito, limite de 12 MiB, remoção do arquivo temporário, URL confiável e WebView protegida. Estados de carregamento, erro, indisponibilidade e retry foram integrados ao detalhe. | Pendente |
| 2026-07-28 | M6.6 | Player dedicado adaptado a `100svh`, rolagem interna da partitura, pan, pinch-zoom, retrato, paisagem e alvos de toque de 44 px, sem mover a janela durante o acompanhamento automático. | Pendente |
| 2026-07-28 | M6.7–M6.8 | Ciclo de vida nativo passou a pausar em segundo plano/interrupção, recarregar com segurança ao retornar e descartar áudio, timers e WebView ao trocar de rota ou desmontar, sem retomada automática. | Pendente |
| 2026-07-28 | M6.9 | Rótulos e estados acessíveis, alvos mínimos de 44 px, contraste AA, respeito a movimento reduzido e Dynamic Type onde aplicável foram validados; rotação ficou habilitada para iPhone e iPad. | Pendente |
| 2026-07-28 | M6.10 | Em iPhone 13 Pro Max real, uma partitura da conta renderizou e tocou com progresso e notas destacadas. Partitura longa, paginação, segunda página e rotação retrato/paisagem foram validadas também no simulador iPhone 17 Pro; a homologação corrigiu quebras de página codificadas e sanitização do SVG multipágina. | Pendente |
| 2026-07-28 | M6.11 | Entrega 6 validada com 55 testes web, 33 mobile e 35 API; builds web, mobile e API, lint, `plutil`, build Xcode de simulador e build/instalação assinada no iPhone real aprovados. | Pendente |
| 2026-07-28 | Ajuste de andamento | BPM padrão alterado de 120 para 70 em partituras sem andamento explícito, tanto no player web/iOS quanto no MIDI exportado; partituras com BPM informado continuam preservadas. | Pendente |
| 2026-07-28 | M7.1–M7.3 | Observabilidade MIDI segura adicionada às fases de geração e download; rate limit dedicado de 30 exportações por 5 minutos, headers `no-store` e limpeza de diretórios temporários antigos implementados e cobertos por testes. | Pendente |
| 2026-07-28 | M7.4–M7.5 | Suporte, compatibilidade MuseScore, limitações do OMR, App Store e política de privacidade atualizados para explicar MIDI, MusicXML e a retenção transitória. | Pendente |
| 2026-07-28 | M7.6 | Regressão web automatizada ampliada para login, lista, detalhe convertido, preview original/digital, player, upload, conversão e downloads MusicXML/MIDI; 65 testes web aprovados. | Pendente |
| 2026-07-28 | M7.7 | Regressão automatizada aprovada com 40 testes API, 65 web e 33 mobile, lint e builds completos. Archive iOS Release arm64 0.1.0 (1) gerado; tarefa continua executando porque o artefato usa Apple Development e o player ainda não está no bundle público. | Pendente |
| 2026-07-28 | M7.8 | Runbook de gates, rollout interno/externo, métricas, limites de pausa e rollback criado. A liberação permanece aguardando deploy, assinatura de distribuição e as janelas mínimas de observação. | Pendente |
| 2026-07-29 | M7.7 | Gate de CI ampliado para validar API, web e mobile. Xcode confirmou conta Admin, apenas certificado Apple Development e bloqueio por novo acordo do programa; GitHub CLI também requer nova autenticação. | Pendente |
