# Conversor de Partituras

Aplicação web e iOS para usuários autenticados enviarem partituras em PDF/imagem, exportarem MusicXML ou MIDI e acompanharem a reprodução visual das notas. O fluxo usa um adaptador OMR substituível e mantém autenticação e autorização no backend.

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
- `Score`: dono, nome original, nome interno, tipo, MIME, tamanho, status, erros, alertas, confiança e nome interno do MusicXML.
- `AuditLog`: ações relevantes sem registrar senha, token ou conteúdo dos arquivos.

## Autenticação e autorização

O login cria um token aleatório, salva apenas o hash no banco e envia o token em cookie `HttpOnly`. Toda rota privada passa por middleware de autenticação. Rotas administrativas exigem perfil `admin`. Rotas de partituras validam dono ou admin no backend, inclusive download e preview.

## Upload e conversão

1. Usuário envia arquivo por `multipart/form-data`.
2. API valida extensão, assinatura real do arquivo, tamanho e tipo permitido.
3. Nome original é sanitizado e preservado no banco.
4. Nome interno aleatório é gerado para storage.
5. Arquivo é salvo fora da pasta pública.
6. Registro `Score` é criado como `queued`.
7. Job entra na fila.
8. Worker muda para `processing`, chama o adaptador OMR e salva MusicXML.
9. Status vira `converted` ou `failed`.
10. Downloads de MusicXML e MIDI validam autorização e entregam `Content-Disposition` com base no nome original.

O player usa o MusicXML já convertido como fonte da visualização e deriva a execução com Verovio, sem executar um segundo OMR. Se o documento não informar andamento, o player e a exportação MIDI assumem 70 BPM. MusicXML continua sendo a opção preferencial para preservar a notação; MIDI representa principalmente notas, durações, andamento e instrumentos.

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

- [Suporte e limitações de MusicXML/MIDI](docs/SUPPORT.md)
- [Política de privacidade](docs/PRIVACY_POLICY.md)
- [Plano de liberação controlada e rollback](docs/MIDI_RELEASE_RUNBOOK.md)

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

Os testes usam repositórios em memória e storage temporário, cobrindo autenticação, autorização, upload seguro, conversão, download e preservação do nome original.

## Variáveis principais

- `DATABASE_URL`: conexão PostgreSQL. Em desenvolvimento, o Docker expõe o banco em `localhost:5433` para evitar conflito com algum PostgreSQL local.
- `REDIS_URL`: conexão Redis/BullMQ.
- `SESSION_SECRET`: segredo longo para cookies.
- `STORAGE_DIR`: diretório privado de arquivos.
- `MAX_UPLOAD_BYTES`: limite de upload.
- `OMR_ENGINE`: `stub` ou `audiveris`.
- `AUDIVERIS_BIN`: caminho do Audiveris quando `OMR_ENGINE=audiveris`.
