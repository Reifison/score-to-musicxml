# Revisão visual permanente dos novos envios

A conversão executa `SourceVisualValidationService` depois do OMR e das verificações de estrutura/ritmo, antes de publicar a prévia. A etapa registra o original, o MusicXML, as imagens utilizadas e os respectivos hashes. O usuário vê propostas com antes/depois, pode aceitar, manter o resultado ou desfazer a decisão enquanto a revisão estiver aberta.

Propostas pendentes impedem a confirmação final. Uma decisão cria um novo arquivo e uma nova revisão, preserva a versão anterior, revalida a estrutura musical e atualiza a prévia. Chamadas concorrentes, revisão desatualizada, conversão em andamento e conteúdo alterado são recusados. As evidências usam os mesmos controles de acesso da partitura; a retenção elimina também as versões anteriores, inclusive após reprocessamento.

A confirmação do usuário não certifica precisão musical. `accuracyVerified` e `trainingEligible` continuam `false`. Não há treinamento automático nem aprovação automática de uma peça.

## Limites e comportamento

- A revisão visual fica limitada a **3 páginas físicas**, incluindo capas/texto, e **200 compassos de parte**. PDFs maiores podem seguir o fluxo habitual, mas esta etapa é omitida explicitamente.
- A classificação existente distingue páginas de texto/capa das páginas musicais. Não é necessário que uma capa produza notas. Falhas de cobertura musical continuam sujeitas à política de resultados parciais.
- Cada leitor tem até 60 segundos por página e saída máxima de 2 MiB. A conversão inteira mantém seu prazo e cancelamento.
- PNGs são normalizados para até 4400 px; no máximo 32 MiB por imagem e 128 MiB de evidência visual por conversão. Imagens/recortes que excedam esses limites não são marcados como conferidos.
- Ausência/falha do leitor, divergência na quantidade de partes/compassos, eventos sobrepostos ou mapeamento ambíguo deixam os trechos **desconhecidos**. A prévia utilizável não recebe nota inventada de qualidade.
- Coordenadas nativas do Audiveris servem para localizar o original, sem comprovar notas ou cobertura. Só são usadas em casos inequívocos, sem alteração de imagem, escala ou orientação.
- Alterações de altura, nota/pausa e duração simples podem virar propostas aplicáveis. Acidentes explícitos/armaduras, ritmo polifônico e notações que tornem a mudança insegura exigem revisão manual. Inserções/remoções não são aplicadas automaticamente.

## Evidência positiva sem geometria inferida — v6.1 ativa (15/10/2026)

Quando a procura horizontal não encontra uma pauta completa, `SourceImageLayout` pode preservar `status: "unknown"` e `staffBands: []` e registrar separadamente um `positiveSkewEvidence` agregado. O objeto contém somente `angleDegrees`, `staffLineCount`, `staffBandCount`, `minimumDarkRatio` e `minimumContinuityRatio`. Não contém coordenadas da imagem original. A projeção inclinada não pode preencher `staffBands`, inventar retângulos, agrupar pautas em sistemas, associar pautas a partes/compassos nem originar recortes ou propostas localizadas.

`PageContentClassifier` pode usar evidência positiva e forte de cinco linhas longas e regularmente espaçadas para classificar a página como `musical`, mesmo com a geometria de bandas horizontais desconhecida. Esse rótulo significa que há evidência de papel musical na página; não afirma que notas foram lidas, que a pauta esteja completa ou que o MusicXML corresponda à fonte. A mesma evidência impede uma decisão manual `nonmusical`, mesmo quando os hashes da decisão coincidem. Sem evidência positiva suficiente, a página permanece `uncertain`; a falta de linhas horizontais ou inclinadas nunca prova que seja capa ou texto.

Na classificação real v6.1 da primeira página do PDF do iPad build 13, a página passou de `uncertain` para `musical`, com duas bandas de cinco linhas, inclinação de 1,75°, razão mínima de pixels escuros de 0,656 e continuidade mínima de 0,62. `status` permaneceu `unknown` e `staffBands` permaneceu vazio; nenhum vínculo espacial ou recorte foi inferido. A segunda página do mesmo arquivo e as fontes SONATA e “Quem sabe?!” mantiveram o caminho rápido horizontal, sem mudança observada. A conversão anterior do iPad continua com resultado parcial: v6.1 não repetiu o OMR nem alterou o resultado existente. Os dados privados de origem permanecem em arquivos locais ignorados pelo Git; o documento registra apenas os valores agregados.

