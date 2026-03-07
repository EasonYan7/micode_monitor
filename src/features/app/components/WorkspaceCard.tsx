import Check from "lucide-react/dist/esm/icons/check";
import Circle from "lucide-react/dist/esm/icons/circle";
import type { MouseEvent } from "react";

import type { WorkspaceInfo } from "../../../types";
import type { WorkspaceRestoreStatus } from "../../workspaces/hooks/useWorkspaceRestore";

type WorkspaceCardProps = {
  workspace: WorkspaceInfo;
  workspaceName?: React.ReactNode;
  isActive: boolean;
  isCollapsed: boolean;
  addMenuOpen: boolean;
  addMenuWidth: number;
  restoreStatus?: WorkspaceRestoreStatus | null;
  language?: "en" | "zh";
  onSelectWorkspace: (id: string) => void;
  onShowWorkspaceMenu: (event: MouseEvent, workspaceId: string) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onToggleAddMenu: (anchor: {
    workspaceId: string;
    top: number;
    left: number;
    width: number;
  } | null) => void;
  children?: React.ReactNode;
};

export function WorkspaceCard({
  workspace,
  workspaceName,
  isActive,
  isCollapsed,
  addMenuOpen,
  addMenuWidth,
  restoreStatus = null,
  language = "en",
  onSelectWorkspace,
  onShowWorkspaceMenu,
  onToggleWorkspaceCollapse,
  onConnectWorkspace,
  onToggleAddMenu,
  children,
}: WorkspaceCardProps) {
  const contentCollapsedClass = isCollapsed ? " collapsed" : "";
  const isWorktree = (workspace.kind ?? "main") === "worktree";
  const restoreHint =
    restoreStatus === "connecting"
      ? language === "zh"
        ? "正在努力打开工作区..."
        : "Opening workspace..."
      : restoreStatus === "syncing"
        ? language === "zh"
          ? "正在同步历史记录..."
          : "Syncing history..."
        : null;

  return (
    <div className="workspace-card">
      <div
        className={`workspace-row ${isActive ? "active" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelectWorkspace(workspace.id)}
        onContextMenu={(event) => onShowWorkspaceMenu(event, workspace.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectWorkspace(workspace.id);
          }
        }}
      >
        <div>
            <div className="workspace-name-row">
              <div className="workspace-title">
                <span className="workspace-name">{workspaceName ?? workspace.name}</span>
                <span
                  className={`workspace-status-icon ${
                    workspace.connected ? "connected" : "disconnected"
                  }`}
                  title={workspace.connected ? "Connected" : "Needs connection"}
                  aria-label={workspace.connected ? "Connected" : "Needs connection"}
                >
                  {workspace.connected ? <Check aria-hidden /> : <Circle aria-hidden />}
                </span>
                {isWorktree ? <span className="workspace-kind-dot" aria-hidden /> : null}
                <button
                className={`workspace-toggle ${isCollapsed ? "" : "expanded"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleWorkspaceCollapse(workspace.id, !isCollapsed);
                }}
                data-tauri-drag-region="false"
                aria-label={isCollapsed ? "Show agents" : "Hide agents"}
                aria-expanded={!isCollapsed}
              >
                <span className="workspace-toggle-icon">›</span>
              </button>
            </div>
            <button
              className="ghost workspace-add"
              onClick={(event) => {
                event.stopPropagation();
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                const left = Math.min(
                  Math.max(rect.left, 12),
                  window.innerWidth - addMenuWidth - 12,
                );
                const top = rect.bottom + 8;
                onToggleAddMenu(
                  addMenuOpen
                    ? null
                    : {
                        workspaceId: workspace.id,
                        top,
                        left,
                        width: addMenuWidth,
                      },
                );
              }}
              data-tauri-drag-region="false"
              aria-label="Add agent options"
              aria-expanded={addMenuOpen}
            >
              +
            </button>
            {restoreHint ? (
              <div className="workspace-restore-hint" role="status" aria-live="polite">
                {restoreHint}
              </div>
            ) : null}
          </div>
        </div>
        {!workspace.connected && !restoreHint && (
          <span
            className="connect"
            onClick={(event) => {
              event.stopPropagation();
              onConnectWorkspace(workspace);
            }}
          >
            Connect
          </span>
        )}
      </div>
      <div
        className={`workspace-card-content${contentCollapsedClass}`}
        aria-hidden={isCollapsed}
        inert={isCollapsed ? true : undefined}
      >
        <div className="workspace-card-content-inner">{children}</div>
      </div>
    </div>
  );
}
