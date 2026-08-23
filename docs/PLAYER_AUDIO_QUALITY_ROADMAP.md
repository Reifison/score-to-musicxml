# Roadmap — Qualidade de áudio no iPhone

Última atualização: 2026-08-22.

## Objetivo

Entregar reprodução contínua no iPhone, com duas vozes audíveis simultaneamente e timbres de piano e violão com qualidade musical. O player deve preservar a posição, a sincronização visual e a segurança do fluxo atual de MusicXML e WebView.

## Decisão de arquitetura

Nesta rodada, manter o Web Audio dentro da WebView e evoluir o sintetizador para bancos de samples locais. Essa é a rota mais curta para um piano e um violão mais naturais, sem duplicar o player no app nativo.

`AVAudioEngine` fica como plano condicional. Ele será iniciado somente se os testes com samples ainda mostrarem travadas, perda de eventos ou limitações da WebView no iPhone.

## Estado de partida

- `Finalizada` — O motor agenda 500 ms à frente e percorre os eventos de forma incremental.
- `Finalizada` — Atualizações de interface e ponte são limitadas a 10 por segundo durante a reprodução.
- `Finalizada` — O usuário pode selecionar Piano ou Violão; os dois timbres atuais ainda são sintetizados, não gravados.
- `Finalizada` — Eventos preservam trilha, canal, programa e identificador de voz; a telemetria permanece somente em memória e não contém conteúdo musical.
- `Finalizada` — Piano e violão gravados foram incluídos como samples locais compactos, com cache, pré-carregamento, créditos e fallback seguro para o sintetizador.
- `Finalizada` — A suíte web passa com 77 testes; a suíte completa do projeto passa com 151 testes.
- `Executando` — A versão local está instalada no iPhone físico; ainda falta a validação auditiva humana da partitura que apresentou a falha.

## Fase 0 — Candidato e linha de base

Status: `Executando` — instalação e conectividade local concluídas; validação auditiva pendente.

Responsável: Luna de QA/Xcode, com revisão do responsável técnico.

1. Congelar um commit candidato e registrar SHA, URL HTTPS do player, versão/build iOS, aparelho e iOS usados.
2. Publicar o player web de forma compatível com o bridge V1 atual.
3. No iPhone real, gravar tela e áudio das quatro fixtures de referência e da partitura que apresentou a falha.
4. Repetir play, pause, resume, seek, troca de timbre, andamento, saída da tela, background e bloqueio do aparelho.

Critérios de aceite:

- A primeira nota soa sem atraso perceptível.
- Não há áudio persistente após pause, saída, background ou dispose.
- A partitura de duas partes toca as duas notas simultâneas.
- Não há crash, tela branca ou erro de bridge/`AudioContext` no console.

## Fase 1 — Vozes e telemetria de reprodução

Status: `Finalizada` para a instrumentação e os testes automatizados; a medição de referência no aparelho permanece na Fase 3.

Responsável: Luna de áudio.

1. Preservar `trackIndex`, `channel`, `program` e um identificador de voz no evento de reprodução.
2. Registrar somente métricas operacionais: eventos esperados/agendados, eventos duplicados ou atrasados, menor horizonte de agendamento, jitter, vozes ativas e frequência da bridge.
3. Não registrar MusicXML, MIDI, notas, nomes de arquivo, token ou qualquer conteúdo musical.
4. Criar testes para duas trilhas, acordes, sobreposições, ligaduras, seek no meio de nota e descarte completo.

Critérios de aceite:

- Zero duplicação ou perda de evento no conjunto de referência.
- Horizonte de áudio sempre acima de 250 ms, com alvo de 300 ms ou mais.
- Jitter p95 do agendador abaixo de 50 ms.
- Interface e bridge não excedem 10 atualizações por segundo.

## Fase 2 — Timbres reais por samples

Status: `Finalizada` — assets gratuitos e distribuíveis incluídos; homologação auditiva permanece pendente.

Dependência: aprovar a fonte e a licença dos samples.

Responsável: Luna de áudio.

