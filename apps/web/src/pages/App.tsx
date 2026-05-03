import { FileMusic, LogOut, Shield, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, downloadMusicXml } from "../api/client.js";
import { ScoreCard } from "../components/ScoreCard.js";
import { ScoreDetails } from "../components/ScoreDetails.js";
import { UploadPanel } from "../components/UploadPanel.js";
import type { AuditLog, Score, User } from "../types/domain.js";

type View = "scores" | "admin-users" | "admin-scores" | "audits";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [selected, setSelected] = useState<Score | null>(null);
  const [view, setView] = useState<View>("scores");
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

  if (loading) return <main className="centered">Carregando...</main>;
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><FileMusic size={24} /><strong>MusicXML</strong></div>
        <button className={view === "scores" ? "active" : ""} onClick={() => setView("scores")}><FileMusic size={18} /> Partituras</button>
        {isAdmin && <button className={view === "admin-users" ? "active" : ""} onClick={() => setView("admin-users")}><Users size={18} /> Usuários</button>}
        {isAdmin && <button className={view === "admin-scores" ? "active" : ""} onClick={() => setView("admin-scores")}><Shield size={18} /> Todas</button>}
        {isAdmin && <button className={view === "audits" ? "active" : ""} onClick={() => setView("audits")}><Shield size={18} /> Logs</button>}
        <button onClick={logout}><LogOut size={18} /> Sair</button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h1>{viewTitle(view)}</h1>
            <p>{user.name} · {isAdmin ? "Admin" : "Usuário"}</p>
          </div>
        </header>

        {view === "scores" && (
          <>
            <UploadPanel onUpload={upload} />
            <ScoreList scores={scores} onOpen={setSelected} onDelete={deleteScore} onDownload={downloadScore} />
          </>
        )}

        {view === "admin-users" && <AdminUsers currentUser={user} users={users} onRefresh={refreshAdmin} />}
        {view === "admin-scores" && <ScoreList scores={scores} onOpen={setSelected} onDelete={deleteScore} onDownload={downloadScore} />}
        {view === "audits" && <AuditTable audits={audits} />}
        {notice && <p className="success-text">{notice}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>
      {selected && <ScoreDetails score={selected} onClose={() => setSelected(null)} onDownload={downloadScore} />}
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
        <FileMusic size={34} />
        <h1>MusicXML</h1>
        <label>E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
        <label>Senha<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
        {error && <p className="error-text">{error}</p>}
        <button disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
      </form>
    </main>
  );
}

function ScoreList({ scores, onOpen, onDelete, onDownload }: { scores: Score[]; onOpen: (score: Score) => void; onDelete: (score: Score) => void; onDownload: (score: Score) => void }) {
  if (!scores.length) return <section className="empty-state">Nenhuma partitura enviada ainda.</section>;
  return <section className="score-grid">{scores.map((score) => <ScoreCard key={score.id} score={score} onOpen={onOpen} onDelete={onDelete} onDownload={onDownload} />)}</section>;
}

function musicXmlName(originalFilename: string) {
  const clean = originalFilename.split(/[\\/]/).pop() || "score";
  const dot = clean.lastIndexOf(".");
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  return `${base || "score"}.musicxml`;
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

  return (
    <section className="admin-layout">
      <form className="form-panel" onSubmit={createUser}>
        <h2>Novo usuário</h2>
        <input placeholder="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input placeholder="E-mail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        <input placeholder="Senha inicial" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
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
                <td>{item.name}</td>
                <td>{item.email}</td>
                <td>
                  <select
                    value={item.role}
                    disabled={item.id === currentUser.id || busyId === item.id}
                    onChange={(event) => updateUser(item.id, { role: event.target.value as User["role"] })}
                  >
                    <option value="user">Usuário</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    disabled={item.id === currentUser.id || busyId === item.id}
                    onClick={() => updateUser(item.id, { isActive: !item.isActive })}
                  >
                    {item.isActive ? "Ativo" : "Inativo"}
                  </button>
                </td>
                <td>
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

function AuditTable({ audits }: { audits: AuditLog[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Ação</th><th>Entidade</th><th>Data</th></tr></thead>
        <tbody>{audits.map((audit) => <tr key={audit.id}><td>{audit.action}</td><td>{audit.entity ?? "-"}</td><td>{new Date(audit.createdAt).toLocaleString()}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function viewTitle(view: View) {
  return {
    scores: "Minhas partituras",
    "admin-users": "Usuários",
    "admin-scores": "Partituras",
    audits: "Auditoria"
  }[view];
}

function normalizeRole(role: User["role"] | string | undefined) {
  return String(role ?? "").toLowerCase();
}
