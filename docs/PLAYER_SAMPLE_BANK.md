# Banco de samples do player

O player agora tem uma infraestrutura de samples locais em
`apps/web/src/audio/SampleBank.ts`. Ela recebe manifestos com regiões de pitch,
pré-carrega piano e violão antes do primeiro evento, mantém os buffers em cache
durante a sessão e recusa URLs externas. Se o banco estiver ausente, falhar ao
carregar ou não puder ser decodificado pelo WebView, o `PianoSynth` continua a
reprodução com o timbre sintético atual.

## Estado atual

Os bancos padrão agora são locais e já estão conectados ao motor:

- Piano: 32 amostras AAC geradas do Salamander Grand Piano V3, de Alexander
  Holm, sob CC BY 3.0. O crédito obrigatório está em
  `apps/web/public/audio/samples/ATTRIBUTION.md` e na interface do player.
- Violão: 32 amostras AAC da articulação acústica de Shinyguitar, por Karoryfer
  Lecolds, sob CC0 1.0.

Cada instrumento possui 16 alturas-base e duas camadas de intensidade. Os 64
arquivos ocupam aproximadamente 7 MB no bundle. A seleção usa o sample mais
próximo para a nota e a camada adequada à velocidade MIDI; falhas de leitura
ainda retornam automaticamente ao sintetizador, sem interromper a partitura.

## Reprodução da preparação

Para reconstruir os arquivos a partir das fontes oficiais, execute:

```bash
bash scripts/prepare-free-audio-samples.sh
```

O script baixa apenas as amostras selecionadas, normaliza-as sem ultrapassar
`-1,5 dBTP` e converte-as para AAC-LC mono de 96 kbit/s e 44,1 kHz. Os arquivos
são gravados em `apps/web/public/audio/samples/`; o player não usa CDN durante a
reprodução. Os arquivos devem ser validados no iPhone antes da publicação.
