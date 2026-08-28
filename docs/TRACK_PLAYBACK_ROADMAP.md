# Roadmap detalhado — Seleção e mute de faixas na reprodução

Última atualização: 2026-08-26.

## Objetivo

Permitir que a pessoa escolha quais partes de uma partitura serão ouvidas. Em uma peça com Piano e Flauta, por exemplo, poderá silenciar o Piano e acompanhar apenas a Flauta, sem reiniciar a música, mudar a posição, alterar o andamento ou interromper o destaque visual.

## Resultado esperado da primeira versão

- O painel **Faixas** aparece somente quando há duas ou mais faixas reproduzíveis.
- Cada faixa mostra um nome compreensível, seu estado e um botão para **Silenciar** ou **Ativar**.
- Todas as faixas começam ativas a cada nova partitura.
- Silenciar aplica uma transição curta de volume, inclusive sobre notas já agendadas; outras faixas seguem tocando no mesmo instante musical.
- Ativar volta a deixar audível a faixa imediatamente. Se uma nota já estiver sustentada, sua cauda pode voltar a ser ouvida a partir da ativação — comportamento esperado de um mixer.
- É permitido deixar todas as faixas silenciadas para estudo visual; play, progresso e destaque continuam funcionando.

Ficam fora desta versão: solo, volume individual, pan, troca automática de timbre por instrumento MusicXML, persistência da seleção e esconder trechos da notação.

## Modelo obrigatório de execução com subagentes

Cada fase deste roadmap só pode começar depois de o agente responsável dividir o trabalho entre **subagentes Luna**, conforme a especialidade necessária. O responsável permanece dono da decisão técnica, da integração e da consolidação; os subagentes Luna fazem investigação, implementação isolada, testes ou revisão independente dentro de um escopo claro.

Regras para **todas** as fases:

1. Definir no início os subagentes Luna, responsabilidade, artefato esperado e critério de aceite da fase.
2. Usar pelo menos dois subagentes Luna quando a fase tocar mais de uma área (por exemplo, áudio e parser; interface e acessibilidade; WebView e QA). Uma tarefa realmente atômica pode usar um subagente Luna especialista, desde que haja revisão independente antes de fechar.
3. Trabalhar em paralelo sempre que os escopos não se sobrepuserem; preservar mudanças já existentes no repositório.
4. Ao terminar a implementação, executar a validação prevista na própria fase e registrar resultado, comandos/testes, limitações e pendências no roadmap ou no material de QA.
5. O agente responsável revisa os resultados, resolve divergências e só então marca a fase como `Finalizada`.

Distribuição mínima por fase:

| Fase | Subagentes Luna obrigatórios por capacidade |
| --- | --- |
| 0 | Especialista em MusicXML/Verovio; especialista em MIDI e matriz de fixtures; revisor de evidências. |
| 1 | Especialista em parsing/contratos TypeScript; especialista em matching e casos ambíguos; revisor de testes. |
| 2 | Especialista em Web Audio; especialista em synth/SampleBank; QA de ciclo de vida e vazamento de nós. |
| 3 | Especialista em integração `ScorePlayer`; especialista em WebView/bridge; revisor de regressão visual e de estado. |
| 4 | Especialista em UI responsiva; especialista em acessibilidade; revisor de interação/teclado. |
| 5 | Especialista em testes unitários e integração; especialista em regressão WebView/mobile; revisor de qualidade e cobertura. |
| 6 | QA de áudio em desktop; QA em iPhone; QA em Android e acessibilidade. |
| 7 | Especialista em release/rollback; especialista em observabilidade/privacidade; dois validadores finais independentes. |

### Validação obrigatória ao final de cada fase

Antes de encerrar qualquer fase, o responsável deve pedir a pelo menos um subagente Luna que não tenha sido o autor principal daquela parte uma validação independente do resultado. A validação deve confrontar os critérios de aceite da fase e registrar:

- o que foi validado e em qual ambiente;
- testes, build, inspeção ou cenário manual executados;
- resultado esperado versus observado;
- regressões, riscos remanescentes e decisão de aprovar ou bloquear.

Se houver bloqueio, a fase permanece `Executando` com plano de correção explícito. Não é permitido marcar `Finalizada` apenas porque a implementação parece completa.

