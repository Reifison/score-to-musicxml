# Conversor de Partituras

Aplicação web, iOS e Android para usuários autenticados enviarem partituras em PDF/imagem, exportarem MusicXML ou MIDI e acompanharem a reprodução visual das notas. O fluxo usa um adaptador OMR substituível e mantém autenticação e autorização no backend.

## Stack

- Frontend: React + Vite + TypeScript.
- Backend: Node.js + Express + TypeScript.
- Banco: PostgreSQL + Prisma migrations.
- Fila: BullMQ + Redis em produção; fila local para desenvolvimento/testes.
- Auth: sessão opaca em cookie `HttpOnly`, hash de senha com bcrypt.
- Storage: arquivos fora da pasta pública, com nome interno aleatório.
- Testes: Vitest + Supertest.

## Arquitetura

- `apps/web`: interface responsiva.
- `apps/api`: API, autenticação, autorização, upload, auditoria, fila e worker.
- `prisma`: modelo relacional e migrations.
- `storage/uploads`: arquivos originais salvos com nomes internos seguros.
- `storage/exports`: MusicXML gerado, também com nomes internos. O MIDI é derivado sob demanda e não é persistido no servidor.
- `docs`: documentação do fluxo de conversão.

Serviços principais:

- `AuthService`: login, logout, sessão e hash.
- `UserService`: CRUD administrativo de usuários.
- `ScoreUploadService`: validação e persistência de uploads.
- `ScoreConversionService`: orquestra status, OMR e exportação.
- `MusicXmlExportService`: nomes e MusicXML.
- `MidiExportService`: geração MIDI em memória a partir do MusicXML.
- `FileStorageService`: escrita/leitura segura fora do público.

## Modelo de dados

- `User`: nome, e-mail único, hash de senha, perfil `admin/user`, status ativo.
- `Session`: token opaco hasheado, usuário e expiração.
- `Score`: dono, arquivo, tipo de partitura escolhido, estado do resultado, cobertura por página/parte/pauta, erros, alertas e nome interno do MusicXML. O campo legado de confiança não representa precisão musical.
- `ConversionAttempt`: tentativa inicial, automática ou manual, estado, falha e resultado independente. Uma falha não sobrescreve o MusicXML anterior.
- `AuditLog`: ações relevantes sem registrar senha, token ou conteúdo dos arquivos.

## Autenticação e autorização

O login cria um token aleatório, salva apenas o hash no banco e envia o token em cookie `HttpOnly`. Toda rota privada passa por middleware de autenticação. Rotas administrativas exigem perfil `admin`. Rotas de partituras validam dono ou admin no backend, inclusive download e preview.

## Upload e conversão

1. Usuário escolhe melodia, piano, violão solo ou duo e envia o arquivo por `multipart/form-data`, com `scoreType`.
2. API valida extensão, assinatura real do arquivo, tamanho e tipo permitido.
3. Nome original é sanitizado e preservado no banco.
4. Nome interno aleatório é gerado para storage.
5. Arquivo é salvo fora da pasta pública.
6. Registro `Score`, tentativa inicial e uso de scan são persistidos na mesma transação.
7. A tentativa entra na fila; reconciliação recupera uma tentativa persistida quando o enqueue falha.
8. Worker muda para `processing`, chama o adaptador OMR e salva MusicXML.
9. O resultado fica completo ou parcial por páginas inteiras ausentes; perda de pauta/parte obrigatória falha a tentativa.
10. Downloads de MusicXML e MIDI validam autorização e entregam `Content-Disposition` com base no nome original.

O player usa o MusicXML já convertido como fonte da visualização e deriva a execução com Verovio, sem executar um segundo OMR. Se o documento não informar andamento, o player e a exportação MIDI assumem 70 BPM. MusicXML continua sendo a opção preferencial para preservar a notação; MIDI representa principalmente notas, durações, andamento e instrumentos.

Parciais permitem prévia e MusicXML com aviso; áudio e MIDI exigem cobertura completa. Arquivos antigos sem cobertura continuam disponíveis para revisão, com aviso e sem reprodução. Uma nova tentativa manual usa `POST /api/scores/:id/retry`, preserva o resultado anterior se falhar e não consome outro scan. `/health` informa liveness; `/ready` exige banco/schema, Redis e worker. O smoke test real de conversão continua necessário após deploy.

Com `OMR_ENGINE=stub`, o sistema valida o fluxo, mas não gera notas reais e marca a conversão como falha para não entregar um MusicXML enganoso. Para OMR real, configure `OMR_ENGINE=audiveris` e `AUDIVERIS_BIN` para o binário do Audiveris. O adaptador usa `execFile` com argumentos separados, timeout e sem shell.

