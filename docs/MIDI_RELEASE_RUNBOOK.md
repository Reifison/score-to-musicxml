# Plano Operacional De Liberacao MIDI E Player

Status: plano de execucao. Este documento nao comprova que uma release, um build TestFlight ou uma liberacao em producao tenham ocorrido.

## Objetivo E Escopo

Liberar de forma controlada a exportacao MIDI e o player visual na web e no iOS, observar falhas sem coletar conteudo musical sensivel e permitir retorno seguro aos artefatos anteriores.

Componentes envolvidos:

- API: geracao MIDI sob demanda e download autenticado;
- web: visualizacao, reproducao e downloads MusicXML/MIDI;
- iOS: player em WebView controlada e compartilhamento nativo dos dois formatos;
- OMR e armazenamento MusicXML existentes, que devem continuar funcionando sem regressao.

## Responsaveis E Registro

Antes de iniciar, preencher e manter no registro da release:

- responsavel pela decisao de avancar ou interromper;
- responsavel tecnico por API/web e responsavel pelo app iOS;
- commit SHA, identificador dos artefatos web/API, versao e numero do build iOS;
- ambiente, horario de cada mudanca e links para dashboard/logs;
- tamanho do grupo TestFlight e periodo observado;
- decisao tomada, evidencia e eventual incidente.

Nunca copiar para esse registro MusicXML, token, cookie, caminho interno de storage ou MIDI em base64.

## Gates Antes Da Liberacao

1. Congelar o commit candidato e registrar os artefatos anteriores que servirao para rollback.
2. Executar `npm run lint`, `npm run build`, `npm run test -w apps/api`, `npm run test -w apps/web` e `npm run test -w apps/mobile`.
3. Concluir a regressao web de login, upload, conversao, preview, MusicXML, MIDI, player, pausa e encerramento do audio.
4. Concluir a regressao iOS equivalente, incluindo compartilhamento com Arquivos/MuseScore, segundo plano, saida da tela e rotacao.
5. Confirmar build Release assinado, instalacao em dispositivo real e processamento das partituras de referencia.
6. Verificar em ambiente de homologacao `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache` e `Expires: 0` nos dois downloads, o limite MIDI de 30 requisicoes por 5 minutos e a limpeza de diretorios temporarios mais antigos que `TEMP_FILE_RETENTION_HOURS`.
7. Inspecionar amostra dos eventos `midi_export` de sucesso e falha para confirmar ausencia de conteudo musical e credenciais.
8. Confirmar que o endpoint `/health` responde e que os sinais descritos abaixo podem ser consultados.

Se qualquer gate falhar, a liberacao permanece bloqueada; registrar o resultado e corrigir antes de formar um novo candidato.

## Sequencia De Liberacao Controlada

Como o MVP nao possui feature flag por usuario, o controle do app deve ser feito por grupos TestFlight. A publicacao da API e da web afeta os usuarios autenticados desse ambiente e exige monitoramento mais proximo.

1. **Homologacao interna:** publicar API e web no ambiente de homologacao, instalar o build iOS interno e executar os fluxos completos com as quatro partituras de referencia.
2. **API e web em producao:** publicar primeiro a API, validar `/health`, autenticar, baixar um MusicXML e gerar um MIDI. Em seguida publicar a web e repetir o smoke test. Manter o build iOS ainda restrito ao grupo interno.
3. **TestFlight interno:** liberar para a equipe interna, observar por no minimo 24 horas e registrar tentativas reais de arquivos pequenos e longos.
4. **TestFlight externo limitado:** se os criterios estiverem saudaveis, convidar um grupo pequeno previamente definido. Observar por no minimo 72 horas antes de ampliar.
5. **Disponibilidade geral:** submeter o build aprovado e usar liberacao gradual quando disponivel. Revisar os sinais diariamente durante os primeiros 7 dias.

Avancar de uma fase somente com os gates registrados e aprovacao nominal do responsavel. Aumentar o grupo de forma incremental; nao substituir uma fase de observacao por ausencia de relatos.

