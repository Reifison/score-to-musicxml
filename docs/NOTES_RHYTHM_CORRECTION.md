# Correção de notas e ritmo

O caso Adelita passou a orientar regressões de altura escrita, início e duração dos eventos. O escopo desta rodada inclui notas, pausas e notas de graça; dedilhados, dinâmicas, crescendos e outros acessórios não são critérios de correção.

## Regras aplicadas

- Reparos de ritmo preservam o inventário de alturas e os eventos anteriores ao trecho corrigido. Uma pausa excedente no fim do compasso só pode ser limitada quando a alteração cabe na métrica e não cria sobreposição. Os testes incluem a seleção de candidatos do compasso 4.
- A comparação visual preserva multiplicidade, pauta, altura, início e duração, sem tratar rótulos arbitrários de voz ou acorde como divergência musical. Uma associação ambígua exige revisão manual.
- Uma referência revisada pode ser reutilizada somente para os mesmos bytes da fonte, proprietário e tipo de partitura, com autorização explícita registrada. O manifesto deve apontar para a revisão atual, e o MusicXML passa pelas verificações estruturais e MIDI antes da entrega.
- O reaproveitamento de referência fica identificado como tal. Ele não representa novo reconhecimento OMR, validação visual independente ou treinamento de um modelo.

## Referências de regressão

As fixtures portáteis dos testes preservam o PDF de domínio público de Adelita, as versões MusicXML necessárias e os hashes de proveniência. Os arquivos operacionais de produção, capturas de sessões, registros de usuários e resultados volumosos permanecem fora do Git.

A revisão assistida não tem homologação editorial humana. A comparação com a própria referência comprova reprodução da referência; não mede precisão em novas peças.

## Feita?

- [x] **Feita? Sim — Implementar limites para reparos de ritmo e preservação das alturas.**
- [x] **Feita? Sim — Comparar notas e tempos sem depender de rótulos arbitrários de voz.**
- [x] **Feita? Sim — Reutilizar referências privadas com verificação de identidade e autorização.**
- [x] **Feita? Sim — Registrar regressões executáveis para Adelita.**
- [ ] **Feita? Não — Homologar a referência com revisão editorial humana.**
- [ ] **Feita? Não — Medir redução de erros em peças independentes.**

Para os limites gerais da leitura visual, consulte [SOURCE_VISUAL_REVIEW.md](SOURCE_VISUAL_REVIEW.md).

## Plano para SONATA e “Quem sabe?!” — 15/10/2026

Esta etapa trata de reconhecimento, cobertura de compassos, ritmo e armadura, com preservação dos sinais já reconhecidos. Os arquivos originais e as saídas de 12–13/10 ficam como base imutável para comparação. Os números esperados das peças pertencem às referências de teste; a lógica do conversor deve funcionar a partir da fonte de qualquer peça suportada.

### v7 — recuperação automática em produção — 15/10/2026

O v7 acrescenta reconciliação automática geral, sem regras por título, hash, nome de arquivo ou contagem esperada destas peças. A elegibilidade atual é restrita a partituras de uma parte/pauta/voz, páginas 1–3 e até 200 compassos, com exatamente dois candidatos Audiveris saudáveis. A leitura independente HOMR recebe apenas a imagem original. As caixas nativas são projetadas por transformações de recorte e preenchimento vinculadas aos hashes dos pixels. A inserção de pausas de colcheia que só aparecem na leitura independente exige evidência positiva do glifo na própria página; cada alteração também precisa passar as guardas estruturais, espaciais e métricas do reconciliador.