Se a API e o worker estiverem rodando localmente no macOS, o caminho costuma ser `/Applications/Audiveris.app/Contents/MacOS/Audiveris`. Se estiverem rodando em Docker, esse app do macOS não existe dentro do container; nesse caso rode API/worker localmente para usar o Audiveris instalado no Mac ou instale uma versão Linux do Audiveris na imagem/container e aponte `AUDIVERIS_BIN` para esse executável.

Antes de chamar o Audiveris, PDFs são divididos página por página e renderizados em resolução controlada com `pdftoppm` quando disponível. Cada página é processada separadamente e o resultado é reunido em um MusicXML final. Isso evita que PDFs vetoriais sejam convertidos em imagens gigantes acima do limite aceito pelo Audiveris.

## Segurança

- Senhas com bcrypt.
- Rate limit em login, upload e download.
- Cookies `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- Helmet e CORS com origem configurada.
- Validação backend com Zod.
- MIME real via assinatura do arquivo.
- Storage fora de `public`.
- Proteção contra path traversal no storage.
- Nenhum segredo hardcoded; use `.env`.
- Auditoria de login, upload, conversão, download e ações admin.

## Documentação operacional

- [Roadmap central e prioridades do projeto](docs/PROJECT_ROADMAP.md)
- [Regras de confiabilidade da conversão](docs/CONVERSION_RELIABILITY.md)
- [Revisão visual e seus limites](docs/SOURCE_VISUAL_REVIEW.md)
- [Correção de notas e ritmo com regressões de Adelita](docs/NOTES_RHYTHM_CORRECTION.md)
- [Roadmap de validação, correção e melhoria musical](docs/MUSICAL_VALIDATION_AND_LEARNING_ROADMAP.md)
- [Conversão do acervo local: etapas, capas e tipos de erro](docs/CORPUS_CONVERSION_AND_VALIDATION_ROADMAP.md)
- [Auditoria do projeto com capturas e evidências de 06/10/2026](docs/audits/project-2026-10-06/audit.md)
- [Seleção de partituras do Drive](docs/validation/DRIVE_SCORE_SELECTION.md)
- [Gates de validação musical, ambiente, aparelhos e lojas](docs/validation/RELEASE_GATES_2026-10-06.md)
- [Suporte e limitações de MusicXML/MIDI](docs/SUPPORT.md)
- [Política de privacidade](docs/PRIVACY_POLICY.md)
- [Plano de liberação controlada e rollback](docs/MIDI_RELEASE_RUNBOOK.md)

Relatórios operacionais detalhados e resultados do corpus permanecem em `docs/validation/` no ambiente local; incluem evidências privadas e não são distribuídos pelo Git.

## Rodando localmente

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

API: `http://localhost:4000`  
Web: `http://localhost:5173`

Credenciais iniciais vêm do `.env`:

- `ADMIN_EMAIL=admin@example.com`
- `ADMIN_PASSWORD=ChangeMe123!`

## Worker

O comando `npm run dev` já sobe API, Web e worker de conversão juntos. Em produção, rode o worker separado:

```bash
npm run worker
```

## Testes

```bash
npm test
```

As suítes padrão usam repositórios em memória e storage temporário, cobrindo autenticação, autorização, upload seguro, conversão, download e preservação do nome original.

Os testes PostgreSQL são opt-in e ficam ignorados na execução padrão. Exigem um banco temporário com migrations aplicadas e a URL exata abaixo; rejeitam outras conexões antes de criar dados fictícios:

```bash
SCORE_PRISMA_INTEGRATION=1 DATABASE_URL='postgresql://qauser:qapassword@127.0.0.1:55432/score_qa' npm run test -w apps/api -- src/tests/prismaConversion.integration.test.ts
```

As credenciais acima são exclusivamente fictícias. Os testes de referências musicais que exigem corpus privado também são opcionais quando esses arquivos estão ausentes. As fixtures portáteis de Adelita e os testes sintéticos continuam obrigatórios.

Os utilitários de conversão e comparação têm uma suíte adicional:

```bash
node --test scripts/tests/*.test.mjs
```

## Variáveis principais

- `DATABASE_URL`: conexão PostgreSQL. Em desenvolvimento, o Docker expõe o banco em `localhost:5433` para evitar conflito com algum PostgreSQL local.
- `REDIS_URL`: conexão Redis/BullMQ.
- `SESSION_SECRET`: segredo longo para cookies.
- `STORAGE_DIR`: diretório privado de arquivos.
- `MAX_UPLOAD_BYTES`: limite de upload.
- `OMR_ENGINE`: `stub` ou `audiveris`.
- `AUDIVERIS_BIN`: caminho do Audiveris quando `OMR_ENGINE=audiveris`.

Resultado do acervo local: [entrega e prévias para revisão](docs/validation/corpus-partituras-2026-10-07/DELIVERY.md), com XMLs, tipos de erro e pendências por arquivo.