## Monitoramento

Acompanhar separadamente por ambiente e versao:

- quantidade de tentativas, sucessos e falhas de geracao MIDI;
- taxa de falha e codigos HTTP do endpoint MIDI, distinguindo `401/403`, `409`, `422`, `429` e `5xx`;
- duracao da geracao MIDI, com mediana e percentil 95;
- tamanho do MIDI retornado e respostas anormalmente vazias;
- saude da API, CPU e memoria durante geracoes concorrentes;
- falhas de carregamento do player observadas na regressao, TestFlight e suporte;
- crashes/hangs da versao iOS e relatos de audio que continua apos sair da tela;
- regressao nos downloads MusicXML, upload, conversao e preview.

O evento estruturado emitido pela API usa `metric: "midi_export"`. Separar `phase: "generation"` de `phase: "download"`, agrupar por `status: "success" | "failure"` e usar somente `durationMs`, `sizeBytes` nos sucessos e `errorCode` nas falhas. O sink inicial escreve esse JSON no log da API; o ambiente de hospedagem deve encaminha-lo ao agregador e configurar o dashboard antes do rollout.

Consultar somente esses metadados operacionais. Uma investigacao que precise da partitura deve passar pelo suporte e por autorizacao explicita do usuario.

## Criterios Para Pausar Ou Reverter

Interromper imediatamente a ampliacao se ocorrer qualquer um destes casos:

- token, cookie, MusicXML, caminho interno ou MIDI em base64 aparecer em log;
- acesso de um usuario ao arquivo de outro usuario;
- MIDI corrompido ou MusicXML existente removido/alterado pela nova operacao;
- crash recorrente, audio que permanece ativo apos sair do player ou regressao de login/upload/conversao;
- aumento sustentado de `5xx` ou saturacao da API associado a geracao MIDI.

Como gatilho operacional inicial, investigar e pausar a fase quando houver pelo menos 5 falhas em 30 minutos e taxa de falha MIDI igual ou superior a 5%, ou quando o percentil 95 de geracao ultrapassar 5 segundos em uma janela com pelo menos 20 tentativas. Ajustar esses limites somente depois de registrar uma linha de base real; baixo volume deve ser avaliado caso a caso.

## Rollback

1. Parar novos convites TestFlight, a ampliacao do grupo ou a liberacao gradual.
2. Registrar horario, versao, sintoma e ultimo artefato saudavel, sem incluir conteudo musical.
3. Para falha web, restaurar o artefato web anterior e executar smoke test de login, lista e MusicXML.
4. Para falha de API, restaurar o artefato anterior compativel, validar `/health`, login, MusicXML e conversao. Esta feature nao exige migration; ainda assim, confirmar a compatibilidade do candidato antes do deploy.
5. Um build iOS ja instalado nao pode ser removido remotamente. Interromper sua distribuicao, manter a API retrocompativel e preparar um build corretivo. Se a falha depender do novo endpoint, restaurar uma API segura que responda de maneira controlada sem afetar os fluxos existentes.
6. Apos o rollback, confirmar que login, upload, conversao, preview e MusicXML voltaram ao estado saudavel e que nao ha audio ativo ao sair do player.
7. Documentar causa, impacto, duracao e condicao para uma nova tentativa.

Se houver exposicao de credencial ou conteudo musical, tratar como incidente de privacidade/seguranca, preservar evidencias permitidas, revogar credenciais afetadas e seguir o processo de comunicacao aplicavel antes de retomar a release.

## Encerramento Da Observacao

A liberacao controlada so pode ser considerada concluida depois de:

- todos os gates e fases estarem registrados;
- nao haver incidente critico aberto;
- os limites permanecerem saudaveis durante a janela acordada;
- suporte e politica de privacidade publicados corresponderem ao comportamento entregue;
- o responsavel registrar a decisao de disponibilidade geral.