O patch foi ativado em produção em 15/10/2026 às 16:44:53 UTC (12:44:53 local), na imagem `converter-api:recognition-v6-1-20261015` (ID `d5f0fb0e9071b6c9b91149be970b4d689848e2edd6a17aab3d0e0a49c9e19646`). API e worker estão saudáveis; readiness de banco, Redis e worker está `true`. Os totais de 35 scores, 33 users, 30 entitlements, 62 usage e 16 attempts e 1.087 arquivos foram idênticos antes/depois. A primeira tentativa acionou rollback enquanto Docker reportava `starting`; após ajustar a espera pelo healthcheck, a segunda ativação passou.

A imagem v6, datada de 15/10 e anterior a v6.1, preserva o histórico dos retestes OMR completos de SONATA e “Quem sabe?!”. A v6.1 fez somente uma reclassificação real de conteúdo de página; não executou novas conversões OMR desses três PDFs. A suíte API Linux passou 348 testes, com 12 opt-ins ignorados (seis PostgreSQL e seis dependentes de fixtures MIDI). Dois grupos de testes MIDI no Mac passaram 45 casos; seis eram únicos e 39 repetidos. Com 137 web, 133 mobile e 11 Python, o total pós-ativação é 635 testes distintos. Os dados operacionais e arquivos-fonte permanecem locais e ignorados pelo Git.

## Configuração do leitor independente

Defina `SOURCE_VISUAL_READER_BIN` como caminho absoluto para um executável administrativo local. O executável precisa existir no ambiente do **worker** e ter acesso aos arquivos temporários. A imagem Docker inclui `unzip` para coordenadas nativas; um segundo motor/modelo não faz parte dessa imagem por padrão. Não copie um caminho temporário de macOS para produção.

```dotenv
SOURCE_VISUAL_READER_BIN=/opt/visual-reader/bin/reader
SOURCE_VISUAL_MAX_PAGES=3
SOURCE_VISUAL_MAX_MEASURES=200
SOURCE_VISUAL_TIMEOUT_MS=60000
```

Sem essa configuração, o estágio ainda coleta imagens disponíveis e registra a leitura independente como indisponível. O aplicativo permite conferência manual explícita; ausência de proposta não significa ausência de erro.

O processo chama o executável sem shell, passando **um argumento**: caminho de um arquivo JSON privado. A requisição contém somente a fonte; o leitor não recebe XML candidato, notas esperadas ou contagem esperada de compassos:

```json
{"version":1,"page":1,"imagePath":"/temporary/private/source.png","imageSHA256":"<64 caracteres hexadecimais>"}
```

O executável escreve somente JSON no stdout; logs vão para stderr. A resposta pode incluir `reader:{name,version,model}` para registrar a versão usada. A resposta estrita é:

```json
{
  "version": 1,
  "page": 1,
  "inputImageSHA256": "<mesmo hash da requisição>",
  "coverageComplete": true,
  "measures": [{
    "partIndex": 0,
    "measureIndex": 0,
    "keyFifths": -1,
    "rectangle": {"left": 0.1, "top": 0.2, "width": 0.8, "height": 0.15},
    "readable": true,
    "events": [{"onset": 0, "duration": 1, "voice": "1", "staff": 1,
      "kind": "note", "step": "C", "alter": 0, "octave": 4, "type": "quarter", "dots": 0}]
  }]
}
```

`partIndex` e `measureIndex` começam em zero; a posição do compasso é local à página/parte. `keyFifths` é opcional e descreve somente uma armadura explicitamente lida nesse compasso, incluindo zero; ausência não significa tonalidade de Dó. Mudanças posteriores não são copiadas para o início. `onset` e `duration` usam unidades de semínima, sem confundir BPM com duração. Pausas usam `kind:"rest"` sem altura; `chord` e `grace` são opcionais. A cobertura deve refletir a leitura independente da imagem; nunca deve ser inferida do candidato.

Sem caixa confiável de compasso, o leitor pode enviar `contextOnly:true` e somente o retângulo `{left:0,top:0,width:1,height:1}`. Nesse caso a interface mostra a página original inteira, com aviso de posição não confirmada, e não inventa um recorte.

A API verifica identidade/hash da página, resposta estrita, duplicatas e preservação da imagem após a leitura. Compara eventos somente quando a quantidade e a associação por parte/compasso são inequívocas. Concordância entre motores continua sendo evidência auxiliar.

Desde 15/10, quando as contagens divergem, o relatório conserva também `sourceMeasures`: observações da fonte com página, parte, índice local, hash da imagem e `association:"ambiguous"`. Esses registros não recebem número de compasso do XML nem propostas aplicáveis por posição. Os diagnósticos distinguem contagem divergente, armadura divergente e notas afetadas pela armadura; somente associações confiáveis recebem rótulo de compasso, preservando a anacruse `0`.

A resposta `recognitionQuality` resume as divergências para API, web e mobile sem expor logs internos. `needs_review` indica problema musical a conferir; `unverified` indica conferência ausente ou insuficiente. Cobertura de páginas e fidelidade musical continuam distintas. Não há certificado automático de precisão nem reconstrução de compassos baseada apenas na métrica.

