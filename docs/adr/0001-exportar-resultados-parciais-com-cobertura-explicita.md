---
status: accepted
---

# Exportar resultados parciais com cobertura explícita

Uma conversão de várias páginas pode reconhecer parte do documento e falhar nas demais. Em 2026-10-06, o usuário decidiu permitir a exportação do MusicXML parcial com aviso destacado e identificação das páginas ausentes, preservando o material reconhecido para revisão em vez de bloquear toda a exportação. A disponibilidade do arquivo não deve ser apresentada como reconhecimento integral; a cobertura faz parte do entendimento do resultado entregue ao usuário.

Em seguida, o usuário confirmou manter a visualização e a exportação MusicXML, bloqueando player e MIDI de resultados parciais nesta etapa até haver tratamento explícito das lacunas. Essa restrição evita executar trechos separados como se fossem uma sequência completa. A implementação e a validação desta decisão permanecem pendentes.

A perda de um dos violões do duo ou de uma das duas pautas do piano foi definida pelo usuário como falha da conversão inteira, sem entrega da parte restante como parcial utilizável. Na Q24, o usuário confirmou que páginas inteiras ausentes ainda permitem parcial de duo e piano, desde que todas as pautas e partes obrigatórias de cada página disponibilizada estejam preservadas. A perda de uma pauta dentro da página não pode ser convertida em omissão silenciosa dessa página para liberar um parcial.