- [x] **Feita? Sim — Implementar reconciliação automática local com limites gerais e proveniência.** O XML derivado preserva o restante da base e registra a fonte, os candidatos e as alterações. O resultado continua exigindo revisão: `accuracyVerified` e `trainingEligible` permanecem falsos.
- [x] **Feita? Sim — Retestar o pipeline completo localmente nas duas fontes.** SONATA terminou com 37 compassos/148 tempos e nove operações: inserção do compasso 4, armadura de dois bemóis desde o início, seis alterações para Mi♭ nos compassos 2–3 e um Ré4 de colcheia no compasso 5. A comparação central informa 199 eventos coincidentes com a cópia assistida; o resultado geral ainda pede revisão.
- [x] **Feita? Sim — Reprocessar localmente “Quem sabe?!” até a saída automática.** A conversão terminou com 52 registros de compasso, incluindo a anacruse 0 e os compassos 1–51, 205 tempos e 12 operações: armadura de um bemol, cinco pausas iniciais de colcheia nos compassos 1–4 e 6, três alterações para Si♭4 no compasso 4 da numeração da fonte, remoção das pausas excedentes nos compassos 17 e 47 e restauração da fermata no 32. A saída permanece aguardando revisão humana integral; a comparação com a cópia assistida está registrada na atividade seguinte.
- [x] **Feita? Sim — Validar localmente o código do v7.** Passaram 390 testes API e 17 testes Python; seis testes de banco opt-in foram ignorados. Build e lint locais passaram. Web e mobile não mudaram nesta rodada.
- [x] **Feita? Sim — Comparar semanticamente a saída v7 de “Quem sabe?!” com a cópia assistida.** Os 52 registros de compasso (anacruse 0 e compassos 1–51), 223 notas/pausas e 205 tempos coincidem em altura e duração com a cópia assistida. Os controles 5, 13–15 e 49 também coincidem com o candidato automático original. Direções, barras e instruções de impressão foram preservadas da base. A cópia assistida é uma comparação, não uma referência editorial; a revisão humana integral segue pendente. [Relatório local](../tmp/recognition-fix-2026-10-15/automatic-v7/QUEM_SABE_SEMANTIC_COMPARISON.md).
- [ ] **Feita? Não — Fazer a revisão editorial humana integral das duas saídas.** Ambas continuam marcadas para revisão; nem a comparação automática nem o resultado MIDI certificam fidelidade à imagem.
- [ ] **Feita? Não — Validar a lógica em outras partituras e formatos dentro do suporte declarado.** Os dois retestes demonstram funcionamento nestas fontes, não acurácia geral ou redução de erros no corpus.
- [x] **Feita? Sim — Retestar as duas fontes na imagem Linux do servidor.** SONATA: 37 compassos, nove operações, 313,334 s; “Quem sabe?!”: 52 registros, 12 operações, 420,680 s. Todos os eventos escritos, armaduras e durações coincidem com os retestes locais; ambos os MIDIs passaram. Testes isolados, arquivos de origem montados somente para leitura e nenhuma cota consumida.
- [x] **Feita? Sim — Ativar o v7 no servidor e verificar a implantação.** Ativação em 15/10 às 19:38:23 UTC (15:38:23 local), imagem `converter-api:recognition-v7-20261015`, ID `85e3b67c241345f7353a0d2ce7d2c6ac1ffd722ab3018ae3ce1414628b991d73`. API/worker saudáveis e leitor independente habilitado; nove arquivos de runtime conferidos, cinco tabelas e 1.087 arquivos preservados, cópia de segurança e reversão disponíveis. Linux: 384 testes API e 17 Python aprovados, 12 opt-ins ignorados; seis testes MIDI únicos passaram no Mac. Evidência em `validation/recognition-fix-2026-10-15/server/automatic-v7/`.
- [ ] **Feita? Não — Validar um novo envio nos aparelhos com o serviço v7.** O build 13 foi preservado: 115 hashes de fonte iguais e o mesmo IPA; os testes anteriores do scanner permanecem válidos em seu escopo.
- [ ] **Feita? Não — Preparar ou enviar um build atualizado à Apple.** O reteste local não altera o build 13, não comprova fluxo em aparelho e não constitui upload ou submissão.

Os resumos e artefatos locais permanecem em `tmp/recognition-fix-2026-10-15/automatic-v7/full-pipeline/`, ignorados pelo Git. A evidência Linux e da ativação fica em `validation/recognition-fix-2026-10-15/server/automatic-v7/`. O histórico v6/v6.1 abaixo identifica as etapas anteriores. Os PDFs para conferência estão em `output/recognition-automatic-2026-10-15/`.

### Histórico v6/v6.1 e build 13 — Feita?