## Decisões e versões

`POST /api/scores/:id/visual-review/decision` recebe `{revision,proposalId,decision}` com `decision` igual a `accept`, `reject` ou `undo`. O proprietário ou administrador precisa estar autenticado. A publicação usa a revisão-base como condição transacional; apenas uma decisão concorrente vence.

O histórico registra usuário, data, decisão, antes/depois, revisão-base e revisão resultante. O relatório guarda diagnósticos estruturados (`code`, página e mensagem); os códigos também aparecem no manifesto e no registro de conclusão da conversão. O manifesto preserva a fonte e a ligação ao export anterior; `review-version-N.musicxml` disponibiliza a versão anterior como evidência privada. O download final e o player permanecem sujeitos à confirmação e à cobertura da partitura.

## Feita?

As regras aprendidas na homologação selecionada passaram a integrar os novos envios: propostas de duração/figura/pontos exigem revisão manual e comparação com página inteira não autoriza correção como recorte localizado. O MIDI recebe conferência associada ao hash do XML antes da prévia e após decisões; uma divergência detectada ou ligadura insegura bloqueia áudio, preservando o XML. Aprovar com trechos desconhecidos, avisos ou resultado MIDI não verificado registra **aceite com ressalvas**, sem confirmar fidelidade musical ou elegibilidade de treinamento. [Escopo e evidências](validation/musical-learning-2026-10-07/REPORT.md).

- [x] Integrar a etapa nos novos envios e registrar evidências/limitações.
- [x] Implementar propostas, aceitar/manter/desfazer e revalidação da versão.
- [x] Integrar a interface web e mobile com evidências privadas.
- [x] Preservar versões e bloquear conflitos de revisão.
- [x] Respeitar o limite de 3 páginas para esta etapa.
- [x] **Feita? Sim — Concluir a validação da suíte pós-v6.1.** API Linux: 348 aprovados, 12 opt-ins ignorados; os grupos MIDI Mac somaram 45 aprovados, incluindo seis únicos e 39 repetidos. Total de 635 testes distintos com web, mobile e Python; detalhes acima.
- [x] **Feita? Sim — Revisar e ativar o patch `positiveSkewEvidence`.** v6.1 está ativa em produção; a página de teste foi reclassificada sem inventar geometria. Resultado da conversão e fidelidade musical continuam separados e não homologados.
- [ ] Homologar um leitor visual com fontes reais, desempenho e mapeamento confiáveis.
- [ ] Medir redução de erros em um conjunto musical independente.
- [ ] Implementar editor manual para todas as ambiguidades, vozes e sinais de navegação.
- [ ] Treinar e promover modelos a partir de referências musicalmente conferidas.

## HOMR local experimental

O adaptador `scripts/source-visual-homr-reader` usa Python 3.11+ e a versão fixa `homr[cpu]==0.7.0`. O caminho padrão é `.local/source-visual-homr/venv/bin/python`; `HOMR_PYTHON` permite indicar outro ambiente. Os modelos CPU segnet 308 e transformer 396 devem estar instalados antes dos envios. O adaptador recusa modelos ausentes e não faz download durante a conversão.

Preparação administrativa em um ambiente novo (Python 3.12 recomendado):

```sh
python3.12 -m venv .local/source-visual-homr/venv
.local/source-visual-homr/venv/bin/python -m pip install 'homr[cpu]==0.7.0'
.local/source-visual-homr/venv/bin/python -c 'from homr.main import download_weights; download_weights(False, False, False)'
.local/source-visual-homr/venv/bin/python scripts/tests/source-visual-homr-reader.test.py
```

Configure `SOURCE_VISUAL_READER_BIN` com o caminho absoluto do executável `scripts/source-visual-homr-reader` e reinicie o worker para carregar a configuração. Título/OCR são desativados; a leitura do modelo é independente e usa página inteira como contexto. HOMR/modelos indicam licença AGPL-3.0, conforme [projeto oficial](https://github.com/liebharc/homr). Esta integração local não instala o modelo no container de produção. O desempenho de uma página não garante o mesmo resultado em violão polifônico, fotos ou peças longas.

- [x] **Feita? Sim — Configurar e verificar o leitor HOMR no ambiente local**, com 32 compassos comparados e 12 propostas no teste CSM100; [evidências](validation/source-visual-review-2026-10-07/REPORT.md).
- [x] **Feita? Sim — Confirmar o leitor experimental já instalado no serviço online.** A instalação Docker ativa de 15/10 usa HOMR 0.7.0; o adaptador e os modelos foram preservados. Isso não homologa o leitor.
- [ ] **Feita? Não — Homologar o leitor em produção**, incluindo precisão em fontes independentes e associação espacial confiável.
