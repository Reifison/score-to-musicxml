import { FileMusic, Heart, Home, KeyRound, LogOut, Shield, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, bulkScoreAction, deleteScore as deleteScoreRequest, downloadMidi, downloadMusicXml, listTrashScores, restoreScore } from "../api/client.js";
import type { TrashScore } from "../api/client.js";
import { HomeMenuGrid } from "../components/HomeMenuGrid.js";
import { ScoreCard } from "../components/ScoreCard.js";
import { ScoreDetails } from "../components/ScoreDetails.js";
import { UploadPanel } from "../components/UploadPanel.js";
import { canDownloadScoreMusicXml, canExportScoreMidi } from "../score/availability.js";
import type { AuditLog, Score, ScoreStatus, ScoreType, User } from "../types/domain.js";

type View = "home" | "scores" | "favorites" | "trash" | "settings" | "profile" | "admin" | "admin-users" | "admin-scores" | "audits";
type SessionState = "checking" | "signed-out" | "authenticated" | "error";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [recentUpload, setRecentUpload] = useState<Score | null>(null);
  const [trashScores, setTrashScores] = useState<TrashScore[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Score | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailPollingPaused, setDetailPollingPaused] = useState(false);
  const [view, setView] = useState<View>("home");
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [sessionNotice, setSessionNotice] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scoresError, setScoresError] = useState("");
  const [pollingPaused, setPollingPaused] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scoresRequestInFlight = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const detailRequestSequence = useRef(new Map<string, number>());

  const isAdmin = normalizeRole(user?.role) === "admin";
  const selected = useMemo(
    () => {
      if (!selectedId) return null;
      const current = scores.find((score) => score.id === selectedId);
      if (!current) return null;
      return selectedDetail?.id === selectedId ? mergeScoreSnapshot(current, selectedDetail) : current;
    },
    [scores, selectedDetail, selectedId]
  );

  const refreshScores = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (silent && document.visibilityState === "hidden") return;
    if (scoresRequestInFlight.current) return;
    scoresRequestInFlight.current = true;
    if (!silent) {
      setScoresLoading(true);
      setPollingPaused(false);
    }
    try {
      const response = await api<{ scores: Score[] }>("/api/scores");
      setScores((current) => mergeScoreList(current, response.scores));
      setRecentUpload((current) => {
        if (!current) return null;
        const latest = response.scores.find((score) => score.id === current.id);
        return latest ? mergeScoreSnapshot(current, latest) : current;
      });
      setScoresError("");
      setPollingPaused(false);
    } catch (err) {
      if (!expireSessionOnUnauthorized(err)) {
        setScoresError(errorMessage(err, "Não foi possível atualizar suas partituras."));
        setPollingPaused(true);
      }
    } finally {
      scoresRequestInFlight.current = false;
      setScoresLoading(false);
    }
  }, []);

  const refreshAdmin = useCallback(async () => {
    if (normalizeRole(user?.role) !== "admin") return;
    setAdminError("");
    const [userResponse, auditResponse] = await Promise.all([
      api<{ users: User[] }>("/api/users"),
      api<{ audits: AuditLog[] }>("/api/admin/audits")
    ]);
    setUsers(userResponse.users);
    setAudits(auditResponse.audits);
  }, [user?.role]);

  const loadScoreDetail = useCallback(async (scoreId: string) => {
    const requestSequence = (detailRequestSequence.current.get(scoreId) ?? 0) + 1;
    detailRequestSequence.current.set(scoreId, requestSequence);
    try {
      const response = await api<{ score: Score }>(`/api/scores/${scoreId}`);
      if (detailRequestSequence.current.get(scoreId) !== requestSequence) return response.score;
      setScores((current) => current.map((score) => score.id === scoreId ? mergeScoreSnapshot(score, response.score) : score));
      setRecentUpload((current) => current?.id === scoreId ? mergeScoreSnapshot(current, response.score) : current);
      if (selectedIdRef.current === scoreId) {
        setSelectedDetail((current) => current?.id === scoreId ? mergeScoreSnapshot(current, response.score) : response.score);
        setDetailError("");
      }
      return response.score;
    } catch (err) {
      if (detailRequestSequence.current.get(scoreId) !== requestSequence) return null;
      if (!expireSessionOnUnauthorized(err) && selectedIdRef.current === scoreId) {
        setDetailError(errorMessage(err, "Não foi possível atualizar os detalhes da partitura."));
        setDetailPollingPaused(true);
      }
      return null;
    }
  }, []);

  const refreshScoreDetail = useCallback(async (scoreId: string) => {
    setDetailPollingPaused(false);
    return loadScoreDetail(scoreId);
  }, [loadScoreDetail]);

  async function refreshTrash() {
    setTrashScores(await listTrashScores());
  }

  useEffect(() => {
    void checkSession();
  }, []);

  useEffect(() => {
    const expireSession = () => {
      setSessionNotice("Sua sessão expirou. Entre novamente para continuar.");
      setSessionState("signed-out");
      setUser(null);
      setSelectedId(null);
      selectedIdRef.current = null;
      setSelectedDetail(null);
    };
    window.addEventListener("score-to-musicxml:session-expired", expireSession);
    return () => window.removeEventListener("score-to-musicxml:session-expired", expireSession);
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshScores();
    void refreshAdmin().catch((err) => {
      if (!expireSessionOnUnauthorized(err)) setAdminError(errorMessage(err, "Não foi possível carregar os dados administrativos."));
    });
  }, [user?.id, refreshScores, refreshAdmin]);

  const hasActiveScoreConversion = scores.some((score) => ["uploaded", "queued", "processing"].includes(score.conversionStatus));
  const hasActiveSelectedAttempt = selectedDetail?.attempts?.some((attempt) => attempt.status === "queued" || attempt.status === "processing") ?? false;
  const hasPendingAutomatedDelivery = scores.some((score) => score.reviewStatus === "needs_review") || selectedDetail?.reviewStatus === "needs_review";
  const hasActiveConversions = hasActiveScoreConversion || hasActiveSelectedAttempt || hasPendingAutomatedDelivery;
  useEffect(() => {
    if (!user || !hasActiveConversions || pollingPaused) return;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      if (hasActiveScoreConversion || hasPendingAutomatedDelivery) void refreshScores({ silent: true });
      if ((hasActiveSelectedAttempt || selectedDetail?.reviewStatus === "needs_review") && selectedId && !detailPollingPaused) void loadScoreDetail(selectedId);
    };
    const timer = window.setInterval(poll, 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [user?.id, hasActiveConversions, hasActiveScoreConversion, hasActiveSelectedAttempt, hasPendingAutomatedDelivery, selectedDetail?.reviewStatus, selectedId, pollingPaused, detailPollingPaused, refreshScores, loadScoreDetail]);

  useEffect(() => {
    if (!user || view !== "trash") return;
    void refreshTrash().catch((err) => {
      if (!expireSessionOnUnauthorized(err)) setError(errorMessage(err, "Não foi possível carregar a lixeira."));
    });
  }, [user?.id, view]);

  async function checkSession() {
    setSessionState("checking");
    setSessionError("");
    try {
      const response = await api<{ user: User }>("/api/auth/me");
      setUser(response.user);
      setSessionNotice("");
      setSessionState("authenticated");
    } catch (err) {
      setUser(null);
      if (err instanceof ApiError && err.status === 401) {
        setSessionNotice("");
        setSessionState("signed-out");
      } else {
        setSessionError(errorMessage(err, "Não foi possível verificar sua sessão."));
        setSessionState("error");
      }
    }
  }

  function expireSessionOnUnauthorized(err: unknown) {
    if (!(err instanceof ApiError) || err.status !== 401) return false;
    setSessionNotice("Sua sessão expirou. Entre novamente para continuar.");
    setSessionState("signed-out");
    setUser(null);
    setSelectedId(null);
    selectedIdRef.current = null;
    setSelectedDetail(null);
    return true;
  }

  if (sessionState === "checking") {
    return (
      <main className="launch-screen" aria-live="polite">
        <img src="/brand-icon.png" alt="" />
        <strong>Conversor de Partituras</strong>
        <span>Preparando seu espaço de trabalho...</span>
      </main>
    );
  }
  if (sessionState === "error") {
    return (
      <main className="login-screen">
        <section className="login-card session-error" role="alert">
          <div className="login-brand">
            <img src="/brand-icon.png" alt="" />
            <div>
              <h1>Não foi possível conectar</h1>
              <p>{sessionError}</p>
            </div>
          </div>
          <button type="button" onClick={() => void checkSession()}>Tentar novamente</button>
        </section>
      </main>
    );
  }
  if (!user) return <Login onLogged={(loggedUser) => { setUser(loggedUser); setSessionNotice(""); setSessionState("authenticated"); }} notice={sessionNotice} />;

  async function logout() {
    setError("");
    try {
      await api("/api/auth/logout", { method: "POST" });
      setUser(null);
      selectedIdRef.current = null;
      setSelectedId(null);
      setSelectedDetail(null);
      setSessionState("signed-out");
    } catch (err) {
      if (!expireSessionOnUnauthorized(err)) setError(errorMessage(err, "Não foi possível sair agora."));
    }
  }

  async function upload(file: File, scoreType: ScoreType) {
    setNotice("");
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scoreType", scoreType);
    const response = await api<{ score: Score }>("/api/scores", { method: "POST", body: formData });
    setRecentUpload(response.score);
    setScores((current) => [response.score, ...current.filter((score) => score.id !== response.score.id)]);
    void refreshScores({ silent: true });
    return response.score;
  }

  function openScore(score: Score) {
    selectedIdRef.current = score.id;
    setSelectedId(score.id);
    setSelectedDetail(null);
    setDetailError("");
    setDetailPollingPaused(false);
    void loadScoreDetail(score.id);
  }

  async function retryScore(scoreId: string, scoreType?: ScoreType) {
    setDetailPollingPaused(false);
    const response = await api<{ score: Score }>(`/api/scores/${scoreId}/retry`, {
      method: "POST",
      ...(scoreType ? { body: JSON.stringify({ scoreType }) } : {})
    });
    setScores((current) => current.map((score) => score.id === scoreId ? mergeScoreSnapshot(score, response.score) : score));
    setRecentUpload((current) => current?.id === scoreId ? mergeScoreSnapshot(current, response.score) : current);
    if (selectedIdRef.current === scoreId) {
      setSelectedDetail((current) => current?.id === scoreId ? mergeScoreSnapshot(current, response.score) : response.score);
      setDetailError("");
    }
    return response.score;
  }

  async function deleteScore(score: Score) {
    if (!window.confirm(`Excluir ${score.originalFilename}?`)) return;
    setError("");
    try {
      await deleteScoreRequest(score.id);
      setRecentUpload((current) => current?.id === score.id ? null : current);
      setNotice("Partitura movida para a lixeira por 7 dias.");
      await refreshScores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível mover a partitura para a lixeira.");
    }
  }

  async function bulkDeleteScores(selectedScores: Score[]) {
    if (!selectedScores.length || !window.confirm(`Mover ${selectedScores.length} partituras para a lixeira? Elas poderão ser restauradas por 7 dias.`)) return;
    setError("");
    try {
      await bulkScoreAction(selectedScores.map((score) => score.id), "delete");
      setNotice(`${selectedScores.length} ${selectedScores.length === 1 ? "partitura movida" : "partituras movidas"} para a lixeira.`);
      await refreshScores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível mover as partituras para a lixeira.");
    }
  }

  async function toggleFavorite(score: Score) {
    setError("");
    try {
      const response = await api<{ score: Score }>(`/api/scores/${score.id}/favorite`, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite: !score.isFavorite })
      });
      setScores((current) => current.map((item) => (item.id === score.id ? response.score : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar os favoritos.");
    }
  }

  async function bulkFavoriteScores(selectedScores: Score[]) {
    if (!selectedScores.length) return;
    setError("");
    try {
      await bulkScoreAction(selectedScores.map((score) => score.id), "favorite", true);
      setScores((current) => current.map((score) => selectedScores.some((selected) => selected.id === score.id) ? { ...score, isFavorite: true } : score));
      setNotice(`${selectedScores.length === 1 ? "Partitura marcada" : "Partituras marcadas"} como favorita${selectedScores.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar os favoritos.");
    }
  }

  async function restoreTrashScore(score: TrashScore) {
    setError("");
    try {
      await restoreScore(score.id);
      setTrashScores((current) => current.filter((item) => item.id !== score.id));
      await refreshScores();
      setNotice("Partitura restaurada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível restaurar a partitura.");
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
    setNotice("Nome da partitura atualizado.");
  }

  async function downloadScore(score: Score) {
    setError("");
    setNotice("");
    if (!canDownloadScoreMusicXml(score)) {
      setError("O MusicXML ainda não está disponível para download.");
      return;
    }
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
    if (score.resultStatus === "partial") {
      setError("O MIDI fica indisponível quando faltam páginas na conversão.");
      return;
    }
    if (!canExportScoreMidi(score)) {
      setError("O MIDI ainda não está disponível para este resultado.");
      return;
    }
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
        <button className={`nav-home${view === "home" ? " active" : ""}`} aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}><Home size={18} /> Início</button>
        <button className={`nav-scores${view === "scores" ? " active" : ""}`} aria-current={view === "scores" ? "page" : undefined} onClick={() => setView("scores")}><FileMusic size={18} /> Partituras</button>
        <button className={`nav-favorites${view === "favorites" ? " active" : ""}`} aria-current={view === "favorites" ? "page" : undefined} onClick={() => setView("favorites")}><Heart size={18} /> Favoritas</button>
        <button className={`nav-profile${view === "profile" ? " active" : ""}`} aria-current={view === "profile" ? "page" : undefined} onClick={() => setView("profile")}><UserRound size={18} /> Perfil</button>
        {isAdmin && <button className={`desktop-admin-nav${view === "admin-users" ? " active" : ""}`} aria-current={view === "admin-users" ? "page" : undefined} onClick={() => setView("admin-users")}><Users size={18} /> Usuários</button>}
        {isAdmin && <button className={`desktop-admin-nav${view === "audits" ? " active" : ""}`} aria-current={view === "audits" ? "page" : undefined} onClick={() => setView("audits")}><Shield size={18} /> Logs</button>}
        {isAdmin && <button className={`mobile-admin-nav${view === "admin" ? " active" : ""}`} aria-current={view === "admin" ? "page" : undefined} onClick={() => setView("admin")}><Shield size={18} /> Admin</button>}
        <button className="desktop-logout" onClick={logout}><LogOut size={18} /> Sair</button>
      </aside>

      <section className="content">
        <div className="mobile-account-action">
          <span>{user.name}</span>
          <button className="secondary-button" type="button" onClick={() => void logout()}><LogOut aria-hidden="true" size={16} /> Sair</button>
        </div>
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
            <UploadPanel onUpload={upload} recentUpload={recentUpload} onOpenScore={openScore} />
            <HomeMenuGrid onNavigate={setView} />
          </>
        )}

        {scoresError && view !== "scores" && view !== "favorites" && <div className="refresh-error" role="alert"><span>{scoresError}</span><button className="secondary-button" type="button" disabled={scoresLoading} onClick={() => void refreshScores()}>{scoresLoading ? "Atualizando..." : "Atualizar partituras"}</button></div>}
        {adminError && <div className="refresh-error" role="alert"><span>{adminError}</span><button className="secondary-button" type="button" onClick={() => void refreshAdmin().catch((err) => { if (!expireSessionOnUnauthorized(err)) setAdminError(errorMessage(err, "Não foi possível carregar os dados administrativos.")); })}>Tentar novamente</button></div>}
        {view === "scores" && <ScoreList scores={scores} loading={scoresLoading} error={scoresError} onRefresh={() => refreshScores()} onOpen={openScore} onDelete={deleteScore} onBulkDelete={bulkDeleteScores} onBulkFavorite={bulkFavoriteScores} onDownload={downloadScore} onToggleFavorite={toggleFavorite} />}
        {view === "favorites" && <Favorites scores={scores} loading={scoresLoading} error={scoresError} onRefresh={() => refreshScores()} onOpen={openScore} onDelete={deleteScore} onDownload={downloadScore} onToggleFavorite={toggleFavorite} />}
        {view === "trash" && <TrashList scores={trashScores} onRestore={restoreTrashScore} />}
        {view === "settings" && <SettingsPanel onProfile={() => setView("profile")} />}
        {view === "profile" && <Profile user={user} onUpdated={setUser} />}
        {view === "admin" && isAdmin && <AdminHub onNavigate={setView} />}
        {view === "admin-users" && isAdmin && <AdminUsers currentUser={user} users={users} onRefresh={refreshAdmin} />}
        {view === "admin-scores" && <ScoreList scores={scores} loading={scoresLoading} error={scoresError} onRefresh={() => refreshScores()} onOpen={openScore} onDelete={deleteScore} onBulkDelete={bulkDeleteScores} onBulkFavorite={bulkFavoriteScores} onDownload={downloadScore} onToggleFavorite={toggleFavorite} />}
        {view === "audits" && <AuditPanel audits={audits} scores={scores} users={users} />}
        {notice && <p className="success-text" role="status" aria-live="polite">{notice}</p>}
        {error && <p className="error-text" role="alert">{error}</p>}
      </section>
      {selected && <ScoreDetails key={selected.id} score={selected} detailError={detailError} onClose={() => { selectedIdRef.current = null; setSelectedId(null); setSelectedDetail(null); setDetailError(""); }} onDownload={downloadScore} onDownloadMidi={downloadScoreMidi} onRename={renameScore} onRetry={retryScore} onRefreshDetail={refreshScoreDetail} />}
    </main>
  );
}

function Login({ onLogged, notice }: { onLogged: (user: User) => void; notice?: string }) {
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
        {notice && <p className="session-notice" role="status">{notice}</p>}
        <label>E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
        <label>Senha<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
        {error && <p className="error-text">{error}</p>}
        <button disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
      </form>
    </main>
  );
}

function ScoreList({ scores, loading, error, onRefresh, onOpen, onDelete, onBulkDelete, onBulkFavorite, onDownload, onToggleFavorite }: {
  scores: Score[];
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
  onOpen: (score: Score) => void;
  onDelete: (score: Score) => void;
  onBulkDelete: (scores: Score[]) => Promise<void>;
  onBulkFavorite: (scores: Score[]) => Promise<void>;
  onDownload: (score: Score) => void;
  onToggleFavorite: (score: Score) => void;
}) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedScores = scores.filter((score) => selectedIds.has(score.id));

  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => scores.some((score) => score.id === id))));
  }, [scores]);

  function closeSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelection(score: Score) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(score.id)) next.delete(score.id);
      else next.add(score.id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((current) => current.size === scores.length ? new Set() : new Set(scores.map((score) => score.id)));
  }

  async function bulkDelete() {
    await onBulkDelete(selectedScores);
    closeSelection();
  }

  async function bulkFavorite() {
    await onBulkFavorite(selectedScores);
    closeSelection();
  }

  return (
    <section className="scores-section" aria-label="Minhas partituras">
      {error && scores.length > 0 && (
        <div className="refresh-error" role="alert">
          <span>Não foi possível atualizar a lista. {error}</span>
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void onRefresh()}>{loading ? "Atualizando..." : "Tentar novamente"}</button>
        </div>
      )}
      <div className="score-list-toolbar">
        <div>
          <strong>{scores.length} {scores.length === 1 ? "partitura" : "partituras"}</strong>
          <span>{selectionMode ? "Escolha as partituras para uma ação" : "Favoritos permanecem na ordem original"}</span>
        </div>
        <button className="secondary-button" type="button" onClick={() => selectionMode ? closeSelection() : setSelectionMode(true)}>
          {selectionMode ? "Cancelar" : "Selecionar"}
        </button>
      </div>
      {selectionMode && (
        <div className="selection-toolbar" role="toolbar" aria-label="Ações para partituras selecionadas">
          <div className="selection-summary">
            <strong>{selectedScores.length}</strong>
            <span>{selectedScores.length === 1 ? "selecionada" : "selecionadas"}</span>
          </div>
          <button className="secondary-button" type="button" onClick={toggleAll}>
            {selectedScores.length === scores.length && scores.length ? "Limpar seleção" : "Selecionar todas"}
          </button>
          <button className="secondary-button" type="button" disabled={!selectedScores.length} onClick={bulkFavorite}>Favoritar</button>
          <button className="danger-button" type="button" disabled={!selectedScores.length} onClick={bulkDelete}>Excluir</button>
        </div>
      )}
      {!scores.length && error ? (
        <div className="empty-state refresh-empty" role="alert">
          <p>Suas partituras não foram carregadas. Confira a conexão e tente novamente.</p>
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void onRefresh()}>{loading ? "Atualizando..." : "Tentar novamente"}</button>
        </div>
      ) : !scores.length && loading ? (
        <section className="empty-state" role="status" aria-live="polite">Carregando partituras...</section>
      ) : !scores.length ? (
        <section className="empty-state">Nenhuma partitura enviada ainda.</section>
      ) : (
        <section className="score-grid">
          {scores.map((score) => (
            <ScoreCard
              key={score.id}
              score={score}
              selectionMode={selectionMode}
              selected={selectedIds.has(score.id)}
              onSelect={() => toggleSelection(score)}
              onOpen={onOpen}
              onDelete={onDelete}
              onDownload={onDownload}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </section>
      )}
    </section>
  );
}

function TrashList({ scores, onRestore }: { scores: TrashScore[]; onRestore: (score: TrashScore) => Promise<void> }) {
  if (!scores.length) {
    return (
      <section className="empty-state trash-empty">
        <div>
          <strong>A lixeira está vazia</strong>
          <span>Partituras excluídas ficam disponíveis por 7 dias.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="trash-list" aria-label="Partituras na lixeira">
      <div className="trash-intro">
        <strong>Exclusão temporária</strong>
        <span>Você pode restaurar estas partituras durante 7 dias. Depois disso, elas serão removidas automaticamente.</span>
      </div>
      <div className="trash-items">
        {scores.map((score) => <TrashRow key={score.id} score={score} onRestore={onRestore} />)}
      </div>
    </section>
  );
}

function TrashRow({ score, onRestore }: { score: TrashScore; onRestore: (score: TrashScore) => Promise<void> }) {
  const expiration = score.expiresAt ? new Date(score.expiresAt) : score.deletedAt ? new Date(new Date(score.deletedAt).getTime() + 7 * 24 * 60 * 60 * 1000) : null;
  const days = expiration ? Math.max(0, Math.ceil((expiration.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null;
  return (
    <article className="trash-row">
      <div className="trash-row-icon" aria-hidden="true"><FileMusic size={20} /></div>
      <div className="trash-row-copy">
        <strong>{score.originalFilename}</strong>
        <span>{score.fileType.toUpperCase()} · {formatBytes(score.fileSize)}</span>
        <small>{days === null ? "Disponível por 7 dias" : days === 0 ? "Expira hoje" : `Expira em ${days} ${days === 1 ? "dia" : "dias"}`}</small>
      </div>
      <button className="secondary-button" type="button" onClick={() => void onRestore(score)}>Restaurar</button>
    </article>
  );
}

function Favorites({ scores, loading, error, onRefresh, onOpen, onDelete, onDownload, onToggleFavorite }: { scores: Score[]; loading: boolean; error: string; onRefresh: () => Promise<void>; onOpen: (score: Score) => void; onDelete: (score: Score) => void; onDownload: (score: Score) => void; onToggleFavorite: (score: Score) => void }) {
  const favorites = scores.filter((score) => score.isFavorite);
  if (!scores.length && error) {
    return <div className="empty-state refresh-empty" role="alert"><p>Não foi possível carregar as partituras favoritas.</p><button className="secondary-button" type="button" disabled={loading} onClick={() => void onRefresh()}>{loading ? "Atualizando..." : "Tentar novamente"}</button></div>;
  }
  if (!scores.length && loading) return <section className="empty-state" role="status" aria-live="polite">Carregando partituras...</section>;
  if (error) {
    return <section className="scores-section" aria-label="Partituras favoritas"><div className="refresh-error" role="alert"><span>Não foi possível atualizar a lista. {error}</span><button className="secondary-button" type="button" disabled={loading} onClick={() => void onRefresh()}>{loading ? "Atualizando..." : "Tentar novamente"}</button></div>{favorites.length ? <section className="score-grid">{favorites.map((score) => <ScoreCard key={score.id} score={score} onOpen={onOpen} onDelete={onDelete} onDownload={onDownload} onToggleFavorite={onToggleFavorite} />)}</section> : <section className="empty-state">Nenhuma partitura favorita ainda.</section>}</section>;
  }
  if (!favorites.length) {
    return (
      <section className="empty-state">
        Nenhuma partitura favorita ainda. Toque no coração de uma partitura para adicioná-la aqui.
      </section>
    );
  }
  return <section className="score-grid">{favorites.map((score) => <ScoreCard key={score.id} score={score} onOpen={onOpen} onDelete={onDelete} onDownload={onDownload} onToggleFavorite={onToggleFavorite} />)}</section>;
}

function SettingsPanel({ onProfile }: { onProfile: () => void }) {
  return (
    <section className="form-panel settings-panel">
      <h2>Configurações e ajuda</h2>
      <dl className="settings-list">
        <div className="settings-row">
          <dt>Conversão</dt>
          <dd>Começa automaticamente depois que o arquivo é enviado.</dd>
        </div>
        <div className="settings-row">
          <dt>Arquivos aceitos</dt>
          <dd>PNG, JPG, JPEG, WEBP e PDF, até 10 MB por arquivo.</dd>
        </div>
      </dl>
      <div className="settings-support">
        <div>
          <strong>Precisa de ajuda?</strong>
          <p>Envie uma dúvida ou relate um problema. Inclua o nome do arquivo e o que aconteceu.</p>
          <a className="secondary-button" href="mailto:reifison@hotmail.com?subject=Ajuda%20com%20o%20Conversor%20de%20Partituras">Enviar e-mail para reifison@hotmail.com</a>
        </div>
      </div>
      <button className="secondary-button settings-profile-link" type="button" onClick={onProfile}>Gerenciar dados da conta e senha</button>
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      <form className="form-panel admin-user-create" onSubmit={createUser}>
        <h2>Novo usuário</h2>
        <label htmlFor="new-user-name">Nome</label>
        <input id="new-user-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} aria-describedby={error ? "create-user-error" : undefined} required />
        <label htmlFor="new-user-email">E-mail</label>
        <input id="new-user-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} aria-describedby={error ? "create-user-error" : undefined} required />
        <label htmlFor="new-user-password">Senha inicial</label>
        <input
          id="new-user-password"
          type="password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          minLength={8}
          aria-describedby={error ? "initial-password-help create-user-error" : "initial-password-help"}
          required
        />
        <p id="initial-password-help" className="field-hint">Mínimo de 8 caracteres.</p>
        <label htmlFor="new-user-role">Perfil</label>
        <select id="new-user-role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} aria-describedby={error ? "create-user-error" : undefined}>
          <option value="user">Usuário</option>
          <option value="admin">Admin</option>
        </select>
        <button>Criar</button>
        {message && <p className="success-text">{message}</p>}
        {error && <p id="create-user-error" className="error-text" role="alert">{error}</p>}
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
                    aria-label={`Perfil de ${item.name}`}
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
                    aria-label={item.isActive ? `Desativar ${item.name}` : `Ativar ${item.name}`}
                    disabled={item.id === currentUser.id || busyId === item.id}
                    onClick={() => updateUser(item.id, { isActive: !item.isActive })}
                  >
                    {item.isActive ? "Ativo" : "Inativo"}
                  </button>
                </td>
                <td data-label="Ações">
                  <button
                    type="button"
                    aria-label={`Resetar senha de ${item.name}`}
                    disabled={busyId === item.id}
                    onClick={() => resetPassword(item)}
                  >
                    <KeyRound size={16} />
                    Resetar senha
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    aria-label={`Excluir ${item.name}`}
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

function AdminHub({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <section className="admin-hub" aria-labelledby="admin-hub-title">
      <h2 id="admin-hub-title">Área administrativa</h2>
      <p>Escolha uma área para continuar.</p>
      <div className="admin-hub-actions">
        <button className="secondary-button" type="button" onClick={() => onNavigate("admin-users")}><Users aria-hidden="true" size={18} /> Usuários</button>
        <button className="secondary-button" type="button" onClick={() => onNavigate("audits")}><Shield aria-hidden="true" size={18} /> Auditoria</button>
      </div>
    </section>
  );
}

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
    trash: "Lixeira",
    settings: "Configurações",
    profile: "Perfil",
    admin: "Administração",
    "admin-users": "Usuários",
    "admin-scores": "Partituras",
    audits: "Auditoria"
  }[view];
}

function normalizeRole(role: User["role"] | string | undefined) {
  return String(role ?? "").toLowerCase();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function mergeScoreSnapshot(current: Score, incoming: Score): Score {
  if (current.id !== incoming.id) return incoming;
  const incomingIsNewer = compareScoreSnapshots(incoming, current) > 0;
  const newest = incomingIsNewer ? incoming : current;
  const older = incomingIsNewer ? current : incoming;
  return {
    ...older,
    ...newest,
    attempts: newest.attempts ?? older.attempts
  };
}

function mergeScoreList(current: Score[], incoming: Score[]): Score[] {
  const currentById = new Map(current.map((score) => [score.id, score]));
  return incoming.map((score) => {
    const existing = currentById.get(score.id);
    return existing ? mergeScoreSnapshot(existing, score) : score;
  });
}

function compareScoreSnapshots(left: Score, right: Score): number {
  const updatedAtOrder = compareDates(left.updatedAt, right.updatedAt);
  if (updatedAtOrder !== 0) return updatedAtOrder;

  const resultOrder = resultStatusRank(left.resultStatus) - resultStatusRank(right.resultStatus);
  if (resultOrder !== 0) return resultOrder;

  const reviewOrder = reviewStatusRank(left.reviewStatus) - reviewStatusRank(right.reviewStatus);
  if (reviewOrder !== 0) return reviewOrder;

  const leftAttempt = latestAttempt(left);
  const rightAttempt = latestAttempt(right);
  if (!leftAttempt || !rightAttempt) return leftAttempt ? 1 : rightAttempt ? -1 : 0;

  const attemptDateOrder = compareDates(leftAttempt.createdAt, rightAttempt.createdAt);
  if (attemptDateOrder !== 0) return attemptDateOrder;
  return attemptStatusRank(leftAttempt.status) - attemptStatusRank(rightAttempt.status);
}

function reviewStatusRank(status: Score["reviewStatus"]): number {
  if (status === "approved") return 2;
  if (status === "needs_review") return 1;
  return 0;
}

function compareDates(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
  return Math.sign(leftTime - rightTime);
}

function resultStatusRank(status: Score["resultStatus"]): number {
  if (status === "complete") return 2;
  if (status === "partial") return 1;
  return 0;
}

function latestAttempt(score: Score) {
  return [...(score.attempts ?? [])].sort((left, right) => compareDates(right.createdAt, left.createdAt))[0];
}

function attemptStatusRank(status: NonNullable<Score["attempts"]>[number]["status"]): number {
  return {
    queued: 0,
    processing: 1,
    failed: 2,
    partial: 3,
    complete: 4
  }[status];
}
