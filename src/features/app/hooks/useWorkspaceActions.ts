import type { RefObject } from "react";
import { useCallback } from "react";
import { useNewAgentShortcut } from "./useNewAgentShortcut";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { pushErrorToast } from "../../../services/toasts";

type Params = {
  activeWorkspace: WorkspaceInfo | null;
  isCompact: boolean;
  addWorkspace: () => Promise<WorkspaceInfo | null>;
  addWorkspaceFromPath: (path: string) => Promise<WorkspaceInfo | null>;
  onWorkspaceOpenStart?: () => void;
  onWorkspaceOpenEnd?: () => void;
  setActiveThreadId: (threadId: string | null, workspaceId: string) => void;
  setActiveTab: (tab: "projects" | "micode" | "files" | "log") => void;
  exitDiffView: () => void;
  selectWorkspace: (workspaceId: string) => void;
  onStartNewAgentDraft: (workspaceId: string) => void;
  openWorktreePrompt: (workspace: WorkspaceInfo) => void;
  composerInputRef: RefObject<HTMLTextAreaElement | null>;
  onDebug: (entry: DebugEntry) => void;
};

export function useWorkspaceActions({
  activeWorkspace,
  isCompact,
  addWorkspace,
  addWorkspaceFromPath,
  onWorkspaceOpenStart,
  onWorkspaceOpenEnd,
  setActiveThreadId,
  setActiveTab,
  exitDiffView,
  selectWorkspace,
  onStartNewAgentDraft,
  openWorktreePrompt,
  composerInputRef,
  onDebug,
}: Params) {
  const handleWorkspaceAdded = useCallback(
    (workspace: WorkspaceInfo) => {
      setActiveThreadId(null, workspace.id);
      if (isCompact) {
        setActiveTab("micode");
      }
    },
    [isCompact, setActiveTab, setActiveThreadId],
  );

  const handleAddWorkspace = useCallback(async () => {
    onWorkspaceOpenStart?.();
    try {
      const workspace = await addWorkspace();
      if (workspace) {
        handleWorkspaceAdded(workspace);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onDebug({
        id: `${Date.now()}-client-add-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/add error",
        payload: message,
      });
      pushErrorToast({
        title: "Failed to add workspace",
        message,
      });
    } finally {
      onWorkspaceOpenEnd?.();
    }
  }, [addWorkspace, handleWorkspaceAdded, onDebug, onWorkspaceOpenEnd, onWorkspaceOpenStart]);

  const handleAddWorkspaceFromPath = useCallback(
    async (path: string) => {
      onWorkspaceOpenStart?.();
      try {
        const workspace = await addWorkspaceFromPath(path);
        if (workspace) {
          handleWorkspaceAdded(workspace);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onDebug({
          id: `${Date.now()}-client-add-workspace-error`,
          timestamp: Date.now(),
          source: "error",
          label: "workspace/add error",
          payload: message,
        });
        pushErrorToast({
          title: "Failed to add workspace",
          message,
        });
      } finally {
        onWorkspaceOpenEnd?.();
      }
    },
    [
      addWorkspaceFromPath,
      handleWorkspaceAdded,
      onDebug,
      onWorkspaceOpenEnd,
      onWorkspaceOpenStart,
    ],
  );

  const handleAddAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      selectWorkspace(workspace.id);
      setActiveThreadId(null, workspace.id);
      onStartNewAgentDraft(workspace.id);
      if (isCompact) {
        setActiveTab("micode");
      }
      setTimeout(() => composerInputRef.current?.focus(), 0);
    },
    [
      composerInputRef,
      exitDiffView,
      isCompact,
      onStartNewAgentDraft,
      selectWorkspace,
      setActiveThreadId,
      setActiveTab,
    ],
  );

  const handleAddWorktreeAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      openWorktreePrompt(workspace);
    },
    [exitDiffView, openWorktreePrompt],
  );

  useNewAgentShortcut({
    isEnabled: Boolean(activeWorkspace),
    onTrigger: () => {
      if (activeWorkspace) {
        void handleAddAgent(activeWorkspace);
      }
    },
  });

  return {
    handleAddWorkspace,
    handleAddWorkspaceFromPath,
    handleAddAgent,
    handleAddWorktreeAgent,
  };
}