- [x] **Feita? Sim — Reproduzir localmente as perdas e preservar os candidatos.** Duas fontes originais, variantes integral/limpa, Audiveris 5.10.2/5.11.0, HOMR 0.7.0, hashes das imagens e projetos `.omr` preservados. O primeiro sistema da SONATA tem três blocos no original e quatro no limpo; um bloco original cobre os compassos 3 e 4 da fonte. A versão 5.11.0 também revelou exportação incompleta com saída de processo zero.
- [x] **Feita? Sim — Identificar a instalação ativa do servidor.** Docker `notes-rhythm-v5`, Node 22.23.2, Audiveris 5.10.2 e leitor HOMR já ativo. Os processos PM2 pertencem a uma instalação legada. As 13 migrations estão aplicadas; o schema e as dependências da API coincidem com o workspace.
- [x] **Feita? Sim — Conferir os trechos defeituosos contra as imagens.** Gabarito assistido de 13 compassos da SONATA e 20 de “Quem sabe?!”, com identidade por hash. No 47 de “Quem sabe?!”, a fonte mostra pausa de semínima, C4 de semínima com fermata e pausa de mínima; a pausa de colcheia excedente foi identificada.
- [ ] **Feita? Não — Homologar editorialmente as duas páginas completas.** O gabarito assistido cobre os trechos declarados; ainda não é referência ouro humana nem avaliação de todo o repertório.
- [x] **Feita? Sim — Rejeitar exportações incompletas e conservar evidência nativa.** Erros de visita/exportação do Audiveris impedem a seleção mesmo com código de saída zero; falhas de posicionamento rítmico continuam no diagnóstico final. Logs de evidência são reduzidos a códigos seguros, sem texto OCR ou caminhos privados.
- [x] **Feita? Sim — Comparar os motores e as preparações antes de promovê-los.** A limpeza recupera conteúdo inicial, mas introduz perdas em outros compassos. HOMR perde sinais de dinâmica e contexto de instrumento e erra acidentes locais. Nenhuma dessas saídas integrais foi promovida como substituta.
- [x] **Feita? Sim — Ampliar a conferência de armadura e cobertura de compassos.** O leitor informa somente armaduras explícitas; o serviço compara a indicação e as alturas afetadas quando há associação confiável. Compassos observados apenas na fonte ficam registrados como ambíguos, sem propostas associadas por um índice deslocado.
- [x] **Feita? Sim — Implementar reparo assistido com precondições verificáveis.** Ferramenta separada do OMR, vinculada aos hashes da fonte/base e aos eventos esperados. Mudanças locais preservam o restante do XML; vozes, acordes e fragmentos ambíguos são recusados. Não há ativação automática por título ou hash de uma peça.
- [x] **Feita? Sim — Gerar cópias assistidas para os dois casos.** SONATA: 37 compassos/148 tempos, armadura inicial e eventos declarados corrigidos. “Quem sabe?!”: 52 registros/205 tempos, armadura, pausas e fermata nos pontos identificados. As 21 operações têm histórico; XML/MIDI passaram nas verificações internas. Originais preservados.
- [x] **Feita? Sim — Implementar recuperação automática para as classes suportadas e retestá-la nestes dois casos.** O v7 alinhou caixas nativas à fonte, recuperou o compasso omitido da SONATA e reconciliou mudanças de armadura, alturas e pausas por evidência independente. A implantação foi verificada; validação ampliada e homologação humana continuam separadas na seção v7 acima.
- [x] **Feita? Sim — Mostrar as incertezas na API, web e mobile.** `Revisar partitura` identifica divergências; `Conferir original` identifica ausência/limite de conferência. Cobertura parcial de páginas mantém seu aviso próprio. Normalização rotineira do violão não vira perda musical, e a API não devolve mensagens internas.
- [x] **Feita? Sim — Executar regressões locais antes e depois do patch v6.1.** A rodada do build 13, antes do patch, teve 631 testes aprovados (350 API, 137 web, 133 mobile e 11 Python) e seis testes PostgreSQL opt-in ignorados. Após v6.1, passaram 635 testes distintos: API 354 (348 Linux e seis testes MIDI únicos no Mac), web 137, mobile 133 e Python 11. No Linux, os 348 testes API passaram com 12 opt-in ignorados (seis PostgreSQL e seis dependentes de fixtures MIDI); os dois grupos MIDI no Mac tiveram 45 aprovações, das quais 39 repetiam casos já contados. Builds e TypeScript locais passaram. A execução OMR v6 mantém 36 compassos na SONATA e 52 em “Quem sabe?!”; v6.1 não refez essas conversões nem certifica fidelidade.
- [x] **Feita? Sim — Preparar o build 13 e instalá-lo nos aparelhos.** Archive e IPAs assinados preservados. Instalação 1.0(13) confirmada no iPhone e no iPad; abertura confirmada no iPhone.
- [x] **Feita? Sim — Confirmar manualmente a abertura do build 13 e a prévia de duas páginas no iPad.** Em 15/10/2026, Reifison respondeu **“Abriu e mostrou as duas páginas”**. A tentativa automática anterior foi bloqueada por `Locked`; a confirmação manual posterior resolve a pendência de abertura.
- [x] **Feita? Sim — Conferir o PDF de duas páginas enviado pelo scanner no iPad build 13 e registrar o resultado.** O usuário confirmou o nome do arquivo enviado; a conferência do conteúdo o associa à partitura “CORAL SANTO ANTÔNIO”. O arquivo tem duas páginas A4 e 4.111.542 bytes; na execução original v6, ambas foram processadas e nenhuma página ficou ausente, mas a primeira foi marcada incerta e o resultado foi parcial. A classificação v6.1 posterior mudou a página para `musical` sem refazer ou alterar essa conversão. Isso confirma o fluxo até um resultado parcial, sem homologar a música. A evidência operacional detalhada fica local e ignorada pelo Git em `docs/validation/recognition-fix-2026-10-15/server/ipad-build13-pdf-verification.json`, com a imagem de origem em `docs/validation/recognition-fix-2026-10-15/server/ipad-build13-page-1.jpg`.
- [x] **Feita? Sim — Corrigir e validar a classificação incerta da primeira página de CORAL SANTO ANTÔNIO.** Na avaliação real isolada v6.1, a página mudou de `uncertain` para `musical`, sem coordenadas ou associação inventada; a geometria continua `unknown` e `staffBands` vazio. A ativação está concluída. A conversão original permanece parcial e não foi refeita; isso resolve a classificação da página, não a homologação musical.
- [x] **Feita? Sim — Preservar o histórico da atualização v6 de 15/10, anterior a v6.1.** A imagem `recognition-v6-20261015` serviu aos retestes OMR integrais isolados de SONATA e “Quem sabe?!”; seus resultados e as 1.058 entradas verificadas permanecem como evidência histórica.
- [x] **Feita? Sim — Ativar e verificar tecnicamente v6.1 em produção em 15/10/2026, 16:44:53 UTC (12:44:53 local).** A imagem `converter-api:recognition-v6-1-20261015` (ID `d5f0fb0e9071b6c9b91149be970b4d689848e2edd6a17aab3d0e0a49c9e19646`) atende API e worker; ambos estão saudáveis e readiness de banco, Redis e worker está `true`. Os totais observados (35 scores, 33 users, 30 entitlements, 62 usage, 16 attempts) e 1.087 arquivos são idênticos antes/depois. A primeira tentativa foi revertida pelo healthcheck enquanto o Docker ainda estava `starting`; após ajustar a espera, a segunda ativação passou. A evidência operacional permanece local e ignorada pelo Git.
- [x] **Feita? Sim — Conferir o PDF binário de duas páginas e registrar o envio/resultado no iPad build 13.** A conferência do arquivo A4 confirmou duas páginas; ambas foram processadas, sem páginas ausentes. Na conversão v6 original, a página 1 foi marcada incerta e o resultado foi parcial. A classificação isolada v6.1 passou essa página para `musical`, sem refazer o OMR nem alterar o resultado parcial. A música permanece sem homologação.
- [x] **Feita? Sim — Confirmar cancelamento, reabertura do scanner e prévia de duas páginas no iPhone/build 13.** Em 15/10, o usuário respondeu à sequência solicitada: “Abriu novamente e mostrou as duas páginas”. A validação termina em “Conferir partitura”; o PDF binário, envio e resultado desse novo teste no iPhone não foram conferidos.
- [ ] **Feita? Não — Validar permissão negada e recuperação pelos Ajustes.** Permanecem sem confirmação esse caminho, cancelamento/reabertura no iPad e toques rápidos.
- [ ] **Feita? Não — Validar compra e restauração no sandbox.** O suporte a IAP está incluído no build; a compra real de teste permanece pendente.
- [ ] **Feita? Não — Fazer upload e reenviar o build à Apple.** A prévia e o resultado parcial do iPad não comprovam upload ou submissão.

