# Conversor de Partituras

<!-- impeccable:product-schema 1 -->

## Product purpose

O Conversor de Partituras transforma fotos, imagens e arquivos PDF de partituras em MusicXML para que músicos, professores e estudantes possam revisar, editar e compartilhar o resultado em seus editores musicais.

## Users

- Músicos que querem reaproveitar uma partitura impressa em fluxo digital.
- Professores que digitalizam material para estudo e preparação de aulas.
- Estudantes que precisam abrir a partitura em editores como MuseScore.
- Administradores que acompanham usuários, conversões e auditoria.

## Operating Context

Web e aplicativos móveis são ferramentas autenticadas para digitalizar partituras e entregar o resultado escolhido automaticamente. O usuário pode editar o arquivo em ferramentas como MuseScore, sem uma etapa obrigatória de aprovação no conversor. O usuário informou o acervo do Drive e o contato definitivo reifison@hotmail.com em 2026-10-06. As fontes do acervo ainda precisam de referências MusicXML conferidas para a validação musical.

## Platform

Aplicativo iOS em React Native/Expo para iPhone e iPad, com layout adaptável para o simulador iPhone Duo disponível no ambiente. A web e o visualizador musical HTTPS compartilham o player. A API processa e guarda as conversões. Execução em simulador e validação em aparelho físico têm evidências separadas.

## Capabilities and Constraints

O contrato consolidado abrange melodia, piano, violão solo e duo. O tipo precisa ser escolhido antes do envio. Cobertura informa páginas, pautas e partes processadas internamente; não mede precisão musical. A escolha do candidato usa as verificações do pipeline. A conferência opcional compara original e resultado, localiza apontamentos e permite aceitar, rejeitar ou desfazer propostas existentes de nota/pausa, sem certificar precisão musical. A entrega automática continua disponível sem aprovação obrigatória. O histórico permite abrir e exportar versões anteriores em leitura, preservando a atual. O player oferece repetição entre compassos para estudo. Esses três recursos estão implementados e em validação local; publicação e novo envio à Apple permanecem posteriores à apresentação da prévia.

Parcial é permitido somente quando faltam páginas inteiras, com aviso na prévia e no MusicXML. O player permite ouvir os trechos convertidos e acompanha notas, pausas e páginas; páginas ausentes não são tocadas, e a exportação MIDI de resultados parciais permanece bloqueada. Falta de parte ou pauta obrigatória falha a tentativa inteira.

Cada envio admite uma retentativa automática por falha transitória e uma manual, sem novo débito de scan. Estouro do orçamento de conversão não inicia outra tentativa inteira automaticamente. Uma tentativa falha preserva o resultado anterior. O player móvel requer internet para abrir a superfície HTTPS. A meta de até 2% de eventos incorretos por arquivo e parte permanece uma meta a comprovar, conforme [o contrato](docs/CONVERSION_RELIABILITY.md).

O player usa piano como timbre padrão, sem exibir seletor de timbre, mensagens sobre bancos de samples ou créditos técnicos na área de reprodução, conforme a preferência do usuário em 2026-10-08. As atribuições dos samples permanecem nos arquivos distribuídos.

A primeira abertura apresenta quatro etapas opcionais: entrada por PDF/foto/scanner de documentos, conferência guiada, histórico de versões e estudo com andamento/repetição entre compassos. O guia aparece após a abertura musical, antes da interação com login ou rotas autenticadas, e lembra neste aparelho quando foi pulado ou concluído. Configurações → Conhecer o app permite rever a apresentação sem sair da tela atual. Textos e diagramas têm versões em português e inglês; não são resultados de conversão do usuário.

## Evidence on Hand

- [Auditoria datada](docs/audits/project-2026-10-06/audit.md), com capturas e limites da sessão preparada.
- [Seleção do acervo](docs/validation/DRIVE_SCORE_SELECTION.md), distinguindo candidatos, casos inadequados e referências ainda não conferidas.
- [Roadmap central](docs/PROJECT_ROADMAP.md), com implementação e validação separadas.

## Open Decisions

A confirmação de prioridade do público e da classificação da plataforma no contexto Impeccable foi solicitada em 2026-10-06 e está pendente. As descrições de público anteriores foram preservadas.

## Brand

Clara, musical e resolutiva. A marca combina a energia do laranja com superfícies quentes e calmas. O símbolo PDF apontando para a clave de sol comunica a transformação sem depender de texto.

## Tone

Direto, acolhedor e preciso. Frases curtas, verbos de ação e mensagens que expliquem o próximo passo.

## Strategic principles

1. A conversão é sempre a ação mais fácil de encontrar.
2. Status e erros devem ser compreendidos sem conhecimento técnico.
3. Mobile e web compartilham nome, símbolo, cores, linguagem e estados.
4. A partitura permanece visualmente protagonista.
5. Acessibilidade e previsibilidade vêm antes de efeitos decorativos.

## Anti-references

- Painéis SaaS genéricos em roxo e azul.
- Interfaces carregadas de cartões iguais.
- Gradientes fora do símbolo da marca.
- Ícones decorativos sem significado funcional.
- Textos técnicos ou nomes internos expostos ao usuário.