## Evidências e decisões técnicas

- Desktop e app compartilham o player em `apps/web`; no app, ele é apresentado na WebView em `/mobile/player`. A implementação será única e depois incluída no bundle mobile.
- O MusicXML continua como fonte de verdade. Verovio gera o MIDI já usado pelo player; não será criado endpoint, banco de dados, segundo OMR ou MIDI filtrado no servidor.
- Hoje `parseMidiPlayback` preserva índice de trilha, canal, programa e um `voiceId` técnico, mas ainda não existe um catálogo de partes MusicXML e o motor mistura todo áudio em uma saída única.
- O mute será feito por um barramento `GainNode` persistente por voz/faixa. Filtrar eventos antes de agendá-los não é suficiente, pois o player programa até 500 ms à frente.
- Na v1, Piano/Violão continua sendo um timbre global escolhido no player. O programa MIDI e o instrumento MusicXML servem para identificar/exibir a faixa, não para trocar seu timbre automaticamente.
- A ponte app ↔ WebView permanece na versão atual: os controles moram dentro do player compartilhado. Só ampliar a ponte se o app nativo precisar controlar faixas fora da WebView no futuro.
- O estado de mute é efêmero por sessão. Nova partitura, reload ou descarte do player inicia tudo ativo.

## Invariantes de segurança e compatibilidade

- Nunca apresentar um nome de parte como certeza se a associação com o MIDI for ambígua.
- Se não houver associação confiável, criar faixas independentes e neutras, como `Faixa 1`; nunca fundir duas vozes diferentes por conveniência.
- Eventos sem associação não desaparecem: entram em uma faixa explícita não identificada.
- Não registrar MusicXML, MIDI, notas, pitches, nome de arquivo, score ID, nome de parte ou IDs de voz na telemetria.
- O player sem suporte a barramento individual continua reproduzindo normalmente, mas não expõe um mute que não funcione.
- Os contratos existentes de pause, stop, dispose, segurança da WebView, AudioContext por gesto e descarte de nós não podem regredir.

## Modelo de referência

O desenho abaixo é o contrato-alvo. Os nomes podem mudar durante a implementação, mas as responsabilidades devem permanecer separadas.

```ts
type MusicXmlPart = {
  partId: string;
  order: number;
  label: string;
  instrumentName?: string;
  midiChannel?: number; // normalizado para 0–15
  midiProgram?: number; // normalizado para 0–127
  hasPlayableNotes: boolean;
};

type PlaybackVoice = {
  id: string;
  partId?: string;
  label: string;
  trackIndexes: number[];
  channels: number[];
  programs: number[];
  eventCount: number;
  muted: boolean;
  mappingConfidence: "exact" | "heuristic" | "fallback";
};

type TrackPlaybackCapability =
  | "per-voice-gain"
  | "single-mix"
  | "unavailable";
```

`mappingConfidence` é apenas diagnóstico interno. O usuário vê o nome seguro e não identificadores MIDI, canais ou programas.

## Fase 0 — Spike de associação MusicXML → MIDI

Status: `Finalizada`.

Objetivo: provar como a versão fixada do Verovio transforma cada tipo de parte MusicXML em trilhas MIDI antes de prometer nomes no seletor.

Atividades:

1. Criar uma matriz de fixtures com: duas partes normais; canal repetido; programa repetido; parte sem notas; parte sem nome; uma parte dividida em várias trilhas; múltiplos instrumentos; acordes; ligaduras; repetições; e três ou mais partes.
2. Para cada fixture, registrar em teste o índice, nome MIDI quando existir, canal, programa, número de notas e intervalo temporal de cada trilha emitida pelo Verovio.
3. Comparar a matriz com o `part-list` do MusicXML e documentar onde a associação é exata, heurística ou impossível.
4. Verificar e congelar em teste a conversão de canal MusicXML 1–16 para MIDI 0–15 e de programa MusicXML 1–128 para MIDI 0–127.
5. Definir o fallback aprovado quando o Verovio não carregar metadados suficientes.

Critérios de saída:

- Nenhum caso suportado depende implicitamente apenas de `trackIndex`.
- A fixture Piano/Flauta prova uma associação determinística ou aciona o fallback conservador.
- Há decisão documentada para partes divididas e para canais reutilizados.

