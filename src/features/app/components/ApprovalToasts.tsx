import { useEffect, useMemo } from "react";
import type { ApprovalDecision, ApprovalRequest, UiLanguage, WorkspaceInfo } from "../../../types";
import { getApprovalCommandInfo } from "../../../utils/approvalRules";

type ApprovalToastsProps = {
  approvals: ApprovalRequest[];
  workspaces: WorkspaceInfo[];
  language?: UiLanguage;
  onDecision: (request: ApprovalRequest, decision: ApprovalDecision) => void;
  onRemember?: (request: ApprovalRequest, command: string[]) => void;
};

export function ApprovalToasts({
  approvals,
  workspaces,
  language = "en",
  onDecision,
  onRemember,
}: ApprovalToastsProps) {
  const isZh = language === "zh";
  const t = (en: string, zh: string) => (isZh ? zh : en);
  const workspaceLabels = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces],
  );

  const primaryRequest = approvals[approvals.length - 1];

  useEffect(() => {
    if (!primaryRequest) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return;
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT")
      ) {
        return;
      }
      event.preventDefault();
      onDecision(primaryRequest, "accept_once");
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDecision, primaryRequest]);

  if (!approvals.length) {
    return null;
  }

  const formatLabel = (value: string) =>
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .trim();

  const methodLabel = (method: string) => {
    const trimmed = method.replace(/^micode\/requestApproval\/?/, "");
    return trimmed || method;
  };

  const renderParamValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return { text: t("None", "无"), isCode: false };
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return { text: String(value), isCode: false };
    }
    if (Array.isArray(value)) {
      if (value.every((entry) => ["string", "number", "boolean"].includes(typeof entry))) {
        return { text: value.map(String).join(", "), isCode: false };
      }
      return { text: JSON.stringify(value, null, 2), isCode: true };
    }
    return { text: JSON.stringify(value, null, 2), isCode: true };
  };

  return (
    <div className="approval-toasts" role="region" aria-live="assertive">
      {approvals.map((request) => {
        const workspaceName = workspaceLabels.get(request.workspace_id);
        const params = request.params ?? {};
        const commandInfo = getApprovalCommandInfo(params);
        const entries = Object.entries(params);
        return (
          <div
            key={`${request.workspace_id}-${request.request_id}`}
            className="approval-toast"
            role="alert"
          >
            <div className="approval-toast-header">
              <div className="approval-toast-title">{t("Approval needed", "需要审批")}</div>
              {workspaceName ? (
                <div className="approval-toast-workspace">{workspaceName}</div>
              ) : null}
            </div>
            <div className="approval-toast-method">{methodLabel(request.method)}</div>
            <div className="approval-toast-details">
              {entries.length ? (
                entries.map(([key, value]) => {
                  const rendered = renderParamValue(value);
                  return (
                    <div key={key} className="approval-toast-detail">
                      <div className="approval-toast-detail-label">
                        {formatLabel(key)}
                      </div>
                      {rendered.isCode ? (
                        <pre className="approval-toast-detail-code">
                          {rendered.text}
                        </pre>
                      ) : (
                        <div className="approval-toast-detail-value">
                          {rendered.text}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="approval-toast-detail approval-toast-detail-empty">
                  {t("No extra details.", "无额外信息。")}
                </div>
              )}
            </div>
            <div className="approval-toast-actions">
              <button
                className="secondary"
                onClick={() => onDecision(request, "decline_once")}
              >
                {t("Decline", "拒绝")}
              </button>
              {commandInfo && onRemember ? (
                <button
                  className="ghost approval-toast-remember"
                  onClick={() => onRemember(request, commandInfo.tokens)}
                  title={t(
                    `Always approve commands that start with ${commandInfo.preview}`,
                    `始终批准以 ${commandInfo.preview} 开头的命令`,
                  )}
                >
                  {t("Always approve", "始终批准")}
                </button>
              ) : null}
              <button
                className="primary"
                onClick={() => onDecision(request, "accept_once")}
              >
                {t("Approve once (Enter)", "本次批准（回车）")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
