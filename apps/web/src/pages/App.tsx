import { FileMusic, Home, KeyRound, LogOut, Shield, UserRound, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, downloadMidi, downloadMusicXml } from "../api/client.js";
import { HomeMenuGrid } from "../components/HomeMenuGrid.js";
import { ScoreCard } from "../components/ScoreCard.js";
import { ScoreDetails } from "../components/ScoreDetails.js";
import { UploadPanel } from "../components/UploadPanel.js";
import type { AuditLog, Score, ScoreStatus, User } from "../types/domain.js";

type View = "home" | "scores" | "favorites" | "settings" | "profile" | "admin-users" | "admin-scores" | "audits";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [selected, setSelected] = useState<Score | null>(null);
  const [view, setView] = useState<View>("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isAdmin = normalizeRole(user?.role) === "admin";

  async function refreshScores() {
    const response = await api<{ scores: Score[] }>("/api/scores");
    setScores(response.scores);
    if (selected) {
      setSelected(response.scores.find((score) => score.id === selected.id) ?? null);
    }
  }

  async function refreshAdmin() {
    if (!isAdmin) return;
    const [userResponse, auditResponse] = await Promise.all([
      api<{ users: User[] }>("/api/users"),
      api<{ audits: AuditLog[] }>("/api/admin/audits")
    ]);
    setUsers(userResponse.users);
    setAudits(auditResponse.audits);
  }

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((response) => setUser(response.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshScores();
    void refreshAdmin();
    const timer = window.setInterval(refreshScores, 5000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  if (loading) {
    return (
      <main className="launch-screen" aria-live="polite">
        <img src="/brand-icon.png" alt="" />
        <strong>Conversor de Partituras</strong>
        <span>Preparando seu espaço de trabalho...</span>
      </main>
    );
  }
  if (!user) return <Login onLogged={(loggedUser) => setUser(loggedUser)} />;

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  async function upload(file: File) {
    setNotice("");
    const formData = new FormData();
    formData.append("file", file);
    await api<{ score: Score }>("/api/scores", { method: "POST", body: formData });
    await refreshScores();
  }

  async function deleteScore(score: Score) {
    if (!window.confirm(`Excluir ${score.originalFilename}?`)) return;
    await api(`/api/scores/${score.id}`, { method: "DELETE" });
    await refreshScores();
  }

  async function toggleFavorite(score: Score) {
    setError("");
    try {
      const response = await api<{ score: Score }>(`/api/scores/${score.id}/favorite`, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite: !score.isFavorite })
      });
      setScores((current) => current.map((item) => (item.id === score.id ? response.score : item)));
      if (selected?.id === score.id) setSelected(response.score);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar os favoritos.");
    }
  }

  async function renameScore(score: Score, originalFilename: string) {
    setError("");
    setNotice("");
    const response = await api<{ score: Score }>(`/api/scores/${score.id}`, {
      method: "PATCH",
      body: JSON.stringify({ originalFilename })
    });
    setScores((current) => current.map((item) => (item.id === score.id ? response.score : item)));
    if (selected?.id === score.id) setSelected(response.score);
    setNotice("Nome da partitura atualizado.");
  }

  async function downloadScore(score: Score) {
    setError("");
    setNotice("");
    try {
      await downloadMusicXml(score.id, musicXmlName(score.originalFilename));
      setNotice(`Download iniciado: ${musicXmlName(score.originalFilename)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível baixar o MusicXML.");
    }
  }

  async function downloadScoreMidi(score: Score) {
    setError("");
    setNotice("");
    try {
      await downloadMidi(score.id, midiName(score.originalFilename));
      setNotice(`Download iniciado: ${midiName(score.originalFilename)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível baixar o MIDI.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/brand-icon.png" alt="" />
          <strong>Conversor de<br />Partituras</strong>
        </div>
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Home size={18} /> Início</button>
        <button className={view === "scores" ? "active" : ""} onClick={() => setView("scores")}><FileMusic size={18} /> Partituras</button>
        <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><UserRound size={18} /> Perfil</button>
        {isAdmin && <button className={view === "admin-users" ? "active" : ""} onClick={() => setView("admin-users")}><Users size={18} /> Usuários</button>}
        {isAdmin && <button className={view === "audits" ? "active" : ""} onClick={() => setView("audits")}><Shield size={18} /> Logs</button>}
        <button onClick={logout}><LogOut size={18} /> Sair</button>
      </aside>

      <section className="content">
        {view !== "home" && (
          <header className="topbar">
            <div>
              <h1>{viewTitle(view)}</h1>
              <p>{user.name} · {isAdmin ? "Admin" : "Usuário"}</p>
            </div>
          </header>
        )}

        {view === "home" && (
          <>
            <UploadPanel onUpload={upload} />
            <HomeMenuGrid onNavigate={setView} />
          </>
        )}

        {view === "scores" && <ScoreList scores={scores} onOpen={setSelected} onDelete={deleteScore} onDownload={downloadScore} onToggleFavorite={toggleFavorite} />}
        {view === "favorites" && <Favorites scores={scores} onOpen={setSelected} onDelete={deleteScore} onDownload={downloadScore} onToggleFavorite={toggleFavorite} />}
        {view === "settings" && <SettingsPanel />}
        {view === "profile" && <Profile user={user} onUpdated={setUser} />}
        {view === "admin-users" && <AdminUsers currentUser={user} users={users} onRefresh={refreshAdmin} />}
        {view === "admin-scores" && <ScoreList scores={scores} onOpen={setSelected} onDelete={deleteScore} onDownload={downloadScore} onToggleFavorite={toggleFavorite} />}
        {view === "audits" && <AuditPanel audits={audits} scores={scores} users={users} />}
        {notice && <p className="success-text">{notice}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>
      {selected && <ScoreDetails score={selected} onClose={() => setSelected(null)} onDownload={downloadScore} onDownloadMidi={downloadScoreMidi} onRename={renameScore} />}
    </main>
  );
}

function Login({ onLogged }: { onLogged: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      onLogged(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="/brand-icon.png" alt="" />
          <div>
            <h1>Conversor de Partituras</h1>
            <p>Entre para converter e acompanhar suas partituras.</p>
          </div>
        </div>
        <label>E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
        <label>Senha<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
        {error && <p className="error-text">{error}</p>}
        <button disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
      </form>
    </main>
  );
}

function ScoreList({ scores, onOpen, onDelete, onDownload, onToggleFavorite }: { scores: Score[]; onOpen: (score: Score) => void; onDelete: (score: Score) => void; onDownload: (score: Score) => void; onToggleFavorite: (score: Score) => void }) {
  if (!scores.length) return <section className="empty-state">Nenhuma partitura enviada ainda.</section>;
  return <section className="score-grid">{scores.map((score) => <ScoreCard key={score.id} score={score} onOpen={onOpen} onDelete={onDelete} onDownload={onDownload} onToggleFavorite={onToggleFavorite} />)}</section>;
}

function Favorites({ scores, onOpen, onDelete, onDownload, onToggleFavorite }: { scores: Score[]; onOpen: (score: Score) => void; onDelete: (score: Score) => void; onDownload: (score: Score) => void; onToggleFavorite: (score: Score) => void }) {
  const favorites = scores.filter((score) => score.isFavorite);
  if (!favorites.length) {
    return (
      <section className="empty-state">
        Nenhuma partitura favorita ainda. Toque no coração de uma partitura para adicioná-la aqui.
      </section>
    );
  }
  return <section className="score-grid">{favorites.map((score) => <ScoreCard key={score.id} score={score} onOpen={onOpen} onDelete={onDelete} onDownload={onDownload} onToggleFavorite={onToggleFavorite} />)}</section>;
}

function SettingsPanel() {
  return (
    <section className="form-panel settings-panel">
      <h2>Configurações</h2>
      <p className="field-hint">Preferências do app e notificações estarão disponíveis em breve.</p>
      <div className="settings-list">
        <div className="settings-row">
          <strong>Conversão automática</strong>
          <span>Ativa após cada envio</span>
        </div>
        <div className="settings-row">
          <strong>Formatos aceitos</strong>
          <span>PNG, JPG, JPEG, WEBP e PDF até 10 MB</span>
        </div>
        <div className="settings-row">
          <strong>Suporte</strong>
          <span>Use boa iluminação e bordas completas ao escanear partituras.</span>
        </div>
      </div>
    </section>
  );
}

function Profile({ user, onUpdated }: { user: User; onUpdated: (user: User) => void }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);
    try {
      const response = await api<{ user: User }>("/api/users/me/password", { method: "PATCH", body: JSON.stringify({ password }) });
      onUpdated(response.user);
      setPassword("");
      setMessage("Senha atualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar a senha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-layout">
      <form className="form-panel profile-panel" onSubmit={updatePassword}>
        <h2>Dados do usuário</h2>
        <label>Nome<input value={user.name} readOnly /></label>
        <label>E-mail<input value={user.email} type="email" readOnly /></label>
        <label>Nova senha<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required /></label>
        <button disabled={busy || password.length < 8}><KeyRound size={18} /> {busy ? "Salvando..." : "Salvar senha"}</button>
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </form>
    </section>
  );
}

function musicXmlName(originalFilename: string) {
  const clean = originalFilename.split(/[\\/]/).pop() || "score";
  const dot = clean.lastIndexOf(".");
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  return `${base || "score"}.musicxml`;
}

function midiName(originalFilename: string) {
  return musicXmlName(originalFilename).replace(/\.musicxml$/i, ".mid");
}

function AdminUsers({ currentUser, users, onRefresh }: { currentUser: User; users: User[]; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", email: "", password: "", role: "user" });
      setMessage("Usuário criado.");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o usuário.");
    }
  }

  async function updateUser(id: string, data: Partial<User>) {
    setMessage("");
    setError("");
    setBusyId(id);
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o usuário.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(item: User) {
    if (!window.confirm(`Excluir o perfil de ${item.name}?`)) return;
    setMessage("");
    setError("");
    setBusyId(item.id);
    try {
      await api(`/api/users/${item.id}`, { method: "DELETE" });
      setMessage("Perfil excluído.");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o perfil.");
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(item: User) {
    const password = window.prompt(`Digite a nova senha temporária para ${item.name}.`);
    if (password === null) return;
    if (password.length < 8) {
      setMessage("");
      setError("Senha: Senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setMessage("");
    setError("");
    setBusyId(item.id);
    try {
      await api(`/api/users/${item.id}`, { method: "PATCH", body: JSON.stringify({ password }) });
      setMessage(`Senha temporária atualizada para ${item.name}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível resetar a senha.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-layout">
      <form className="form-panel" onSubmit={createUser}>
        <h2>Novo usuário</h2>
        <input placeholder="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input placeholder="E-mail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        <input
          placeholder="Senha inicial"
          type="password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          minLength={8}
          aria-describedby="initial-password-help"
          required
        />
        <p id="initial-password-help" className="field-hint">Mínimo de 8 caracteres.</p>
        <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
          <option value="user">Usuário</option>
          <option value="admin">Admin</option>
        </select>
        <button>Criar</button>
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id}>
                <td data-label="Nome">{item.name}</td>
                <td data-label="E-mail">{item.email}</td>
                <td data-label="Perfil">
                  <select
                    value={item.role}
                    disabled={item.id === currentUser.id || busyId === item.id}
                    onChange={(event) => updateUser(item.id, { role: event.target.value as User["role"] })}
                  >
                    <option value="user">Usuário</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td data-label="Status">
                  <button
                    type="button"
                    disabled={item.id === currentUser.id || busyId === item.id}
                    onClick={() => updateUser(item.id, { isActive: !item.isActive })}
                  >
                    {item.isActive ? "Ativo" : "Inativo"}
                  </button>
                </td>
                <td data-label="Ações">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => resetPassword(item)}
                  >
                    <KeyRound size={16} />
                    Resetar senha
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={item.id === currentUser.id || busyId === item.id}
                    onClick={() => deleteUser(item)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type AuditTab = "events" | "score-counts";
type ScoreQuantityFilter = "all" | "with-scores" | "without-scores" | "converted" | "failed";

function AuditPanel({ audits, scores, users }: { audits: AuditLog[]; scores: Score[]; users: User[] }) {
  const [tab, setTab] = useState<AuditTab>("events");

  return (
    <section className="logs-panel">
      <div className="tab-bar" role="tablist" aria-label="Logs">
        <button type="button" className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>Eventos</button>
        <button type="button" className={tab === "score-counts" ? "active" : ""} onClick={() => setTab("score-counts")}>Partituras por usuário</button>
      </div>
      {tab === "events" ? <AuditTable audits={audits} users={users} /> : <ScoreQuantityTable scores={scores} users={users} />}
    </section>
  );
}

function AuditTable({ audits, users }: { audits: AuditLog[]; users: User[] }) {
  const usersById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);

  return (
    <div className="table-wrap audit-table-wrap">
      <table>
        <thead><tr><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Data</th></tr></thead>
        <tbody>{audits.map((audit) => {
          const actor = audit.actorId ? usersById.get(audit.actorId) : null;
          return (
            <tr key={audit.id}>
              <td data-label="Usuário">{actor ? `${actor.name} (${actor.email})` : "Não identificado"}</td>
              <td data-label="Ação">{audit.action}</td>
              <td data-label="Entidade">{audit.entity ?? "-"}</td>
              <td data-label="Data">{new Date(audit.createdAt).toLocaleString()}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function ScoreQuantityTable({ scores, users }: { scores: Score[]; users: User[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ScoreQuantityFilter>("all");

  const rows = useMemo(() => {
    const totals = new Map<string, {
      total: number;
      byStatus: Record<ScoreStatus, number>;
      lastUpload: string | null;
    }>();

    for (const score of scores) {
      const row = totals.get(score.userId) ?? {
        total: 0,
        byStatus: {
          uploaded: 0,
          queued: 0,
          processing: 0,
          converted: 0,
          failed: 0
        },
        lastUpload: null
      };
      row.total += 1;
      row.byStatus[score.conversionStatus] += 1;
      if (!row.lastUpload || new Date(score.createdAt) > new Date(row.lastUpload)) {
        row.lastUpload = score.createdAt;
      }
      totals.set(score.userId, row);
    }

    return users
      .map((item) => ({
        user: item,
        total: totals.get(item.id)?.total ?? 0,
        byStatus: totals.get(item.id)?.byStatus ?? {
          uploaded: 0,
          queued: 0,
          processing: 0,
          converted: 0,
          failed: 0
        },
        lastUpload: totals.get(item.id)?.lastUpload ?? null
      }))
      .sort((a, b) => b.total - a.total || a.user.name.localeCompare(b.user.name));
  }, [scores, users]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !term || row.user.name.toLowerCase().includes(term) || row.user.email.toLowerCase().includes(term);
      const matchesFilter =
        filter === "all" ||
        (filter === "with-scores" && row.total > 0) ||
        (filter === "without-scores" && row.total === 0) ||
        (filter === "converted" && row.byStatus.converted > 0) ||
        (filter === "failed" && row.byStatus.failed > 0);
      return matchesSearch && matchesFilter;
    });
  }, [filter, rows, search]);

  return (
    <>
      <div className="filter-bar">
        <label>Buscar usuário<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou e-mail" /></label>
        <label>Situação
          <select value={filter} onChange={(event) => setFilter(event.target.value as ScoreQuantityFilter)}>
            <option value="all">Todos</option>
            <option value="with-scores">Com partituras</option>
            <option value="without-scores">Sem partituras</option>
            <option value="converted">Com convertidas</option>
            <option value="failed">Com falhas</option>
          </select>
        </label>
      </div>
      {!filteredRows.length ? (
        <section className="empty-state">Nenhum usuário encontrado.</section>
      ) : (
        <div className="table-wrap quantity-table-wrap">
          <table>
            <thead><tr><th>Usuário</th><th>E-mail</th><th>Total</th><th>Convertidas</th><th>Em andamento</th><th>Falhas</th><th>Último envio</th></tr></thead>
            <tbody>{filteredRows.map((row) => {
              const activeCount = row.byStatus.uploaded + row.byStatus.queued + row.byStatus.processing;
              return (
                <tr key={row.user.id}>
                  <td data-label="Usuário">{row.user.name}</td>
                  <td data-label="E-mail">{row.user.email}</td>
                  <td data-label="Total" className="number-cell">{row.total}</td>
                  <td data-label="Convertidas" className="number-cell">{row.byStatus.converted}</td>
                  <td data-label="Em andamento" className="number-cell">{activeCount}</td>
                  <td data-label="Falhas" className="number-cell">{row.byStatus.failed}</td>
                  <td data-label="Último envio">{row.lastUpload ? new Date(row.lastUpload).toLocaleString() : "-"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

function viewTitle(view: View) {
  return {
    home: "Início",
    scores: "Minhas partituras",
    favorites: "Favoritas",
    settings: "Configurações",
    profile: "Perfil",
    "admin-users": "Usuários",
    "admin-scores": "Partituras",
    audits: "Auditoria"
  }[view];
}

function normalizeRole(role: User["role"] | string | undefined) {
  return String(role ?? "").toLowerCase();
}