Bloqueador: não iniciar a interface até esta fase comprovar o algoritmo de associação.

Validação concluída em 2026-08-26:

- Subagentes Luna de Verovio, fixtures e validação independente confirmaram M01–M15.
- Web: 14 testes aprovados em `musicSemantics.integration.test.ts` e `parseMidi.test.ts`.
- API: 2 testes aprovados em `verovioPhase0.test.ts`.
- Decisão: a unidade segura de seleção é a parte/trilha MIDI efetivamente emitida; instrumentos e vozes internas que o Verovio não separa não recebem mute independente.

## Fase 1 — Catálogo de partes e matching determinístico

Status: `Finalizada`.

Objetivo: transformar MusicXML e MIDI em vozes reproduzíveis, com identidade estável durante a sessão.

Atividades:

1. Criar `parseMusicXmlParts(musicXml)` em `apps/web/src/score/` com leitura tolerante a namespace e XML inválido controlado.
2. Extrair, em ordem de `part-list`, `score-part/@id`, `part-name`, primeiro `instrument-name`, primeiro `midi-channel` e `midi-program`.
3. Verificar notas reais nos elementos `<part>` e ignorar rests ao definir `hasPlayableNotes`.
4. Sanitizar e limitar rótulos: `part-name`, depois `instrument-name`, depois `Faixa N`.
5. Evoluir o parser MIDI para fornecer metadados de cada trilha e uma lista de `PlaybackVoice` além dos eventos.
6. Implementar `mapMidiTracksToParts(parts, midiTracks)` com esta prioridade:
   1. canal + programa quando a combinação for única;
   2. programa único quando o canal estiver ausente;
   3. nome de trilha/instrumento MIDI somente se a matriz da Fase 0 provar que é confiável;
   4. ordem, apenas como fallback explícito;
   5. voz `Faixa não identificada` quando ainda houver ambiguidade.
7. Agrupar várias trilhas em uma mesma voz somente quando o matching provar que pertencem à mesma parte; preservar trilhas não mapeadas como vozes distintas.
8. Tornar `voiceId` obrigatório após essa associação, mantendo fallback compatível para chamadas legadas do motor.

Critérios de aceite:

- Piano e Flauta aparecem na ordem do MusicXML na fixture de duas partes.
- Parte sem nota não aparece como faixa reproduzível.
- Canais iguais não fundem partes indevidamente.
- Eventos não mapeados permanecem reproduzíveis em uma faixa neutra.
- Testes cobrem nomes ausentes/duplicados, programas diferentes, canais repetidos, parte dividida e fallback por ordem.

Validação concluída em 2026-08-26:

- Parser de partes MusicXML, metadados MIDI e algoritmo de associação cobertos por 17 testes focados.
- Lint e build do app web concluídos.
- Validação independente confirmou associação exata para Piano/Flauta, fallback neutro para trilhas ambíguas e preservação integral dos eventos.

## Fase 2 — Contratos de áudio e barramentos por voz

Status: `Finalizada`.

Objetivo: garantir rota de volume independente para sintetizador e samples, sem duplicar bancos de áudio.

Arquitetura-alvo:

```text
evento MIDI → voiceId → GainNode da voz → saída master → AudioContext.destination
```

Atividades:

1. Adicionar ao motor uma `Map<voiceId, GainNode>`; cada voz inicia com ganho 1 e se conecta à saída master.
2. Adaptar `PianoSynth.schedule` para receber a saída da voz em vez de sempre conectar ao destino global.
3. Adaptar `SampleBank.schedule` para receber essa mesma saída por chamada, preservando cache e pré-carregamento compartilhados.
4. Manter envelopes de nota antes do barramento da voz: o ganho da voz controla o mix, sem quebrar ataque/release de oscilador ou sample.
5. Criar APIs idempotentes no `WebAudioMidiEngine`: `getVoices()`, `isVoiceMuted(voiceId)`, `setVoiceMuted(voiceId, muted)` e assinatura para alterações de voz, se a interface precisar reagir ao motor.
6. Em `setVoiceMuted`, cancelar automações futuras com segurança, fixar o valor atual e aplicar ramp linear de 5–10 ms para 0 ou 1. Não usar ramp exponencial até zero.
7. Manter o relógio e a agenda globais. Mute não faz seek, não reinicia e não remove eventos futuros da fila.
8. Limpar/desconectar todos os barramentos em `dispose`; manter estado de mute em pause, resume, seek, restart, troca de andamento e troca de timbre dentro da mesma sessão.
9. Expor capacidade: `per-voice-gain` (painel habilitado), `single-mix` (reprodução sem seletor) e `unavailable` (erro de áudio atual).

