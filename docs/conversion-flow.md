# Fluxo de conversão

## Escolha de OMR

A integração recomendada é Audiveris, porque é open source, roda em Linux/macOS/Windows e exporta MusicXML. A API não depende diretamente dele: a conversão passa por `OmrAdapter`, permitindo trocar para outro motor OMR, serviço externo ou pipeline próprio no futuro.

Enquanto `OMR_ENGINE=stub`, a conversão falha de propósito com uma mensagem clara. Isso evita gerar um MusicXML vazio que pareça uma conversão real.

## Estados

- `uploaded`: arquivo foi aceito.
- `queued`: conversão adicionada à fila.
- `processing`: worker iniciou leitura.
- `converted`: MusicXML salvo e liberado para download.
- `failed`: erro registrado em `errorMessage`.

## Garantias

- O arquivo original nunca define caminho físico.
- O nome original é preservado apenas como metadado e nome sugerido de download.
- Downloads passam por autenticação e autorização.
- Erros e alertas de baixa confiança são registrados no score.
- A engine real deve rodar em worker isolado, com timeout e sem concatenar input em shell.
- PDFs são divididos página por página e renderizados em resolução controlada antes do Audiveris para evitar o erro de imagem acima do limite de pixels. O app processa cada página separadamente e reúne os MusicXML gerados em um arquivo final.

## Futuro editor manual

O modelo já guarda `warnings` e `confidence`, permitindo adicionar uma tela de revisão manual antes de liberar o MusicXML final. Uma evolução natural é criar uma entidade `ConversionRevision` com versões do MusicXML e autoria das correções.