### Critérios de aceite — Feita?

| Feita? | Caso | Evidência exigida |
|---|---|---|
| ☐ Não | SONATA, primeira página | 37 compassos correspondentes à fonte; quatro compassos/16 tempos no primeiro sistema e seis/24 no segundo; armadura de dois bemóis desde o início e alturas coerentes; conferência de notas/pausas e preservação das repetições/dinâmicas. |
| ☐ Não | “Quem sabe?!” | Conferir a página inteira, além dos 20 compassos do gabarito assistido. As correções locais já recuperam um bemol inicial, pausas de 1, 2, 3, 4 e 6, resolvem as pausas excedentes de 17/47 e restauram a fermata de 32. O 47 foi desambiguado contra a imagem em 15/10. |
| ☐ Não | Regressões gerais | Anacruses, mudanças de tonalidade/métrica, acordes e múltiplas vozes preservados; nenhum reparo automático motivado somente por preencher a duração esperada. Sem piora constatada na amostra de referência. |
| ☐ Não | Entrega e validação real | Evidência dos candidatos/versões, arquivos anteriores preservados, avisos pertinentes visíveis e teste real do conjunto implantado. Cada conclusão mantém seu escopo de validação. |

### Recursos e dependências

Reutilizar o motor, modelos, diretórios de teste/build e caches já existentes. Manter os originais e entregas anteriores. O acesso ao servidor foi recuperado pelo painel do usuário; os testes operacionais continuam separados das conversões da conta. [Relatório de 15/10](validation/recognition-fix-2026-10-15/REPORT.md), [cópias assistidas](../output/recognition-review-2026-10-15/README.md) e [build 13](APP_STORE_RESUBMISSION_2026-10-12.md).

Bases técnicas: [preparação de imagens no Audiveris](https://audiveris.github.io/audiveris/_pages/guides/advanced/scanning/), [detecção de pautas e barras](https://audiveris.github.io/audiveris/_pages/explanation/steps/grid/), [armadura no MusicXML](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/key/) e [duração no MusicXML](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/duration/).