Critérios de aceite:

- Mutar uma nota sustentada remove apenas a sua faixa, sem reinício nem salto de posição.
- Acorde com duas faixas mantém a faixa não mutada audível.
- Ativar uma faixa durante o look-ahead não gera duplicação, reataque artificial ou nota presa.
- Synth e SampleBank obedecem ao mesmo mute.
- Não há nó ativo após stop, saída da tela ou dispose.

Validação concluída em 2026-08-26:

- Motor com um `GainNode` persistente por voz, ramp linear de 15 ms e limpeza dos barramentos em `load`/`dispose`.
- Synth e SampleBank recebem a saída por nota, sem duplicação de bancos de sample.
- 47 testes focados, lint e build de produção do app web aprovados.
- Revisão Luna independente aprovou mute de sustentações e eventos em look-ahead, compatibilidade de eventos legados e preservação do estado em pause, resume, seek, andamento e timbre.

## Fase 3 — Integração do estado no ScorePlayer

Status: `Finalizada`.

Objetivo: usar o catálogo e o motor no fluxo atual de carregamento de MusicXML, preservando a visualização.

Atividades:

1. Ao carregar MusicXML em `ScorePlayer`, criar catálogo de partes, renderizar o MIDI, associar vozes e carregar eventos/vozes no motor.
2. Manter no `ScorePlayer` somente o estado necessário para desenhar os controles; o motor é a fonte de verdade do mute efetivo.
3. Redefinir todas as vozes para ativas ao receber nova partitura, reload ou novo request da WebView.
4. Preservar highlights, página, rolagem, duração e progresso para todas as partes, inclusive as silenciadas.
5. Não alterar a frequência limitada de atualização de reprodução para a interface/bridge.
6. Garantir que `pause`, `stop` e `dispose` recebidos pelo bridge V1 continuam funcionando sem conhecimento de faixa.

Critérios de aceite:

- Abrir o mesmo score no desktop e em `/mobile/player` produz o mesmo catálogo de faixas.
- Seek, restart, pausa, resume, andamento e troca de timbre preservam o estado de mute da sessão.
- Recarregar ou trocar de score não deixa estado ou barramento órfão.

Validação concluída em 2026-08-26:

- Fluxo integrado: MusicXML → catálogo de partes → MIDI → associação → eventos com `voiceId` → motor de áudio.
- Catálogo de vozes é limpo na troca, recarga e desmontagem da partitura; o motor permanece como fonte de verdade do mute.
- 34 testes web e 8 testes mobile focados aprovados, além de lint nos dois apps.
- Revisão Luna independente confirmou que o player desktop e o WebView móvel compartilham o mesmo fluxo e que a bridge V1 não transporta metadados de faixas.

## Fase 4 — Interface compartilhada e acessível

Status: `Finalizada`.

Objetivo: oferecer o controle dentro de Ajustes sem criar uma versão paralela para o app.

Atividades:

1. Adicionar `tracks`/`voices`, capacidade e `onMuteChange` às props de `PlaybackControls`.
2. Inserir um `fieldset` ou região rotulada **Faixas** dentro de Ajustes apenas com duas ou mais vozes reproduzíveis.
3. Em cada linha, exibir nome, estado textual (`Ativo` ou `Silenciado`) e botão de alternância.
4. Usar rótulos completos: `Silenciar Piano` quando ativo e `Ativar Piano` quando silenciado. `aria-pressed=true` significa silenciado e deve ser coberto por teste.
5. Atualizar uma única mensagem `aria-live="polite"` por interação, como `Piano silenciado`; nunca anunciar posição ou eventos musicais.
6. Garantir alvo de toque mínimo de 44 × 44 px, foco visível, operação por Tab/Enter/Espaço, contraste suficiente e nenhuma dependência exclusiva de ícone/cor.
7. Ajustar o layout: linha no desktop, empilhado quando necessário em tela estreita/WebView, sem rolagem horizontal; testar modo imersivo e `prefers-reduced-motion`.
8. Quando houver uma única voz, ocultar o painel. Quando a capacidade não permitir mix individual, informar com clareza sem oferecer um controle inoperante.

