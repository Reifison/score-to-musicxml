# Caso de referência — Adelita

Este pacote preserva o PDF original legível, a conversão recebida, a cópia revisada e uma referência de eventos conferida na imagem. A revisão assistida incluiu cotejo independente; **não há homologação editorial humana nem elegibilidade para treinamento**.

O relatório e os achados estruturados estão em [docs/validation/adelita-2026-10-10](../../docs/validation/adelita-2026-10-10/REPORT.md). O vídeo auxilia a navegação; o PDF determina notas e ritmos.

| Arquivo | Função |
|---|---|
| `original.pdf` | Fac-símile Antich y Tena, chapa 361, uma página |
| `converted-original.musicxml` | Saída Audiveris recebida, conservada sem edição |
| `reviewed.musicxml` | Versão revisada; sustenido de cortesia e Fine editoriais identificados |
| `ledger.json` | 147 eventos escritos, alturas efetivas, vozes, início/duração e 12 graces |
| `case.json` | Proveniência, estado da revisão e vínculos para os achados/testes |

- [x] **Feita? Sim — Preservar as fontes e o antes/depois.**
- [x] **Feita? Sim — Registrar achados e regressões executáveis.**
- [ ] **Feita? Não — Homologar humanamente os rótulos para treinamento.**
- [ ] **Feita? Não — Usar este caso para comprovar ganho em novas peças.**

Regressão: `node --test scripts/tests/adelita-source-cases.test.mjs`. A comparação escrita usa o avaliador existente; a conferência MIDI gera uma execução real no Verovio e verifica instrumento, sequência e a distribuição de alturas contra o ledger, incluindo as notas A#4 do c.14. Os detalhes de inícios e durações do arquivo entregue ficam na prova independente do relatório.
