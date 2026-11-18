import { t } from "../i18n";

const actions: Record<string, [string, string]> = {
  login_success: ["Login realizado", "Signed in"], login_failed: ["Falha no login", "Sign-in failed"], logout: ["Sessão encerrada", "Signed out"],
  role_changed: ["Função alterada", "Role changed"],
  user_created: ["Usuário criado", "User created"], user_updated: ["Usuário atualizado", "User updated"], user_deleted: ["Usuário excluído", "User deleted"],
  user_activated: ["Usuário ativado", "User activated"], user_deactivated: ["Usuário desativado", "User deactivated"], password_changed: ["Senha alterada", "Password changed"],
  score_uploaded: ["Partitura enviada", "Score uploaded"], score_deleted: ["Partitura excluída", "Score deleted"], score_restored: ["Partitura restaurada", "Score restored"], score_reviewed: ["Partitura revisada", "Score reviewed"],
  conversion_queued: ["Conversão na fila", "Conversion queued"], conversion_started: ["Conversão iniciada", "Conversion started"], conversion_completed: ["Conversão concluída", "Conversion completed"], conversion_failed: ["Conversão falhou", "Conversion failed"],
  free_scan_used: ["Conversão gratuita utilizada", "Free scan used"], entitlement_changed: ["Acesso alterado", "Access changed"],
  purchase_failed: ["Compra falhou", "Purchase failed"], purchase_completed: ["Compra concluída", "Purchase completed"], purchase_restored: ["Compra restaurada", "Purchase restored"], purchase_revoked: ["Compra revogada", "Purchase revoked"]
};

export function auditActionLabel(action: string): string {
  const labels = actions[action];
  return labels ? t(...labels) : t("Outro evento", "Other event") + ` (${action})`;
}

export function auditEntityLabel(entity: string | null | undefined): string {
  if (!entity) return "-";
  const labels: Record<string, [string, string]> = { score: ["Partitura", "Score"], user: ["Usuário", "User"], entitlement: ["Acesso", "Access"] };
  return labels[entity] ? t(...labels[entity]) : entity;
}