Critérios de aceite:

- O mesmo componente aparece no desktop e no app.
- VoiceOver/TalkBack anunciam nome, estado e ação seguinte corretamente.
- O foco retorna ao gatilho apropriado ao sair do modo imersivo.
- A interface suporta todas as faixas silenciadas e áudio indisponível de maneira compreensível.

Validação concluída em 2026-08-26:

- Seletor compartilhado em Ajustes com `fieldset`, rótulos completos, `aria-pressed` e anúncio pontual em região viva.
- O painel é ocultado com menos de duas faixas e cada controle tem alvo mínimo de 44 px, sem rolagem horizontal em telas estreitas.
- 26 testes focados, lint e build web aprovados.
- Revisão Luna independente aprovou acessibilidade, estado efetivo do motor e compatibilidade integral do WebView/bridge móvel.

## Fase 5 — Testes automatizados e regressão

Status: `Finalizada`.

Objetivo: cobrir a semântica musical, o roteamento e a experiência nos dois consumidores do player.

Atividades:

1. Testes unitários do parser MusicXML, normalização de canal/programa e matching por cada nível de confiança.
2. Testes do motor com AudioContext falso verificando a criação, conexão, ramp e desconexão do ganho correto; os demais gains não devem ser alterados.
3. Cobrir mute antes do play, nota longa, acorde, look-ahead, reativação, todas as faixas silenciadas, seek, pause/resume, restart, andamento, timbre e dispose.
4. Cobrir synth, samples e fallback do sintetizador com o mesmo contrato de barramento.
5. Ampliar a integração MusicXML → Verovio → MIDI para as novas fixtures, ligaduras, repetições e múltiplas páginas.
6. Testar `ScorePlayer` e `/mobile/player` com bridge V1, background/remontagem da WebView e ausência de listeners duplicados.
7. Testar interface: painel inicialmente recolhido, `aria-pressed`, rótulos, teclado, foco, mensagem live e layout estreito.

Gates automatizados:

- Zero eventos duplicados ou underruns nas fixtures de referência.
- Jitter p95 abaixo de 50 ms nos testes controlados.
- Nenhum áudio/nó pendente após pause, stop, mudança de rota ou dispose.
- Suítes web, mobile e API verdes; build de produção do player web concluído.

Validação concluída em 2026-08-26:

- 81 testes web focados e 42 testes mobile aprovados na regressão integrada.
- Coberto o cenário adicional de todas as faixas silenciadas: o relógio segue em execução e os eventos continuam agendados com ganho zero.
- Revisão Luna confirmou cenários de mute antes do play, sustentações, acordes, look-ahead, reativação, seek, pausa/retomada, restart, andamento, timbre, descarte e synth/sample.
- Lint, build web e typecheck mobile aprovados.

## Fase 6 — Homologação auditiva e acessibilidade física

Status: `Aguardando homologação manual em dispositivos físicos`.

Preparação de builds concluída em 2026-08-26:

- Web: bundle de produção gerado e validado em `apps/web/dist`.
- Android: a tarefa Release sincroniza automaticamente o bundle web para `android/app/src/main/assets/player`; a cópia foi verificada byte a byte contra `apps/web/dist`.
- iOS: o build Release recompila e incorpora o bundle em `ScoretoMusicXML.app/player`; o artefato de simulador foi validado.
- Lint dos projetos API, web e mobile aprovado; suítes web (118), mobile (42) e API (52) aprovadas.
- Ainda é necessário instalar os binários em aparelhos físicos e executar os cenários auditivos e de VoiceOver/TalkBack desta fase.

Objetivo: validar o comportamento real de Web Audio e WebView antes da liberação.

