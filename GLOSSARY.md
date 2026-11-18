# Conversor de Partituras

Vocabulário da digitalização de partituras e do uso dos resultados para revisão, edição e estudo musical.

## Language

**Arquivo original**:
PDF ou imagem de partitura enviado pelo usuário, usado como referência para conferir o resultado da conversão.
_Avoid_: MusicXML original, resultado convertido

**Scan**:
Uma tentativa de digitalização iniciada por um envio aceito de PDF ou imagem de partitura. Continua sendo um scan mesmo quando a conversão falha; um PDF com várias páginas corresponde a um único scan.
_Avoid_: Página, conversão bem-sucedida, foto

**Conversão**:
Reconhecimento automático da notação musical do arquivo original para produzir um resultado em MusicXML.
_Avoid_: Envio, exportação MIDI, reprodução

**Resultado convertido**:
Documento MusicXML produzido pela conversão e disponibilizado ao usuário para revisão, edição ou estudo. A disponibilidade do resultado não garante fidelidade musical ao arquivo original.
_Avoid_: Partitura validada, leitura perfeita

**MusicXML revisável**:
Resultado do reconhecimento automático destinado à conferência com o arquivo original e que pode precisar de correções no editor musical.
_Avoid_: Partitura pronta sem revisão, resultado validado

**Resultado parcial**:
MusicXML revisável com páginas do original ausentes e essas lacunas identificadas, preservando as pautas e partes obrigatórias de cada página disponibilizada. Não se confunde com a perda de uma pauta ou parte instrumental obrigatória.
_Avoid_: Resultado completo, falha de integridade da partitura

**Falha de integridade da partitura**:
Resultado que perdeu uma parte instrumental obrigatória ou uma pauta necessária. Inclui a perda de um dos violões do duo ou de uma das duas pautas do piano.
_Avoid_: Resultado parcial utilizável, correção pontual

**Erro musical**:
Nota ou pausa com altura, duração, posição no tempo ou voz diferente da referência musical, ou um evento indevidamente ausente ou acrescentado.
_Avoid_: Falha técnica, alerta de captura

**Repetição simples**:
Reexecução de um trecho indicada por sinais de repetição, sem casas alternativas nem saltos para outros trechos.
_Avoid_: Casas de primeira e segunda vez, Da Capo, Dal Segno, coda

**Duo de violões**:
Neste projeto, uma partitura única para dois violões, com duas pautas em clave de sol, partes instrumentais distintas e execução coordenada.
_Avoid_: Violão solo, duas vozes de um único violão

**Pauta**:
Conjunto de linhas em que as notas e os símbolos musicais são organizados. Uma parte instrumental pode usar mais de uma pauta.
_Avoid_: Parte instrumental, voz musical

**Parte instrumental**:
Notação destinada a um dos instrumentos da partitura. No duo, Violão 1 e Violão 2 são partes distintas, embora ambos usem clave de sol.
_Avoid_: Pauta, voz musical

**Voz musical**:
Linha musical independente dentro de uma parte instrumental. Um violão pode executar várias vozes simultâneas sem constituir outro instrumento.
_Avoid_: Parte instrumental, instrumento

**Exportação MIDI**:
Representação da execução musical derivada do resultado convertido, principalmente em notas, durações, andamento e instrumentos.
_Avoid_: Nova conversão, cópia da notação original

**Reenvio**:
Novo envio aceito de um arquivo, inclusive quando ele representa a mesma partitura de uma tentativa anterior. Corresponde a um novo scan.
_Avoid_: Reprocessamento

**Reprocessamento**:
Nova tentativa de conversão do mesmo envio já aceito, sem constituir um novo scan.
_Avoid_: Reenvio

**Tentativa de conversão**:
Uma execução do reconhecimento associada a um envio já aceito, com resultado próprio: revisável, parcial ou falha.
_Avoid_: Novo scan, reenvio
