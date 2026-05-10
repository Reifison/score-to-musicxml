# Guia De Qualidade Para Fotos De Partitura

Este guia registra exemplos e criterios para orientar testes manuais, suporte e melhorias futuras do scanner.

## Imagens Que Tendem A Funcionar Bem

- Partitura ocupando quase toda a foto, com margens pequenas.
- Folha plana, sem dobras fortes e sem ondulacao.
- Foto tirada de frente, com pouca inclinacao de perspectiva.
- Iluminacao uniforme, sem sombra de mao, celular ou estante sobre as notas.
- Fundo contrastante com a folha.
- PDF exportado de editor musical ou digitalizacao limpa em alta resolucao.
- Uma pagina por upload quando possivel.

## Imagens Que Tendem A Falhar

- Foto escura, borrada ou com reflexo.
- Folha muito pequena dentro da imagem.
- Angulo muito lateral, deixando a pagina em trapezio forte.
- Partitura cortada nas extremidades.
- Varias paginas na mesma foto.
- Anotacoes, manchas, rasuras ou carimbos cobrindo pauta e notas.
- Baixa resolucao ou compressao agressiva.
- PDF com imagem de foto ruim embutida.

## Decisao Sobre Recorte E Perspectiva

Para o MVP iOS, o app usa recorte manual via `expo-image-picker` com `allowsEditing`. A correcao automatica de perspectiva fica como melhoria posterior porque normalmente exige uma biblioteca nativa de visao computacional ou um fluxo de document scanner que deve ser validado em dispositivo real.

Critérios para escolher uma biblioteca futura:

- Funcionar em Expo Dev Client/EAS sem quebrar o fluxo iOS.
- Detectar bordas da folha com baixa taxa de falso positivo.
- Permitir ajuste manual quando a deteccao automatica falhar.
- Preservar resolucao suficiente para OMR.
- Nao reter imagens em servicos de terceiros sem consentimento explicito.
- Ter manutencao ativa e licenca compativel com app comercial.