| Ambiente | Cenários obrigatórios |
| --- | --- |
| Desktop | Chrome, Safari e Firefox; fones e alto-falante; Piano/Flauta, acordes, notas longas e repetições. |
| iPhone físico | WebView empacotada, VoiceOver, background/foreground, bloqueio/desbloqueio e interrupção por outro áudio. |
| Android físico | WebView empacotada, TalkBack, retorno à tela, mudança de orientação se suportada e ciclo de vida do app. |

Em cada aparelho, executar três vezes: mutar/ativar no começo, durante sustentação, durante acorde, perto do fim e com todas as faixas silenciadas; repetir em 40, 70 e 140 BPM, piano e violão, com seek, pausa/retomada e troca rápida 20 vezes.

Critérios de aceite:

- Sem clique perceptível, nota presa, vazamento da faixa mutada, perda da faixa restante, reinício ou salto de posição.
- A faixa remanescente segue sincronizada à partitura visual.
- Jitter p95 abaixo de 30 ms no build Release; zero underrun/duplicação na matriz de referência.
- VoiceOver e TalkBack comunicam a ação e o estado sem excesso de anúncios.

## Fase 7 — Rollout, observabilidade e rollback

Status: `Aguardando aprovação`.

Atividades:

1. Introduzir uma feature flag local/configurável para desligar o painel e preservar a reprodução atual sem migração de dados.
2. Liberar para desktop interno, depois builds mobile internos, TestFlight/Android internos, grupo pequeno e expansão gradual.
3. Manter somente métricas operacionais em memória e no relatório manual de QA: quantidade de vozes, quantidades de eventos por voz (sem IDs), alternâncias de mute, faixas mutadas, fallback de roteamento, scheduled/late/underrun/duplicate events, jitter e vozes ativas.
4. Confirmar que a bridge continua abaixo de 10 atualizações por segundo e não recebe detalhes de faixa.
5. Permitir rollback restaurando o bundle web anterior; Android deve rebundlar os assets e iOS deve incluir o build web no recurso `player` de Release.

Bloqueadores de rollout:

- faixa errada ao mutar;
- clique recorrente, crash, nota presa ou áudio após dispose;
- regressão de bridge, visualização, samples, conversão ou exportação;
- qualquer conteúdo musical ou identificador de score na telemetria.

## Gate final — validação independente e consolidação

Após a Fase 7, e antes de considerar o roadmap concluído, dois subagentes Luna independentes devem revisar o trabalho completo em paralelo:

1. **Validador técnico:** revisa o código integrado, a associação MusicXML → MIDI, o roteamento de áudio, os testes, os builds, a compatibilidade desktop/WebView e o descarte de recursos.
2. **Validador de produto e qualidade:** revisa os critérios de experiência, acessibilidade, homologação física, rollout, rollback, privacidade da telemetria e documentação de pendências.

Os dois validadores precisam entregar parecer separado com evidências, lista de achados priorizados e decisão `aprovar`, `aprovar com pendências` ou `bloquear`. Eles não validam o próprio trabalho principal.

Eu, como agente responsável, consolido os dois pareceres, resolvo ou registro formalmente cada divergência, repito as validações necessárias e entrego o fechamento final. O roadmap só é marcado como finalizado quando ambos os pareceres estão aprovados e todos os critérios abaixo foram satisfeitos.

## Definition of Done

A entrega só estará concluída quando:

- a Fase 0 comprovar a associação suportada ou acionar fallback seguro;
- cada voz reproduzível tiver uma rota de ganho independente ou o controle permanecer corretamente indisponível;
- mute/ativação preservarem relógio, posição, destaque visual e as demais faixas;
- synth e samples usarem a mesma rota por voz;
- desktop e WebView empregarem o mesmo componente e bundle validado;
- testes, builds e homologação física passarem nos critérios definidos;
- houver feature flag e rollback documentados;
- a telemetria continuar sem conteúdo musical ou dados identificáveis da partitura.

## Ordem obrigatória de execução

1. Fase 0 — prova de associação.
2. Fase 1 — catálogo e matching.
3. Fase 2 — roteamento de áudio.
4. Fase 3 — integração no player.
5. Fase 4 — interface.
6. Fase 5 — regressão automatizada.
7. Fase 6 — homologação física.
8. Fase 7 — rollout controlado.

Não inverter essa ordem: a identidade correta da faixa e a rota dos samples são pré-requisitos da interface.
