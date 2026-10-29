# Verificações restantes do candidato

Atualizado em 2026-10-07. Este documento organiza a validação que depende de referências musicais, aparelhos, credenciais ou ambiente. O [roadmap central](../PROJECT_ROADMAP.md) mantém implementação e validação separadas. Nenhuma caixa abaixo representa aprovação automática de release.

## Referências musicais — R02/R09

- [x] **Feita? Sim — Inspecionar uma amostra do acervo informado.** [Seleção e exclusões](DRIVE_SCORE_SELECTION.md), com páginas examinadas e fontes.
- [ ] **Feita? Não — Fechar 20 casos.** Cinco de melodia, piano, violão solo e duo; incluir exercícios curtos, múltiplas vozes, duas pautas de piano e duas partes simultâneas de violão.
- [ ] **Feita? Não — Conferir os MusicXML de referência.** Revisão humana com identificação de revisor e data. Um resultado do próprio OMR não serve como referência.
- [ ] **Feita? Não — Preparar 20 PDFs e 20 fotos reais alinhadas.** Preservar a notação integral de cada caso; remover capas e material fora da peça. Uma rasterização do PDF não comprova captura fotográfica.
- [x] **Feita? Sim — Rodar Audiveris real e registrar a versão/configuração em um caso.** [Sons de Carrilhões](sons-de-carrilhoes-2026-10-06/REPORT.md): versão 5.10.2, PDF real de duas páginas, fluxo real dos serviços em isolamento local e duas execuções. A sessão anterior de interface continua sendo preparada; este caso não possui referência conferida.
- [ ] **Feita? Não — Executar as 40 entradas do corpus com o motor real.** O caso adicional acima não encerra a execução nem a medição musical do conjunto.
- [ ] **Feita? Não — Medir cada arquivo e parte.** Registrar eventos esperados, ausentes, extras e incorretos, compassos/vozes/pautas, repetições simples e páginas omitidas. Uma nota com vários erros conta uma vez. Não calcular somente a média do conjunto.
- [ ] **Feita? Não — Comprovar ≤2% de eventos incorretos em cada caso exigido.** Qualquer perda estrutural em página completa reprova o caso; registrar resultados reprovados sem apagar a evidência.

## Player e acessibilidade — R18/R19/R29

- [x] **Feita? Sim — Verificar o fluxo web local com uma partitura real.** [Teste no Chrome de 2026-10-07](web-real-score-2026-10-07/REPORT.md): upload, conversão, prévia digital/original, controles do player e conteúdo das respostas de exportação. Salvamento final dos downloads do Chrome não confirmado. Não substitui medição em rede/aparelho alvo ou revisão musical.
- [ ] **Feita? Não — Registrar primeira abertura no aparelho/rede alvo.** Separar download de XML, preparação Verovio, carregamento e decodificação de cada banco. Registrar dispositivo, sistema, rede, tamanho da partitura e versão do candidato.
- [ ] **Feita? Não — Medir timbre frio e em cache.** Metas históricas: frio ≤4 s e cache ≤500 ms; realizar pelo menos três execuções. Registrar fallback com um asset indisponível e retorno ao estado normal.
- [ ] **Feita? Não — Ouvir referência real e duo em release.** Duas vozes, piano/violão, cinco minutos contínuos, pause/resume/seek, andamento, troca de timbre, background, interrupções e saída da tela.
- [ ] **Feita? Não — Homologar VoiceOver/TalkBack e texto ampliado.** Incluir controles, anúncios, foco, 200% de zoom web, alvos de toque, tablet e Back Android. Testes de componentes e capturas web não substituem aparelhos.
- [ ] **Feita? Não — Homologar câmera e compartilhamento.** PDF/foto/galeria, recusa de permissão, retomada e abertura de MusicXML/MIDI em outro aplicativo.

## Ambiente — R20/R21/R23

- [x] **Feita? Sim — Validar configuração e dependências reais isoladas.** Caddy validado, 12 migrations e cinco testes PostgreSQL aprovados, 11 verificações de queda/retorno de banco/Redis/worker e retomada de tentativa sem débito duplicado. [Relatório local](implementation-2026-10-06/REPORT.md). OMR stub não comprova conversão musical.
- [ ] **Feita? Não — Aplicar a migration em homologação com backup.** Validar scores legados como cobertura desconhecida, escolha de tipo no retry e preservação dos resultados anteriores.
- [ ] **Feita? Não — Validar HTTPS, Caddy e cookies nos hosts escolhidos.** Usar os mesmos domínios da configuração web/mobile e verificar ambos os hosts, se distintos.
- [ ] **Feita? Não — Rodar um job real depois de readiness.** `/health` só informa processo ativo. `/ready` precisa de banco/schema, Redis e worker; o job controlado comprova a conversão.
- [ ] **Feita? Não — Derrubar Redis/worker/banco de homologação e recuperar.** Upload persistido deve ser reenfileirado uma vez por tentativa, sem novo débito; readiness deve retornar 503 enquanto faltar dependência.
- [ ] **Feita? Não — Simular storage cheio/indisponível e timeout.** Não perder resultado anterior; subprocessos encerrados antes da limpeza; uma retentativa automática somente para falha temporária.
- [ ] **Feita? Não — Verificar alerta para tentativas presas e rollback.** Preservar dados da migration aditiva e restaurar um bundle compatível com bridge V1. Procedimento no [runbook](../MIDI_RELEASE_RUNBOOK.md).

## Lojas — R24/R25/R27/R28/R30

- [x] **Feita? Sim — Consultar o estado Apple atual sem alterá-lo.** [Evidência JSON](../app-store/status-2026-10-06.json): versão 1.0 rejeitada, build 6 válido, IAP `premium_unlock` pronto para envio.
- [x] **Feita? Sim — Registrar as URLs cadastradas.** Suporte `https://converter.nossateoria.com.br/suporte`, privacidade `https://converter.nossateoria.com.br/privacidade`. Em 2026-10-06 ambas devolveram o shell da aplicação; HTTP 200 isoladamente não comprova conteúdo público de suporte/privacidade.
- [ ] **Feita? Não — Publicar e verificar as páginas públicas preparadas.** Confirmar conteúdo sem login e contato `reifison@hotmail.com` nas URLs cadastradas.
- [ ] **Feita? Não — Conferir o motivo atual da rejeição e a conta de revisão.** Registrar conta de revisão válida em armazenamento seguro, sem credenciais em documentos versionados.
- [ ] **Feita? Não — Testar compra, restauração e reembolso/revogação reais.** Apple sandbox e Google Play teste, incluindo produto ausente, preço localizado, cancelamento e quarto scan.
- [ ] **Feita? Não — Conferir próximo código Android no Play/EAS.** O código local não comprova disponibilidade na loja; o iOS 7 é somente candidato local após o build 6 consultado.
- [ ] **Feita? Não — Gerar IPA/AAB e verificar assinatura/manifesto final.** Conferir certificado de upload esperado, permissões mescladas e versões do artefato. Não gerar nova chave para substituir uma credencial existente sem decisão explícita.
- [ ] **Feita? Não — Conferir App Privacy e Data Safety contra os artefatos.** O texto local e o manifesto fonte não comprovam as declarações publicadas nem permissões de bibliotecas no release.
- [ ] **Feita? Não — Enviar novo candidato às lojas.** Somente após os gates aplicáveis; a consulta de outubro não enviou build, IAP ou mensagem para revisão.
