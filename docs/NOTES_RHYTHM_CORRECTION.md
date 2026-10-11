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