1. Selecionar e documentar bancos de piano e violão com licença compatível para distribuição no app. ✓
2. Incluir os assets localmente, sem CDN durante a reprodução, e registrar atribuição quando aplicável. ✓
3. Criar backend de samples com `AudioBufferSourceNode` e `GainNode`, mantendo o sintetizador atual apenas como fallback técnico. ✓
4. Pré-carregar o instrumento antes do primeiro play, cachear a sessão e nunca buscar assets no meio da execução. ✓
5. Usar múltiplas regiões de pitch, no mínimo duas camadas de velocity para piano e decaimento natural para ambos os instrumentos. ✓
6. Informar que o primeiro play prepara os bancos e permitir a troca mantendo a posição musical. ✓

Metas:

- Primeiro carregamento de instrumento em até 4 s.
- Instrumento já carregado pronto em até 500 ms.
- Cada banco preferencialmente abaixo de 15–20 MB comprimidos.
- Falha de asset retorna automaticamente ao sintetizador sem interromper a partitura.

## Fase 3 — Homologação física

Status: `Aguardando`.

Responsável: Luna de QA/Xcode.

Executar, em Release, no iPhone que revelou a falha e em um segundo aparelho suportado:

1. Melodia simples, duas partes, acordes/ligaduras, múltiplas páginas e a partitura real.
2. Piano e violão em 40, 70 e 140 BPM; velocidades 0,5×, 1× e 2×.
3. Cinco minutos de reprodução contínua para cada timbre.
4. Pause, resume, seek, mudança de andamento e troca de timbre.
5. Background, bloqueio/desbloqueio, retorno à rota, interrupção por outro áudio e rede instável após pré-carregamento.
6. VoiceOver, foco, contraste, Dynamic Type, alvos de toque de 44 pontos e ausência de texto cortado.

Critérios de aceite:

- Três execuções por partitura sem travada audível.
- Duas vozes permanecem audíveis do início ao fim.
- Nenhum acorde parcial, nota presa, repetida, deslocada ou cortada.
- A troca de timbre não reinicia a partitura.
- p95 de atraso de agendamento abaixo de 30 ms e zero underrun registrado.
- Áudio, memória e vozes retornam ao estado inicial ao sair da tela.

## Fase 4 — Release controlado

Status: `Aguardando`.

Seguir os gates de [MIDI_RELEASE_RUNBOOK.md](./MIDI_RELEASE_RUNBOOK.md):

1. Homologação interna com web publicada e build Release.
2. TestFlight interno, 3–5 pessoas, por 24 horas.
3. TestFlight externo limitado, 10–20 pessoas, por 72 horas.
4. Ampliação gradual e acompanhamento diário por sete dias.

Pausar o rollout imediatamente se houver travada reproduzível, perda de voz, crash, áudio persistente, falha de bridge, regressão de conversão/exportação ou exposição de credenciais/conteúdo musical.

Para rollback, restaurar primeiro o bundle web anterior compatível com o bridge V1; para um problema nativo, interromper a distribuição do build e preparar correção.

## Fase condicional — Áudio nativo com AVAudioEngine

Iniciar somente se a Fase 3 falhar apesar de samples locais pré-carregados.

Escopo:

1. Criar módulo Expo em Swift com `AVAudioEngine` e `AVAudioUnitSampler`.
2. Carregar o MIDI autenticado no lado nativo e criar um sampler por voz/canal quando necessário.
3. Tornar a WebView exclusivamente visual, recebendo snapshots nativos de posição a até 10 Hz.
4. Implementar transporte, seek, andamento, timbre, interrupções de `AVAudioSession` e descarte nativo.
5. Validar novamente toda a Fase 3 antes do TestFlight.

## Ordem de execução imediata

1. Executar a Fase 0 no iPhone físico com a versão local já instalada e registrar a linha de base auditiva.
2. Publicar o player web somente depois da aprovação dessa validação local.
3. Repetir a Fase 3 usando piano e violão gravados locais.
4. Só liberar para TestFlight após a Fase 3 aprovada.
