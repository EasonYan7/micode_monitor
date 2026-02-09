import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles/base.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/workspace-home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approval-toasts.css";
import "./styles/error-toasts.css";
import "./styles/request-user-input.css";
import "./styles/update-toasts.css";
import "./styles/composer.css";
import "./styles/review-inline.css";
import "./styles/diff.css";
import "./styles/diff-viewer.css";
import "./styles/file-tree.css";
import "./styles/panel-tabs.css";
import "./styles/prompts.css";
import "./styles/debug.css";
import "./styles/terminal.css";
import "./styles/plan.css";
import "./styles/about.css";
import "./styles/tabbar.css";
import "./styles/worktree-modal.css";
import "./styles/branch-switcher-modal.css";
import "./styles/settings.css";
import "./styles/compact-base.css";
import "./styles/compact-phone.css";
import "./styles/compact-tablet.css";
import successSoundUrl from "./assets/success-notification.mp3";
import errorSoundUrl from "./assets/error-notification.mp3";
import { AppLayout } from "./features/app/components/AppLayout";
import { AppModals } from "./features/app/components/AppModals";
import { MainHeaderActions } from "./features/app/components/MainHeaderActions";
import { useLayoutNodes } from "./features/layout/hooks/useLayoutNodes";
import { useWorkspaceDropZone } from "./features/workspaces/hooks/useWorkspaceDropZone";
import { useThreads } from "./features/threads/hooks/useThreads";
import { useWindowDrag } from "./features/layout/hooks/useWindowDrag";
import { useGitPanelController } from "./features/app/hooks/useGitPanelController";
import { useGitRemote } from "./features/git/hooks/useGitRemote";
import { useGitRepoScan } from "./features/git/hooks/useGitRepoScan";
import { usePullRequestComposer } from "./features/git/hooks/usePullRequestComposer";
import { useGitActions } from "./features/git/hooks/useGitActions";
import { useAutoExitEmptyDiff } from "./features/git/hooks/useAutoExitEmptyDiff";
import { useModels } from "./features/models/hooks/useModels";
import { useCollaborationModes } from "./features/collaboration/hooks/useCollaborationModes";
import { useCollaborationModeSelection } from "./features/collaboration/hooks/useCollaborationModeSelection";
import { useSkills } from "./features/skills/hooks/useSkills";
import { useApps } from "./features/apps/hooks/useApps";
import { useCustomPrompts } from "./features/prompts/hooks/useCustomPrompts";
import { useWorkspaceFileListing } from "./features/app/hooks/useWorkspaceFileListing";
import { useGitBranches } from "./features/git/hooks/useGitBranches";
import { useBranchSwitcher } from "./features/git/hooks/useBranchSwitcher";
import { useBranchSwitcherShortcut } from "./features/git/hooks/useBranchSwitcherShortcut";
import { useDebugLog } from "./features/debug/hooks/useDebugLog";
import { useWorkspaceRefreshOnFocus } from "./features/workspaces/hooks/useWorkspaceRefreshOnFocus";
import { useWorkspaceRestore } from "./features/workspaces/hooks/useWorkspaceRestore";
import { useRenameWorktreePrompt } from "./features/workspaces/hooks/useRenameWorktreePrompt";
import { useLayoutController } from "./features/app/hooks/useLayoutController";
import { useWindowLabel } from "./features/layout/hooks/useWindowLabel";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  SidebarCollapseButton,
  TitlebarExpandControls,
} from "./features/layout/components/SidebarToggleControls";
import { useAppSettingsController } from "./features/app/hooks/useAppSettingsController";
import { useUpdaterController } from "./features/app/hooks/useUpdaterController";
import { useResponseRequiredNotificationsController } from "./features/app/hooks/useResponseRequiredNotificationsController";
import { useErrorToasts } from "./features/notifications/hooks/useErrorToasts";
import { useComposerShortcuts } from "./features/composer/hooks/useComposerShortcuts";
import { useComposerMenuActions } from "./features/composer/hooks/useComposerMenuActions";
import { useComposerEditorState } from "./features/composer/hooks/useComposerEditorState";
import { useDictationController } from "./features/app/hooks/useDictationController";
import { useComposerController } from "./features/app/hooks/useComposerController";
import { useComposerInsert } from "./features/app/hooks/useComposerInsert";
import { useRenameThreadPrompt } from "./features/threads/hooks/useRenameThreadPrompt";
import { useWorktreePrompt } from "./features/workspaces/hooks/useWorktreePrompt";
import { useWorkspaceController } from "./features/app/hooks/useWorkspaceController";
import { useWorkspaceSelection } from "./features/workspaces/hooks/useWorkspaceSelection";
import { useLocalUsage } from "./features/home/hooks/useLocalUsage";
import { useGitHubPanelController } from "./features/app/hooks/useGitHubPanelController";
import { useSettingsModalState } from "./features/app/hooks/useSettingsModalState";
import { usePersistComposerSettings } from "./features/app/hooks/usePersistComposerSettings";
import { useSyncSelectedDiffPath } from "./features/app/hooks/useSyncSelectedDiffPath";
import { useMenuAcceleratorController } from "./features/app/hooks/useMenuAcceleratorController";
import { useAppMenuEvents } from "./features/app/hooks/useAppMenuEvents";
import { useWorkspaceActions } from "./features/app/hooks/useWorkspaceActions";
import { useWorkspaceCycling } from "./features/app/hooks/useWorkspaceCycling";
import { useThreadRows } from "./features/app/hooks/useThreadRows";
import { useInterruptShortcut } from "./features/app/hooks/useInterruptShortcut";
import { useArchiveShortcut } from "./features/app/hooks/useArchiveShortcut";
import { useLiquidGlassEffect } from "./features/app/hooks/useLiquidGlassEffect";
import { useCopyThread } from "./features/threads/hooks/useCopyThread";
import { useTerminalController } from "./features/terminal/hooks/useTerminalController";
import { useWorkspaceLaunchScript } from "./features/app/hooks/useWorkspaceLaunchScript";
import { useWorkspaceLaunchScripts } from "./features/app/hooks/useWorkspaceLaunchScripts";
import { useWorktreeSetupScript } from "./features/app/hooks/useWorktreeSetupScript";
import { useGitCommitController } from "./features/app/hooks/useGitCommitController";
import { WorkspaceHome } from "./features/workspaces/components/WorkspaceHome";
import { useWorkspaceHome } from "./features/workspaces/hooks/useWorkspaceHome";
import { useWorkspaceAgentMd } from "./features/workspaces/hooks/useWorkspaceAgentMd";
import { pickWorkspacePath } from "./services/tauri";
import type {
  AccessMode,
  ComposerEditorSettings,
  LocalUsageSnapshot,
  ThreadTokenUsage,
  WorkspaceInfo,
} from "./types";
import { OPEN_APP_STORAGE_KEY } from "./features/app/constants";
import { useOpenAppIcons } from "./features/app/hooks/useOpenAppIcons";
import { useCodeCssVars } from "./features/app/hooks/useCodeCssVars";
import { useAccountSwitching } from "./features/app/hooks/useAccountSwitching";
import { useNewAgentDraft } from "./features/app/hooks/useNewAgentDraft";
import { useSystemNotificationThreadLinks } from "./features/app/hooks/useSystemNotificationThreadLinks";
import { pushErrorToast } from "./services/toasts";

const AboutView = lazy(() =>
  import("./features/about/components/AboutView").then((module) => ({
    default: module.AboutView,
  })),
);

function mergeTokenUsage(
  usages: Array<ThreadTokenUsage | null | undefined>,
): ThreadTokenUsage | null {
  let hasUsage = false;
  const merged: ThreadTokenUsage = {
    total: {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    },
    last: {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    },
    modelContextWindow: null,
  };

  usages.forEach((usage) => {
    if (!usage) {
      return;
    }
    hasUsage = true;
    merged.total.totalTokens += usage.total.totalTokens;
    merged.total.inputTokens += usage.total.inputTokens;
    merged.total.cachedInputTokens += usage.total.cachedInputTokens;
    merged.total.outputTokens += usage.total.outputTokens;
    merged.total.reasoningOutputTokens += usage.total.reasoningOutputTokens;
    merged.last.totalTokens += usage.last.totalTokens;
    merged.last.inputTokens += usage.last.inputTokens;
    merged.last.cachedInputTokens += usage.last.cachedInputTokens;
    merged.last.outputTokens += usage.last.outputTokens;
    merged.last.reasoningOutputTokens += usage.last.reasoningOutputTokens;
  });

  return hasUsage ? merged : null;
}

function formatLocalDayKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildSyntheticUsageSnapshot(
  threads: Array<{ updatedAt: number; usage: ThreadTokenUsage }>,
  days = 30,
): LocalUsageSnapshot | null {
  if (!threads.length) {
    return null;
  }
  const clampedDays = Math.min(Math.max(days, 1), 90);
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dailyKeys: string[] = [];
  const buckets = new Map<
    string,
    {
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      totalTokens: number;
      agentTimeMs: number;
      agentRuns: number;
    }
  >();
  for (let i = clampedDays - 1; i >= 0; i -= 1) {
    const ms = dayStart.getTime() - i * 24 * 60 * 60 * 1000;
    const key = formatLocalDayKey(ms);
    dailyKeys.push(key);
    buckets.set(key, {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      agentTimeMs: 0,
      agentRuns: 0,
    });
  }

  threads.forEach(({ updatedAt, usage }) => {
    const timestampMs = updatedAt > 1_000_000_000_000 ? updatedAt : updatedAt * 1000;
    const key = formatLocalDayKey(timestampMs);
    const bucket = buckets.get(key);
    if (!bucket) {
      return;
    }
    bucket.inputTokens += usage.total.inputTokens;
    bucket.cachedInputTokens += usage.total.cachedInputTokens;
    bucket.outputTokens += usage.total.outputTokens;
    bucket.totalTokens += usage.total.totalTokens;
    bucket.agentRuns += 1;
  });

  const daysData = dailyKeys.map((key) => ({
    day: key,
    ...(buckets.get(key) ?? {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      agentTimeMs: 0,
      agentRuns: 0,
    }),
  }));

  const last7 = daysData.slice(-7);
  const last7DaysTokens = last7.reduce((sum, day) => sum + day.totalTokens, 0);
  const last30DaysTokens = daysData.reduce((sum, day) => sum + day.totalTokens, 0);
  if (last30DaysTokens <= 0) {
    return null;
  }
  const averageDailyTokens =
    last7.length > 0 ? Math.round(last7DaysTokens / last7.length) : 0;
  const last7InputTokens = last7.reduce((sum, day) => sum + day.inputTokens, 0);
  const last7CachedTokens = last7.reduce((sum, day) => sum + day.cachedInputTokens, 0);
  const cacheHitRatePercent =
    last7InputTokens > 0
      ? Math.round((last7CachedTokens / last7InputTokens) * 1000) / 10
      : 0;
  const peak = daysData.reduce<{ day: string; totalTokens: number } | null>((best, day) => {
    if (day.totalTokens <= 0) {
      return best;
    }
    if (!best || day.totalTokens > best.totalTokens) {
      return { day: day.day, totalTokens: day.totalTokens };
    }
    return best;
  }, null);

  return {
    updatedAt: now,
    days: daysData,
    totals: {
      last7DaysTokens,
      last30DaysTokens,
      averageDailyTokens,
      cacheHitRatePercent,
      peakDay: peak?.day ?? null,
      peakDayTokens: peak?.totalTokens ?? 0,
    },
    topModels: [],
  };
}

function isMiCodeMissingError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = message.toLowerCase();
  return (
    normalized.includes("micode cli not found") ||
    normalized.includes("install micode") ||
    (normalized.includes("micode") && normalized.includes("not found"))
  );
}

const SettingsView = lazy(() =>
  import("./features/settings/components/SettingsView").then((module) => ({
    default: module.SettingsView,
  })),
);

const GitHubPanelData = lazy(() =>
  import("./features/git/components/GitHubPanelData").then((module) => ({
    default: module.GitHubPanelData,
  })),
);


function MainApp() {
  const {
    appSettings,
    setAppSettings,
    doctor,
    appSettingsLoading,
    reduceTransparency,
    setReduceTransparency,
    scaleShortcutTitle,
    scaleShortcutText,
    queueSaveSettings,
  } = useAppSettingsController();
  const missingMiCodeHintShownRef = useRef(false);
  useCodeCssVars(appSettings);
  const {
    dictationModel,
    dictationState,
    dictationLevel,
    dictationTranscript,
    dictationError,
    dictationHint,
    dictationReady,
    handleToggleDictation,
    clearDictationTranscript,
    clearDictationError,
    clearDictationHint,
  } = useDictationController(appSettings);

  useEffect(() => {
    if (appSettingsLoading || missingMiCodeHintShownRef.current) {
      return;
    }
    let canceled = false;
    const micodeBin = appSettings.agentBin ?? appSettings.micodeBin ?? null;
    const micodeArgs = appSettings.agentArgs ?? appSettings.micodeArgs ?? null;
    void doctor(micodeBin, micodeArgs).catch((error) => {
      if (canceled || !isMiCodeMissingError(error)) {
        return;
      }
      missingMiCodeHintShownRef.current = true;
      pushErrorToast({
        title:
          appSettings.language === "zh"
            ? "未检测到 MiCode CLI"
            : "MiCode CLI not found",
        message:
          appSettings.language === "zh"
            ? "请先安装 MiCode CLI，并在终端确认 `micode --version` 可用。可在 设置 > MiCode 里运行诊断。"
            : "Install MiCode CLI first and verify `micode --version` in Terminal. You can run Doctor in Settings > MiCode.",
        durationMs: 12000,
      });
    });
    return () => {
      canceled = true;
    };
  }, [
    appSettings.agentArgs,
    appSettings.agentBin,
    appSettings.language,
    appSettings.micodeArgs,
    appSettings.micodeBin,
    appSettingsLoading,
    doctor,
  ]);
  const {
    debugOpen,
    setDebugOpen,
    debugEntries,
    showDebugButton,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries,
  } = useDebugLog();
  useLiquidGlassEffect({ reduceTransparency, onDebug: addDebugEntry });
  const [accessMode, setAccessMode] = useState<AccessMode>("current");
  const [activeTab, setActiveTab] = useState<
    "projects" | "micode" | "git" | "log"
  >("micode");
  const tabletTab = activeTab === "projects" ? "micode" : activeTab;
  const {
    workspaces,
    workspaceGroups,
    groupedWorkspaces,
    getWorkspaceGroupName,
    ungroupedLabel,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    addWorkspace,
    addWorkspaceFromPath,
    addWorktreeAgent,
    connectWorkspace,
    markWorkspaceConnected,
    updateWorkspaceSettings,
    updateWorkspaceMiCodeBin,
    createWorkspaceGroup,
    renameWorkspaceGroup,
    moveWorkspaceGroup,
    deleteWorkspaceGroup,
    assignWorkspaceGroup,
    removeWorkspace,
    clearWorkspaceHistory,
    removeWorktree,
    renameWorktree,
    renameWorktreeUpstream,
    deletingWorktreeIds,
    hasLoaded,
    refreshWorkspaces,
  } = useWorkspaceController({
    appSettings,
    addDebugEntry,
    queueSaveSettings,
  });
  const workspacesById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const {
    sidebarWidth,
    rightPanelWidth,
    onSidebarResizeStart,
    onRightPanelResizeStart,
    planPanelHeight,
    onPlanPanelResizeStart,
    terminalPanelHeight,
    onTerminalPanelResizeStart,
    debugPanelHeight,
    onDebugPanelResizeStart,
    isCompact,
    isTablet,
    isPhone,
    sidebarCollapsed,
    rightPanelCollapsed,
    collapseSidebar,
    expandSidebar,
    collapseRightPanel,
    expandRightPanel,
    terminalOpen,
    handleDebugClick,
    handleToggleTerminal,
    openTerminal,
    closeTerminal: closeTerminalPanel,
  } = useLayoutController({
    activeWorkspaceId,
    setActiveTab,
    setDebugOpen,
    toggleDebugPanelShortcut: appSettings.toggleDebugPanelShortcut,
    toggleTerminalShortcut: appSettings.toggleTerminalShortcut,
  });
  const sidebarToggleProps = {
    isCompact,
    sidebarCollapsed,
    rightPanelCollapsed,
    onCollapseSidebar: collapseSidebar,
    onExpandSidebar: expandSidebar,
    onCollapseRightPanel: collapseRightPanel,
    onExpandRightPanel: expandRightPanel,
  };
  const {
    settingsOpen,
    settingsSection,
    openSettings,
    closeSettings,
  } = useSettingsModalState();
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceHomeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const getWorkspaceName = useCallback(
    (workspaceId: string) => workspacesById.get(workspaceId)?.name,
    [workspacesById],
  );

  const recordPendingThreadLinkRef = useRef<
    (workspaceId: string, threadId: string) => void
  >(() => {});

  const {
    updaterState,
    startUpdate,
    dismissUpdate,
    handleTestNotificationSound,
    handleTestSystemNotification,
  } = useUpdaterController({
    notificationSoundsEnabled: appSettings.notificationSoundsEnabled,
    systemNotificationsEnabled: appSettings.systemNotificationsEnabled,
    getWorkspaceName,
    onThreadNotificationSent: (workspaceId, threadId) =>
      recordPendingThreadLinkRef.current(workspaceId, threadId),
    onDebug: addDebugEntry,
    successSoundUrl,
    errorSoundUrl,
  });

  const { errorToasts, dismissErrorToast } = useErrorToasts();

  useEffect(() => {
    setAccessMode((prev) =>
      prev === "current" ? appSettings.defaultAccessMode : prev
    );
  }, [appSettings.defaultAccessMode]);

  const {
    gitIssues,
    gitIssuesTotal,
    gitIssuesLoading,
    gitIssuesError,
    gitPullRequests,
    gitPullRequestsTotal,
    gitPullRequestsLoading,
    gitPullRequestsError,
    gitPullRequestDiffs,
    gitPullRequestDiffsLoading,
    gitPullRequestDiffsError,
    gitPullRequestComments,
    gitPullRequestCommentsLoading,
    gitPullRequestCommentsError,
    handleGitIssuesChange,
    handleGitPullRequestsChange,
    handleGitPullRequestDiffsChange,
    handleGitPullRequestCommentsChange,
    resetGitHubPanelState,
  } = useGitHubPanelController();

  const {
    centerMode,
    setCenterMode,
    selectedDiffPath,
    setSelectedDiffPath,
    diffScrollRequestId,
    gitPanelMode,
    setGitPanelMode,
    gitDiffViewStyle,
    setGitDiffViewStyle,
    filePanelMode,
    setFilePanelMode,
    selectedPullRequest,
    setSelectedPullRequest,
    selectedCommitSha,
    setSelectedCommitSha,
    diffSource,
    setDiffSource,
    gitStatus,
    refreshGitStatus,
    queueGitStatusRefresh,
    refreshGitDiffs,
    gitLogEntries,
    gitLogTotal,
    gitLogAhead,
    gitLogBehind,
    gitLogAheadEntries,
    gitLogBehindEntries,
    gitLogUpstream,
    gitLogLoading,
    gitLogError,
    refreshGitLog,
    gitCommitDiffs,
    shouldLoadDiffs,
    activeDiffs,
    activeDiffLoading,
    activeDiffError,
    handleSelectDiff,
    handleSelectCommit,
    handleActiveDiffPath,
    handleGitPanelModeChange,
    activeWorkspaceIdRef,
    activeWorkspaceRef,
  } = useGitPanelController({
    activeWorkspace,
    gitDiffPreloadEnabled: appSettings.preloadGitDiffs,
    gitDiffIgnoreWhitespaceChanges: appSettings.gitDiffIgnoreWhitespaceChanges,
    isCompact,
    isTablet,
    activeTab,
    tabletTab,
    setActiveTab,
    prDiffs: gitPullRequestDiffs,
    prDiffsLoading: gitPullRequestDiffsLoading,
    prDiffsError: gitPullRequestDiffsError,
  });

  const shouldLoadGitHubPanelData =
    gitPanelMode === "issues" ||
    gitPanelMode === "prs" ||
    (shouldLoadDiffs && diffSource === "pr");

  useEffect(() => {
    resetGitHubPanelState();
  }, [activeWorkspaceId, resetGitHubPanelState]);
  const { remote: gitRemoteUrl } = useGitRemote(activeWorkspace);
  const {
    repos: gitRootCandidates,
    isLoading: gitRootScanLoading,
    error: gitRootScanError,
    depth: gitRootScanDepth,
    hasScanned: gitRootScanHasScanned,
    scan: scanGitRoots,
    setDepth: setGitRootScanDepth,
    clear: clearGitRootCandidates,
  } = useGitRepoScan(activeWorkspace);
  const {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    reasoningSupported,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort
  } = useModels({
    activeWorkspace,
    onDebug: addDebugEntry,
    preferredModelId: appSettings.lastComposerModelId,
    preferredEffort: appSettings.lastComposerReasoningEffort,
  });

  const {
    collaborationModes,
    selectedCollaborationMode,
    selectedCollaborationModeId,
    setSelectedCollaborationModeId,
  } = useCollaborationModes({
    activeWorkspace,
    enabled: appSettings.collaborationModesEnabled,
    onDebug: addDebugEntry,
  });

  const composerShortcuts = {
    modelShortcut: appSettings.composerModelShortcut,
    accessShortcut: appSettings.composerAccessShortcut,
    reasoningShortcut: appSettings.composerReasoningShortcut,
    collaborationShortcut: appSettings.collaborationModesEnabled
      ? appSettings.composerCollaborationShortcut
      : null,
    models,
    collaborationModes,
    selectedModelId,
    onSelectModel: setSelectedModelId,
    selectedCollaborationModeId,
    onSelectCollaborationMode: setSelectedCollaborationModeId,
    accessMode,
    onSelectAccessMode: setAccessMode,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: setSelectedEffort,
    reasoningSupported,
  };

  useComposerShortcuts({
    textareaRef: composerInputRef,
    ...composerShortcuts,
  });

  useComposerShortcuts({
    textareaRef: workspaceHomeTextareaRef,
    ...composerShortcuts,
  });

  useComposerMenuActions({
    models,
    selectedModelId,
    onSelectModel: setSelectedModelId,
    collaborationModes,
    selectedCollaborationModeId,
    onSelectCollaborationMode: setSelectedCollaborationModeId,
    accessMode,
    onSelectAccessMode: setAccessMode,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: setSelectedEffort,
    reasoningSupported,
    onFocusComposer: () => composerInputRef.current?.focus(),
  });
  const { skills } = useSkills({ activeWorkspace, onDebug: addDebugEntry });
  const { apps } = useApps({
    activeWorkspace,
    enabled: appSettings.experimentalAppsEnabled,
    onDebug: addDebugEntry,
  });
  const {
    prompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    movePrompt,
    getWorkspacePromptsDir,
    getGlobalPromptsDir,
  } = useCustomPrompts({ activeWorkspace, onDebug: addDebugEntry });
  const { branches, checkoutBranch, createBranch } = useGitBranches({
    activeWorkspace,
    onDebug: addDebugEntry
  });
  const handleCheckoutBranch = async (name: string) => {
    await checkoutBranch(name);
    refreshGitStatus();
  };
  const handleCreateBranch = async (name: string) => {
    await createBranch(name);
    refreshGitStatus();
  };
  const currentBranch = gitStatus.branchName ?? null;
  const {
    branchSwitcher,
    openBranchSwitcher,
    closeBranchSwitcher,
    handleBranchSelect,
  } = useBranchSwitcher({
    activeWorkspace,
    checkoutBranch: handleCheckoutBranch,
    setActiveWorkspaceId,
  });
  const isBranchSwitcherEnabled =
    Boolean(activeWorkspace?.connected) && activeWorkspace?.kind !== "worktree";
  useBranchSwitcherShortcut({
    shortcut: appSettings.branchSwitcherShortcut,
    isEnabled: isBranchSwitcherEnabled,
    onTrigger: openBranchSwitcher,
  });
  const alertError = useCallback((error: unknown) => {
    alert(error instanceof Error ? error.message : String(error));
  }, []);
  const {
    applyWorktreeChanges: handleApplyWorktreeChanges,
    revertAllGitChanges: handleRevertAllGitChanges,
    revertGitFile: handleRevertGitFile,
    stageGitAll: handleStageGitAll,
    stageGitFile: handleStageGitFile,
    unstageGitFile: handleUnstageGitFile,
    worktreeApplyError,
    worktreeApplyLoading,
    worktreeApplySuccess,
  } = useGitActions({
    activeWorkspace,
    onRefreshGitStatus: refreshGitStatus,
    onRefreshGitDiffs: refreshGitDiffs,
    onError: alertError,
  });

  const resolvedModel = selectedModel?.model ?? null;
  const resolvedEffort = reasoningSupported ? selectedEffort : null;
  const activeGitRoot = activeWorkspace?.settings.gitRoot ?? null;
  const normalizePath = useCallback((value: string) => {
    return value.replace(/\\/g, "/").replace(/\/+$/, "");
  }, []);
  const handleSetGitRoot = useCallback(
    async (path: string | null) => {
      if (!activeWorkspace) {
        return;
      }
      await updateWorkspaceSettings(activeWorkspace.id, {
        gitRoot: path,
      });
      clearGitRootCandidates();
      refreshGitStatus();
    },
    [
      activeWorkspace,
      clearGitRootCandidates,
      refreshGitStatus,
      updateWorkspaceSettings,
    ],
  );
  const handlePickGitRoot = useCallback(async () => {
    if (!activeWorkspace) {
      return;
    }
    const selection = await pickWorkspacePath();
    if (!selection) {
      return;
    }
    const workspacePath = normalizePath(activeWorkspace.path);
    const selectedPath = normalizePath(selection);
    let nextRoot: string | null = null;
    if (selectedPath === workspacePath) {
      nextRoot = null;
    } else if (selectedPath.startsWith(`${workspacePath}/`)) {
      nextRoot = selectedPath.slice(workspacePath.length + 1);
    } else {
      nextRoot = selectedPath;
    }
    await handleSetGitRoot(nextRoot);
  }, [activeWorkspace, handleSetGitRoot, normalizePath]);
  const fileStatus =
    gitStatus.error
      ? "Git status unavailable"
      : gitStatus.files.length > 0
        ? `${gitStatus.files.length} file${
            gitStatus.files.length === 1 ? "" : "s"
          } changed`
        : "Working tree clean";

  usePersistComposerSettings({
    appSettingsLoading,
    selectedModelId,
    selectedEffort,
    setAppSettings,
    queueSaveSettings,
  });

  const { isExpanded: composerEditorExpanded, toggleExpanded: toggleComposerEditorExpanded } =
    useComposerEditorState();

  const composerEditorSettings = useMemo<ComposerEditorSettings>(
    () => ({
      preset: appSettings.composerEditorPreset,
      expandFenceOnSpace: appSettings.composerFenceExpandOnSpace,
      expandFenceOnEnter: appSettings.composerFenceExpandOnEnter,
      fenceLanguageTags: appSettings.composerFenceLanguageTags,
      fenceWrapSelection: appSettings.composerFenceWrapSelection,
      autoWrapPasteMultiline: appSettings.composerFenceAutoWrapPasteMultiline,
      autoWrapPasteCodeLike: appSettings.composerFenceAutoWrapPasteCodeLike,
      continueListOnShiftEnter: appSettings.composerListContinuation,
    }),
    [
      appSettings.composerEditorPreset,
      appSettings.composerFenceExpandOnSpace,
      appSettings.composerFenceExpandOnEnter,
      appSettings.composerFenceLanguageTags,
      appSettings.composerFenceWrapSelection,
      appSettings.composerFenceAutoWrapPasteMultiline,
      appSettings.composerFenceAutoWrapPasteCodeLike,
      appSettings.composerListContinuation,
    ],
  );


  useSyncSelectedDiffPath({
    diffSource,
    centerMode,
    gitPullRequestDiffs,
    gitCommitDiffs,
    selectedDiffPath,
    setSelectedDiffPath,
  });

  const { collaborationModePayload } = useCollaborationModeSelection({
    selectedCollaborationMode,
    selectedCollaborationModeId,
    selectedEffort: resolvedEffort,
    resolvedModel,
  });

  const {
    setActiveThreadId,
    activeThreadId,
    activeItems,
    approvals,
    userInputRequests,
    threadsByWorkspace,
    threadParentById,
    threadStatusById,
    threadResumeLoadingById,
    threadListLoadingByWorkspace,
    threadListPagingByWorkspace,
    threadListCursorByWorkspace,
    activeTurnIdByThread,
    tokenUsageByThread,
    rateLimitsByWorkspace,
    accountByWorkspace,
    planByThread,
    lastAgentMessageByThread,
    activeSlashCommands,
    interruptTurn,
    removeThread,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    renameThread,
    startThreadForWorkspace,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    resetWorkspaceThreads,
    refreshThread,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startCompact,
    startApps,
    startSkills,
    startMcp,
    startStatus,
    reviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
    handleApprovalDecision,
    handleApprovalRemember,
    handleUserInputSubmit,
    refreshAccountInfo,
    refreshAccountRateLimits,
  } = useThreads({
    activeWorkspace,
    onWorkspaceConnected: markWorkspaceConnected,
    onDebug: addDebugEntry,
    model: resolvedModel,
    effort: resolvedEffort,
    collaborationMode: collaborationModePayload,
    accessMode,
    reviewDeliveryMode: appSettings.reviewDeliveryMode,
    steerEnabled: appSettings.steerEnabled,
    customPrompts: prompts,
    onMessageActivity: queueGitStatusRefresh
  });

  useResponseRequiredNotificationsController({
    systemNotificationsEnabled: appSettings.systemNotificationsEnabled,
    approvals,
    userInputRequests,
    getWorkspaceName,
    onDebug: addDebugEntry,
  });

  const {
    activeAccount,
    accountSwitching,
    handleSwitchAccount,
    handleCancelSwitchAccount,
  } = useAccountSwitching({
    activeWorkspaceId,
    accountByWorkspace,
    refreshAccountInfo,
    refreshAccountRateLimits,
    alertError,
  });
  const {
    newAgentDraftWorkspaceId,
    startingDraftThreadWorkspaceId,
    isDraftModeForActiveWorkspace: isNewAgentDraftMode,
    startNewAgentDraft,
    clearDraftState,
    clearDraftStateIfDifferentWorkspace,
    runWithDraftStart,
  } = useNewAgentDraft({
    activeWorkspace,
    activeWorkspaceId,
    activeThreadId,
  });
  const activeThreadIdRef = useRef<string | null>(activeThreadId ?? null);
  const { getThreadRows } = useThreadRows(threadParentById);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId ?? null;
  }, [activeThreadId]);

  const { recordPendingThreadLink } = useSystemNotificationThreadLinks({
    hasLoadedWorkspaces: hasLoaded,
    workspacesById,
    refreshWorkspaces,
    connectWorkspace,
    setActiveTab,
    setCenterMode,
    setSelectedDiffPath,
    setActiveWorkspaceId,
    setActiveThreadId,
  });

  useEffect(() => {
    recordPendingThreadLinkRef.current = recordPendingThreadLink;
    return () => {
      recordPendingThreadLinkRef.current = () => {};
    };
  }, [recordPendingThreadLink]);

  useAutoExitEmptyDiff({
    centerMode,
    autoExitEnabled: diffSource === "local",
    activeDiffCount: activeDiffs.length,
    activeDiffLoading,
    activeDiffError,
    activeThreadId,
    isCompact,
    setCenterMode,
    setSelectedDiffPath,
    setActiveTab,
  });

  const { handleCopyThread } = useCopyThread({
    activeItems,
    onDebug: addDebugEntry,
  });

  const {
    renamePrompt,
    openRenamePrompt,
    handleRenamePromptChange,
    handleRenamePromptCancel,
    handleRenamePromptConfirm,
  } = useRenameThreadPrompt({
    threadsByWorkspace,
    renameThread,
  });

  const {
    renamePrompt: renameWorktreePrompt,
    notice: renameWorktreeNotice,
    upstreamPrompt: renameWorktreeUpstreamPrompt,
    confirmUpstream: confirmRenameWorktreeUpstream,
    openRenamePrompt: openRenameWorktreePrompt,
    handleRenameChange: handleRenameWorktreeChange,
    handleRenameCancel: handleRenameWorktreeCancel,
    handleRenameConfirm: handleRenameWorktreeConfirm,
  } = useRenameWorktreePrompt({
    workspaces,
    activeWorkspaceId,
    renameWorktree,
    renameWorktreeUpstream,
    onRenameSuccess: (workspace) => {
      resetWorkspaceThreads(workspace.id);
      void listThreadsForWorkspace(workspace);
      if (activeThreadId && activeWorkspaceId === workspace.id) {
        void refreshThread(workspace.id, activeThreadId);
      }
    },
  });

  const handleRenameThread = useCallback(
    (workspaceId: string, threadId: string) => {
      openRenamePrompt(workspaceId, threadId);
    },
    [openRenamePrompt],
  );

  const handleOpenRenameWorktree = useCallback(() => {
    if (activeWorkspace) {
      openRenameWorktreePrompt(activeWorkspace.id);
    }
  }, [activeWorkspace, openRenameWorktreePrompt]);

  const {
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    ensureTerminalWithTitle,
    restartTerminalSession,
  } = useTerminalController({
    activeWorkspaceId,
    activeWorkspace,
    terminalOpen,
    onCloseTerminalPanel: closeTerminalPanel,
    onDebug: addDebugEntry,
  });

  const ensureLaunchTerminal = useCallback(
    (workspaceId: string) => ensureTerminalWithTitle(workspaceId, "launch", "Launch"),
    [ensureTerminalWithTitle],
  );

  const launchScriptState = useWorkspaceLaunchScript({
    activeWorkspace,
    updateWorkspaceSettings,
    openTerminal,
    ensureLaunchTerminal,
    restartLaunchSession: restartTerminalSession,
    terminalState,
    activeTerminalId,
  });

  const launchScriptsState = useWorkspaceLaunchScripts({
    activeWorkspace,
    updateWorkspaceSettings,
    openTerminal,
    ensureLaunchTerminal: (workspaceId, entry, title) => {
      const label = entry.label?.trim() || entry.icon;
      return ensureTerminalWithTitle(
        workspaceId,
        `launch:${entry.id}`,
        title || `Launch ${label}`,
      );
    },
    restartLaunchSession: restartTerminalSession,
    terminalState,
    activeTerminalId,
  });

  const worktreeSetupScriptState = useWorktreeSetupScript({
    ensureTerminalWithTitle,
    restartTerminalSession,
    openTerminal,
    onDebug: addDebugEntry,
  });

  const handleWorktreeCreated = useCallback(
    async (worktree: WorkspaceInfo, _parentWorkspace?: WorkspaceInfo) => {
      await worktreeSetupScriptState.maybeRunWorktreeSetupScript(worktree);
    },
    [worktreeSetupScriptState],
  );

  const { exitDiffView, selectWorkspace, selectHome } = useWorkspaceSelection({
    workspaces,
    isCompact,
    activeWorkspaceId,
    setActiveTab,
    setActiveWorkspaceId,
    updateWorkspaceSettings,
    setCenterMode,
    setSelectedDiffPath,
  });
  const {
    worktreePrompt,
    openPrompt: openWorktreePrompt,
    confirmPrompt: confirmWorktreePrompt,
    cancelPrompt: cancelWorktreePrompt,
    updateName: updateWorktreeName,
    updateBranch: updateWorktreeBranch,
    updateCopyAgentsMd: updateWorktreeCopyAgentsMd,
    updateSetupScript: updateWorktreeSetupScript,
  } = useWorktreePrompt({
    addWorktreeAgent,
    updateWorkspaceSettings,
    connectWorkspace,
    onSelectWorkspace: selectWorkspace,
    onWorktreeCreated: handleWorktreeCreated,
    onCompactActivate: isCompact ? () => setActiveTab("micode") : undefined,
    onError: (message) => {
      addDebugEntry({
        id: `${Date.now()}-client-add-worktree-error`,
        timestamp: Date.now(),
        source: "error",
        label: "worktree/add error",
        payload: message,
      });
    },
  });

  const handleSelectOpenAppId = useCallback(
    (id: string) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(OPEN_APP_STORAGE_KEY, id);
      }
      setAppSettings((current) => {
        if (current.selectedOpenAppId === id) {
          return current;
        }
        const nextSettings = {
          ...current,
          selectedOpenAppId: id,
        };
        void queueSaveSettings(nextSettings);
        return nextSettings;
      });
    },
    [queueSaveSettings, setAppSettings],
  );

  const openAppIconById = useOpenAppIcons(appSettings.openAppTargets);

  const handleUpdateAppSettings = useCallback(
    async (next: AppSettings) => {
      setAppSettings(next);
      try {
        await queueSaveSettings(next);
      } catch (error) {
        addDebugEntry({
          id: `${Date.now()}-settings-save-error`,
          timestamp: Date.now(),
          source: "error",
          label: "settings/save error",
          payload:
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "Unknown settings save error",
        });
      }
    },
    [addDebugEntry, queueSaveSettings, setAppSettings],
  );

  const latestAgentRuns = useMemo(() => {
    const entries: Array<{
      threadId: string;
      message: string;
      timestamp: number;
      projectName: string;
      groupName?: string | null;
      workspaceId: string;
      isProcessing: boolean;
    }> = [];
    workspaces.forEach((workspace) => {
      const threads = threadsByWorkspace[workspace.id] ?? [];
      threads.forEach((thread) => {
        const entry = lastAgentMessageByThread[thread.id];
        if (!entry) {
          return;
        }
        entries.push({
          threadId: thread.id,
          message: entry.text,
          timestamp: entry.timestamp,
          projectName: workspace.name,
          groupName: getWorkspaceGroupName(workspace.id),
          workspaceId: workspace.id,
          isProcessing: threadStatusById[thread.id]?.isProcessing ?? false
        });
      });
    });
    return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
  }, [
    lastAgentMessageByThread,
    getWorkspaceGroupName,
    threadStatusById,
    threadsByWorkspace,
    workspaces
  ]);
  const isLoadingLatestAgents = useMemo(
    () =>
      !hasLoaded ||
      workspaces.some(
        (workspace) => threadListLoadingByWorkspace[workspace.id] ?? false
      ),
    [hasLoaded, threadListLoadingByWorkspace, workspaces]
  );

  const activeRateLimits = activeWorkspaceId
    ? rateLimitsByWorkspace[activeWorkspaceId] ?? null
    : null;
  const activeTokenUsage = useMemo(() => {
    if (!activeWorkspaceId) {
      return activeThreadId ? tokenUsageByThread[activeThreadId] ?? null : null;
    }
    const workspaceThreads = threadsByWorkspace[activeWorkspaceId] ?? [];
    const workspaceUsage = mergeTokenUsage(
      workspaceThreads.map((thread) => tokenUsageByThread[thread.id] ?? null),
    );
    if (workspaceUsage) {
      return workspaceUsage;
    }
    return activeThreadId ? tokenUsageByThread[activeThreadId] ?? null : null;
  }, [activeThreadId, activeWorkspaceId, threadsByWorkspace, tokenUsageByThread]);
  const activePlan = activeThreadId
    ? planByThread[activeThreadId] ?? null
    : null;
  const hasActivePlan = Boolean(
    activePlan && (activePlan.steps.length > 0 || activePlan.explanation)
  );
  const showHome = !activeWorkspace;
  const showWorkspaceHome = Boolean(activeWorkspace && !activeThreadId && !isNewAgentDraftMode);
  const showComposer = (!isCompact
    ? centerMode === "chat" || centerMode === "diff"
    : (isTablet ? tabletTab : activeTab) === "micode") && !showWorkspaceHome;
  const { files, isLoading: isFilesLoading, setFileAutocompleteActive } =
    useWorkspaceFileListing({
      activeWorkspace,
      activeWorkspaceId,
      filePanelMode,
      isCompact,
      isTablet,
      activeTab,
      tabletTab,
      rightPanelCollapsed,
      hasComposerSurface: showComposer || showWorkspaceHome,
      onDebug: addDebugEntry,
    });
  const [usageMetric, setUsageMetric] = useState<"tokens" | "time">("tokens");
  const [usageWorkspaceId, setUsageWorkspaceId] = useState<string | null>(null);
  const usageWorkspaceOptions = useMemo(
    () =>
      workspaces.map((workspace) => {
        const groupName = getWorkspaceGroupName(workspace.id);
        const label = groupName
          ? `${groupName} / ${workspace.name}`
          : workspace.name;
        return { id: workspace.id, label };
      }),
    [getWorkspaceGroupName, workspaces],
  );
  const usageWorkspacePath = useMemo(() => {
    if (!usageWorkspaceId) {
      return null;
    }
    return workspacesById.get(usageWorkspaceId)?.path ?? null;
  }, [usageWorkspaceId, workspacesById]);
  useEffect(() => {
    if (!usageWorkspaceId) {
      return;
    }
    if (workspaces.some((workspace) => workspace.id === usageWorkspaceId)) {
      return;
    }
    setUsageWorkspaceId(null);
  }, [usageWorkspaceId, workspaces]);
  const {
    snapshot: localUsageSnapshot,
    isLoading: isLoadingLocalUsage,
    error: localUsageError,
    refresh: refreshLocalUsage,
  } = useLocalUsage(showHome, usageWorkspacePath);
  const localUsageSnapshotFallback = useMemo(() => {
    const scopedThreads = usageWorkspaceId
      ? threadsByWorkspace[usageWorkspaceId] ?? []
      : Object.values(threadsByWorkspace).flat();
    const usageThreads = scopedThreads
      .map((thread) => {
        const usage = tokenUsageByThread[thread.id];
        if (!usage) {
          return null;
        }
        return {
          updatedAt: thread.updatedAt,
          usage,
        };
      })
      .filter((entry): entry is { updatedAt: number; usage: ThreadTokenUsage } => Boolean(entry));
    return buildSyntheticUsageSnapshot(usageThreads);
  }, [threadsByWorkspace, tokenUsageByThread, usageWorkspaceId]);
  const localUsageSnapshotForHome = useMemo(() => {
    if (localUsageSnapshot && localUsageSnapshot.totals.last30DaysTokens > 0) {
      return localUsageSnapshot;
    }
    return localUsageSnapshotFallback ?? localUsageSnapshot;
  }, [localUsageSnapshot, localUsageSnapshotFallback]);
  const isLoadingLocalUsageForHome = isLoadingLocalUsage && !localUsageSnapshotForHome;
  const localUsageErrorForHome = localUsageSnapshotForHome ? null : localUsageError;
  const STALE_PROCESSING_WITHOUT_TURN_MS = 15_000;
  const activeThreadStatus = activeThreadId
    ? threadStatusById[activeThreadId] ?? null
    : null;
  const activeTurnId = activeThreadId
    ? activeTurnIdByThread[activeThreadId] ?? null
    : null;
  const processingStartedAt = activeThreadStatus?.processingStartedAt ?? null;
  const isStaleProcessingWithoutTurn = Boolean(
    activeThreadStatus?.isProcessing &&
      !activeTurnId &&
      processingStartedAt &&
      Date.now() - processingStartedAt > STALE_PROCESSING_WITHOUT_TURN_MS,
  );
  const effectiveThreadProcessing = Boolean(
    activeThreadStatus?.isProcessing && !isStaleProcessingWithoutTurn,
  );
  const canInterrupt = Boolean(effectiveThreadProcessing && activeTurnId);
  const isStartingDraftThread =
    Boolean(activeWorkspaceId) && startingDraftThreadWorkspaceId === activeWorkspaceId;
  const isProcessing =
    effectiveThreadProcessing || isStartingDraftThread;
  const isReviewing = activeThreadId
    ? threadStatusById[activeThreadId]?.isReviewing ?? false
    : false;
  const {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
    removeImagesForThread,
    activeQueue,
    handleSend,
    queueMessage,
    prefillDraft,
    setPrefillDraft,
    composerInsert,
    setComposerInsert,
    activeDraft,
    handleDraftChange,
    handleSendPrompt,
    handleEditQueued,
    handleDeleteQueued,
    clearDraftForThread,
  } = useComposerController({
    activeThreadId,
    activeWorkspaceId,
    activeWorkspace,
    isProcessing,
    isReviewing,
    steerEnabled: appSettings.steerEnabled,
    appsEnabled: appSettings.experimentalAppsEnabled,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startCompact,
    startApps,
    startMcp,
    startStatus,
  });

  const {
    runs: workspaceRuns,
    draft: workspacePrompt,
    runMode: workspaceRunMode,
    modelSelections: workspaceModelSelections,
    error: workspaceRunError,
    isSubmitting: workspaceRunSubmitting,
    setDraft: setWorkspacePrompt,
    setRunMode: setWorkspaceRunMode,
    toggleModelSelection: toggleWorkspaceModelSelection,
    setModelCount: setWorkspaceModelCount,
    startRun: startWorkspaceRun,
  } = useWorkspaceHome({
    activeWorkspace,
    models,
    selectedModelId,
    effort: resolvedEffort,
    collaborationMode: collaborationModePayload,
    addWorktreeAgent,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessageToThread,
    onWorktreeCreated: handleWorktreeCreated,
  });

  const canInsertComposerText = showWorkspaceHome
    ? Boolean(activeWorkspace)
    : Boolean(activeThreadId);
  const handleInsertComposerText = useComposerInsert({
    isEnabled: canInsertComposerText,
    draftText: showWorkspaceHome ? workspacePrompt : activeDraft,
    onDraftChange: showWorkspaceHome ? setWorkspacePrompt : handleDraftChange,
    textareaRef: showWorkspaceHome ? workspaceHomeTextareaRef : composerInputRef,
  });
  const RECENT_THREAD_LIMIT = 8;
  const { recentThreadInstances, recentThreadsUpdatedAt } = useMemo(() => {
    if (!activeWorkspaceId) {
      return { recentThreadInstances: [], recentThreadsUpdatedAt: null };
    }
    const threads = threadsByWorkspace[activeWorkspaceId] ?? [];
    if (threads.length === 0) {
      return { recentThreadInstances: [], recentThreadsUpdatedAt: null };
    }
    const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
    const slice = sorted.slice(0, RECENT_THREAD_LIMIT);
    const updatedAt = slice.reduce(
      (max, thread) => (thread.updatedAt > max ? thread.updatedAt : max),
      0,
    );
    const instances = slice.map((thread, index) => ({
      id: `recent-${thread.id}`,
      workspaceId: activeWorkspaceId,
      threadId: thread.id,
      modelId: null,
      modelLabel: thread.name?.trim() || "Untitled thread",
      sequence: index + 1,
    }));
    return {
      recentThreadInstances: instances,
      recentThreadsUpdatedAt: updatedAt > 0 ? updatedAt : null,
    };
  }, [activeWorkspaceId, threadsByWorkspace]);
  const {
    content: agentMdContent,
    exists: agentMdExists,
    truncated: agentMdTruncated,
    isLoading: agentMdLoading,
    isSaving: agentMdSaving,
    error: agentMdError,
    isDirty: agentMdDirty,
    setContent: setAgentMdContent,
    refresh: refreshAgentMd,
    save: saveAgentMd,
  } = useWorkspaceAgentMd({
    activeWorkspace,
    onDebug: addDebugEntry,
  });

  const {
    commitMessage,
    commitMessageLoading,
    commitMessageError,
    commitLoading,
    pullLoading,
    fetchLoading,
    pushLoading,
    syncLoading,
    commitError,
    pullError,
    fetchError,
    pushError,
    syncError,
    onCommitMessageChange: handleCommitMessageChange,
    onGenerateCommitMessage: handleGenerateCommitMessage,
    onCommit: handleCommit,
    onCommitAndPush: handleCommitAndPush,
    onCommitAndSync: handleCommitAndSync,
    onPull: handlePull,
    onFetch: handleFetch,
    onPush: handlePush,
    onSync: handleSync,
  } = useGitCommitController({
    activeWorkspace,
    activeWorkspaceId,
    activeWorkspaceIdRef,
    gitStatus,
    refreshGitStatus,
    refreshGitLog,
  });

  const handleSendPromptToNewAgent = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!activeWorkspace || !trimmed) {
        return;
      }
      if (!activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      const threadId = await startThreadForWorkspace(activeWorkspace.id, {
        activate: false,
      });
      if (!threadId) {
        return;
      }
      await sendUserMessageToThread(activeWorkspace, threadId, trimmed, []);
    },
    [activeWorkspace, connectWorkspace, sendUserMessageToThread, startThreadForWorkspace],
  );


  const handleCreatePrompt = useCallback(
    async (data: {
      scope: "workspace" | "global";
      name: string;
      description?: string | null;
      argumentHint?: string | null;
      content: string;
    }) => {
      try {
        await createPrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, createPrompt],
  );

  const handleUpdatePrompt = useCallback(
    async (data: {
      path: string;
      name: string;
      description?: string | null;
      argumentHint?: string | null;
      content: string;
    }) => {
      try {
        await updatePrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, updatePrompt],
  );

  const handleDeletePrompt = useCallback(
    async (path: string) => {
      try {
        await deletePrompt(path);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, deletePrompt],
  );

  const handleMovePrompt = useCallback(
    async (data: { path: string; scope: "workspace" | "global" }) => {
      try {
        await movePrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, movePrompt],
  );

  const handleRevealWorkspacePrompts = useCallback(async () => {
    try {
      const path = await getWorkspacePromptsDir();
      await revealItemInDir(path);
    } catch (error) {
      alertError(error);
    }
  }, [alertError, getWorkspacePromptsDir]);

  const handleRevealGeneralPrompts = useCallback(async () => {
    try {
      const path = await getGlobalPromptsDir();
      if (!path) {
        return;
      }
      await revealItemInDir(path);
    } catch (error) {
      alertError(error);
    }
  }, [alertError, getGlobalPromptsDir]);

  const isWorktreeWorkspace = activeWorkspace?.kind === "worktree";
  const activeParentWorkspace = isWorktreeWorkspace
    ? workspacesById.get(activeWorkspace?.parentId ?? "") ?? null
    : null;
  const worktreeLabel = isWorktreeWorkspace
    ? (activeWorkspace?.name?.trim() || activeWorkspace?.worktree?.branch) ?? null
    : null;
  const activeRenamePrompt =
    renameWorktreePrompt?.workspaceId === activeWorkspace?.id
      ? renameWorktreePrompt
      : null;
  const worktreeRename =
    isWorktreeWorkspace && activeWorkspace
      ? {
          name: activeRenamePrompt?.name ?? worktreeLabel ?? "",
          error: activeRenamePrompt?.error ?? null,
          notice: renameWorktreeNotice,
          isSubmitting: activeRenamePrompt?.isSubmitting ?? false,
          isDirty: activeRenamePrompt
            ? activeRenamePrompt.name.trim() !==
              activeRenamePrompt.originalName.trim()
            : false,
          upstream:
            renameWorktreeUpstreamPrompt?.workspaceId === activeWorkspace.id
              ? {
                  oldBranch: renameWorktreeUpstreamPrompt.oldBranch,
                  newBranch: renameWorktreeUpstreamPrompt.newBranch,
                  error: renameWorktreeUpstreamPrompt.error,
                  isSubmitting: renameWorktreeUpstreamPrompt.isSubmitting,
                  onConfirm: confirmRenameWorktreeUpstream,
                }
              : null,
          onFocus: handleOpenRenameWorktree,
          onChange: handleRenameWorktreeChange,
          onCancel: handleRenameWorktreeCancel,
          onCommit: handleRenameWorktreeConfirm,
        }
      : null;
  const baseWorkspaceRef = useRef(activeParentWorkspace ?? activeWorkspace);

  useEffect(() => {
    baseWorkspaceRef.current = activeParentWorkspace ?? activeWorkspace;
  }, [activeParentWorkspace, activeWorkspace]);

  useEffect(() => {
    if (!isPhone) {
      return;
    }
    if (!activeWorkspace && activeTab !== "projects") {
      setActiveTab("projects");
    }
  }, [activeTab, activeWorkspace, isPhone]);

  useEffect(() => {
    if (!isTablet) {
      return;
    }
    if (activeTab === "projects") {
      setActiveTab("micode");
    }
  }, [activeTab, isTablet]);

  useWindowDrag("titlebar");
  useWorkspaceRestore({
    workspaces,
    hasLoaded,
    connectWorkspace,
    listThreadsForWorkspace
  });
  useWorkspaceRefreshOnFocus({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspace
  });

  const {
    handleAddWorkspace,
    handleAddWorkspaceFromPath,
    handleAddAgent,
    handleAddWorktreeAgent,
  } = useWorkspaceActions({
    activeWorkspace,
    isCompact,
    addWorkspace,
    addWorkspaceFromPath,
    setActiveThreadId,
    setActiveTab,
    exitDiffView,
    selectWorkspace,
    onStartNewAgentDraft: startNewAgentDraft,
    openWorktreePrompt,
    composerInputRef,
    onDebug: addDebugEntry,
  });

  const handleDropWorkspacePaths = useCallback(
    async (paths: string[]) => {
      const uniquePaths = Array.from(
        new Set(paths.filter((path) => path.length > 0)),
      );
      if (uniquePaths.length === 0) {
        return;
      }
      uniquePaths.forEach((path) => {
        void handleAddWorkspaceFromPath(path);
      });
    },
    [handleAddWorkspaceFromPath],
  );

  const {
    dropTargetRef: workspaceDropTargetRef,
    isDragOver: isWorkspaceDropActive,
    handleDragOver: handleWorkspaceDragOver,
    handleDragEnter: handleWorkspaceDragEnter,
    handleDragLeave: handleWorkspaceDragLeave,
    handleDrop: handleWorkspaceDrop,
  } = useWorkspaceDropZone({
    onDropPaths: handleDropWorkspacePaths,
  });

  const handleArchiveActiveThread = useCallback(() => {
    if (!activeWorkspaceId || !activeThreadId) {
      return;
    }
    void (async () => {
      const removed = await removeThread(activeWorkspaceId, activeThreadId);
      if (!removed) {
        return;
      }
      clearDraftForThread(activeThreadId);
      removeImagesForThread(activeThreadId);
    })();
  }, [
    activeThreadId,
    activeWorkspaceId,
    clearDraftForThread,
    removeImagesForThread,
    removeThread,
  ]);

  useInterruptShortcut({
    isEnabled: canInterrupt,
    shortcut: appSettings.interruptShortcut,
    onTrigger: () => {
      void interruptTurn();
    },
  });

  const {
    handleSelectPullRequest,
    resetPullRequestSelection,
    composerSendLabel,
    handleComposerSend,
    handleComposerQueue,
  } = usePullRequestComposer({
    activeWorkspace,
    selectedPullRequest,
    gitPullRequestDiffs,
    filePanelMode,
    gitPanelMode,
    centerMode,
    isCompact,
    setSelectedPullRequest,
    setDiffSource,
    setSelectedDiffPath,
    setCenterMode,
    setGitPanelMode,
    setPrefillDraft,
    setActiveTab,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessageToThread,
    clearActiveImages,
    handleSend,
    queueMessage,
  });
  const handleComposerSendWithDraftStart = useCallback(
    (text: string, images: string[]) =>
      runWithDraftStart(() => handleComposerSend(text, images)),
    [handleComposerSend, runWithDraftStart],
  );
  const handleComposerQueueWithDraftStart = useCallback(
    (text: string, images: string[]) => {
      // Queueing without an active thread would no-op; bootstrap through send so user input is not lost.
      const runner = activeThreadId
        ? () => handleComposerQueue(text, images)
        : () => handleComposerSend(text, images);
      return runWithDraftStart(runner);
    },
    [activeThreadId, handleComposerQueue, handleComposerSend, runWithDraftStart],
  );

  const handleSelectWorkspaceInstance = useCallback(
    (workspaceId: string, threadId: string) => {
      exitDiffView();
      resetPullRequestSelection();
      clearDraftState();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      if (isCompact) {
        setActiveTab("micode");
      }
    },
    [
      clearDraftState,
      exitDiffView,
      isCompact,
      resetPullRequestSelection,
      selectWorkspace,
      setActiveTab,
      setActiveThreadId,
    ],
  );

  const handleOpenThreadLink = useCallback(
    (threadId: string) => {
      if (!activeWorkspaceId) {
        return;
      }
      exitDiffView();
      resetPullRequestSelection();
      clearDraftState();
      setActiveThreadId(threadId, activeWorkspaceId);
    },
    [
      activeWorkspaceId,
      clearDraftState,
      exitDiffView,
      resetPullRequestSelection,
      setActiveThreadId,
    ],
  );

  const orderValue = (entry: WorkspaceInfo) =>
    typeof entry.settings.sortOrder === "number"
      ? entry.settings.sortOrder
      : Number.MAX_SAFE_INTEGER;

  const handleMoveWorkspace = async (
    workspaceId: string,
    direction: "up" | "down"
  ) => {
    const target = workspacesById.get(workspaceId);
    if (!target || (target.kind ?? "main") === "worktree") {
      return;
    }
    const targetGroupId = target.settings.groupId ?? null;
    const ordered = workspaces
      .filter(
        (entry) =>
          (entry.kind ?? "main") !== "worktree" &&
          (entry.settings.groupId ?? null) === targetGroupId,
      )
      .slice()
      .sort((a, b) => {
        const orderDiff = orderValue(a) - orderValue(b);
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.name.localeCompare(b.name);
      });
    const index = ordered.findIndex((entry) => entry.id === workspaceId);
    if (index === -1) {
      return;
    }
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= ordered.length) {
      return;
    }
    const next = ordered.slice();
    const temp = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = temp;
    await Promise.all(
      next.map((entry, idx) =>
        updateWorkspaceSettings(entry.id, {
          sortOrder: idx
        })
      )
    );
  };

  const showGitDetail = Boolean(selectedDiffPath) && isPhone;
  const isThreadOpen = Boolean(activeThreadId && showComposer);

  useArchiveShortcut({
    isEnabled: isThreadOpen,
    shortcut: appSettings.archiveThreadShortcut,
    onTrigger: handleArchiveActiveThread,
  });

  const { handleCycleAgent, handleCycleWorkspace } = useWorkspaceCycling({
    workspaces,
    groupedWorkspaces,
    threadsByWorkspace,
    getThreadRows,
    getPinTimestamp,
    activeWorkspaceIdRef,
    activeThreadIdRef,
    exitDiffView,
    resetPullRequestSelection,
    selectWorkspace,
    setActiveThreadId,
  });

  useAppMenuEvents({
    activeWorkspaceRef,
    baseWorkspaceRef,
    onAddWorkspace: () => {
      void handleAddWorkspace();
    },
    onAddAgent: (workspace) => {
      void handleAddAgent(workspace);
    },
    onAddWorktreeAgent: (workspace) => {
      void handleAddWorktreeAgent(workspace);
    },
    onOpenSettings: () => openSettings(),
    onCycleAgent: handleCycleAgent,
    onCycleWorkspace: handleCycleWorkspace,
    onToggleDebug: handleDebugClick,
    onToggleTerminal: handleToggleTerminal,
    sidebarCollapsed,
    rightPanelCollapsed,
    onExpandSidebar: expandSidebar,
    onCollapseSidebar: collapseSidebar,
    onExpandRightPanel: expandRightPanel,
    onCollapseRightPanel: collapseRightPanel,
  });

  useMenuAcceleratorController({ appSettings, onDebug: addDebugEntry });
  const dropOverlayActive = isWorkspaceDropActive;
  const dropOverlayText = "Drop Project Here";
  const appClassName = `app ${isCompact ? "layout-compact" : "layout-desktop"}${
    isPhone ? " layout-phone" : ""
  }${isTablet ? " layout-tablet" : ""}${
    reduceTransparency ? " reduced-transparency" : ""
  }${!isCompact && sidebarCollapsed ? " sidebar-collapsed" : ""}${
    !isCompact && rightPanelCollapsed ? " right-panel-collapsed" : ""
  }`;
  const {
    sidebarNode,
    messagesNode,
    composerNode,
    approvalToastsNode,
    updateToastNode,
    errorToastsNode,
    homeNode,
    mainHeaderNode,
    desktopTopbarLeftNode,
    tabletNavNode,
    tabBarNode,
    gitDiffPanelNode,
    gitDiffViewerNode,
    planPanelNode,
    debugPanelNode,
    debugPanelFullNode,
    terminalDockNode,
    compactEmptyMiCodeNode,
    compactEmptyGitNode,
    compactGitBackNode,
  } = useLayoutNodes({
    workspaces,
    groupedWorkspaces,
    hasWorkspaceGroups: workspaceGroups.length > 0,
    deletingWorktreeIds,
    newAgentDraftWorkspaceId,
    startingDraftThreadWorkspaceId,
    threadsByWorkspace,
    threadParentById,
    threadStatusById,
    threadResumeLoadingById,
    threadListLoadingByWorkspace,
    threadListPagingByWorkspace,
    threadListCursorByWorkspace,
    activeWorkspaceId,
    activeThreadId,
    activeItems,
    activeRateLimits,
    activeTokenUsage,
    usageShowRemaining: appSettings.usageShowRemaining,
    language: appSettings.language ?? "en",
    accountInfo: activeAccount,
    onSwitchAccount: handleSwitchAccount,
    onCancelSwitchAccount: handleCancelSwitchAccount,
    accountSwitching,
    codeBlockCopyUseModifier: appSettings.composerCodeBlockCopyUseModifier,
    openAppTargets: appSettings.openAppTargets,
    openAppIconById,
    selectedOpenAppId: appSettings.selectedOpenAppId,
    onSelectOpenAppId: handleSelectOpenAppId,
    approvals,
    userInputRequests,
    handleApprovalDecision,
    handleApprovalRemember,
    handleUserInputSubmit,
    onOpenSettings: () => openSettings(),
    onOpenDictationSettings: () => openSettings("dictation"),
    onOpenDebug: handleDebugClick,
    showDebugButton,
    onAddWorkspace: handleAddWorkspace,
    onSelectHome: () => {
      resetPullRequestSelection();
      clearDraftState();
      selectHome();
    },
    onSelectWorkspace: (workspaceId) => {
      exitDiffView();
      resetPullRequestSelection();
      clearDraftStateIfDifferentWorkspace(workspaceId);
      selectWorkspace(workspaceId);
      setActiveThreadId(null, workspaceId);
    },
    onConnectWorkspace: async (workspace) => {
      await connectWorkspace(workspace);
      if (isCompact) {
        setActiveTab("micode");
      }
    },
    onAddAgent: handleAddAgent,
    onAddWorktreeAgent: handleAddWorktreeAgent,
    onToggleWorkspaceCollapse: (workspaceId, collapsed) => {
      const target = workspacesById.get(workspaceId);
      if (!target) {
        return;
      }
      void updateWorkspaceSettings(workspaceId, {
        sidebarCollapsed: collapsed,
      });
    },
    onSelectThread: (workspaceId, threadId) => {
      exitDiffView();
      resetPullRequestSelection();
      clearDraftState();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
    },
    onOpenThreadLink: handleOpenThreadLink,
    onDeleteThread: (workspaceId, threadId) => {
      void (async () => {
        const removed = await removeThread(workspaceId, threadId);
        if (!removed) {
          return;
        }
        clearDraftForThread(threadId);
        removeImagesForThread(threadId);
      })();
    },
    onSyncThread: (workspaceId, threadId) => {
      void refreshThread(workspaceId, threadId);
    },
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    onRenameThread: (workspaceId, threadId) => {
      handleRenameThread(workspaceId, threadId);
    },
    onDeleteWorkspace: (workspaceId) => {
      void removeWorkspace(workspaceId);
    },
    onClearWorkspaceHistory: (workspaceId) => {
      void (async () => {
        const cleared = await clearWorkspaceHistory(workspaceId);
        if (!cleared) {
          return;
        }
        const targetIds = new Set<string>([workspaceId]);
        const target = workspacesById.get(workspaceId);
        if (target && (target.kind ?? "main") !== "worktree") {
          workspaces.forEach((workspace) => {
            if (workspace.parentId === workspaceId) {
              targetIds.add(workspace.id);
            }
          });
        }
        targetIds.forEach((id) => {
          resetWorkspaceThreads(id);
          if (activeWorkspaceId === id) {
            setActiveThreadId(null, id);
          }
        });
      })();
    },
    onDeleteWorktree: (workspaceId) => {
      void removeWorktree(workspaceId);
    },
    onLoadOlderThreads: (workspaceId) => {
      const workspace = workspacesById.get(workspaceId);
      if (!workspace) {
        return;
      }
      void loadOlderThreadsForWorkspace(workspace);
    },
    onReloadWorkspaceThreads: (workspaceId) => {
      const workspace = workspacesById.get(workspaceId);
      if (!workspace) {
        return;
      }
      void listThreadsForWorkspace(workspace);
    },
    updaterState,
    onUpdate: startUpdate,
    onDismissUpdate: dismissUpdate,
    errorToasts,
    onDismissErrorToast: dismissErrorToast,
    latestAgentRuns,
    isLoadingLatestAgents,
    localUsageSnapshot: localUsageSnapshotForHome,
    isLoadingLocalUsage: isLoadingLocalUsageForHome,
    localUsageError: localUsageErrorForHome,
    onRefreshLocalUsage: () => {
      refreshLocalUsage()?.catch(() => {});
    },
    usageMetric,
    onUsageMetricChange: setUsageMetric,
    usageWorkspaceId,
    usageWorkspaceOptions,
    onUsageWorkspaceChange: setUsageWorkspaceId,
    onSelectHomeThread: (workspaceId, threadId) => {
      exitDiffView();
      clearDraftState();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      if (isCompact) {
        setActiveTab("micode");
      }
    },
    activeWorkspace,
    activeParentWorkspace,
    worktreeLabel,
    worktreeRename: worktreeRename ?? undefined,
    isWorktreeWorkspace,
    branchName: gitStatus.branchName || "unknown",
    branches,
    onCheckoutBranch: handleCheckoutBranch,
    onCreateBranch: handleCreateBranch,
    onCopyThread: handleCopyThread,
    onToggleTerminal: handleToggleTerminal,
    showTerminalButton: !isCompact,
    launchScript: launchScriptState.launchScript,
    launchScriptEditorOpen: launchScriptState.editorOpen,
    launchScriptDraft: launchScriptState.draftScript,
    launchScriptSaving: launchScriptState.isSaving,
    launchScriptError: launchScriptState.error,
    onRunLaunchScript: launchScriptState.onRunLaunchScript,
    onOpenLaunchScriptEditor: launchScriptState.onOpenEditor,
    onCloseLaunchScriptEditor: launchScriptState.onCloseEditor,
    onLaunchScriptDraftChange: launchScriptState.onDraftScriptChange,
    onSaveLaunchScript: launchScriptState.onSaveLaunchScript,
    launchScriptsState,
    mainHeaderActionsNode: (
      <MainHeaderActions
        centerMode={centerMode}
        gitDiffViewStyle={gitDiffViewStyle}
        onSelectDiffViewStyle={setGitDiffViewStyle}
        isCompact={isCompact}
        rightPanelCollapsed={rightPanelCollapsed}
        sidebarToggleProps={sidebarToggleProps}
      />
    ),
    filePanelMode,
    onFilePanelModeChange: setFilePanelMode,
    fileTreeLoading: isFilesLoading,
    centerMode,
    onExitDiff: () => {
      setCenterMode("chat");
      setSelectedDiffPath(null);
    },
    activeTab,
    onSelectTab: setActiveTab,
    tabletNavTab: tabletTab,
    gitPanelMode,
    onGitPanelModeChange: handleGitPanelModeChange,
    gitDiffViewStyle,
    gitDiffIgnoreWhitespaceChanges:
      appSettings.gitDiffIgnoreWhitespaceChanges && diffSource !== "pr",
    worktreeApplyLabel: "apply",
    worktreeApplyTitle: activeParentWorkspace?.name
      ? `Apply changes to ${activeParentWorkspace.name}`
      : "Apply changes to parent workspace",
    worktreeApplyLoading: isWorktreeWorkspace ? worktreeApplyLoading : false,
    worktreeApplyError: isWorktreeWorkspace ? worktreeApplyError : null,
    worktreeApplySuccess: isWorktreeWorkspace ? worktreeApplySuccess : false,
    onApplyWorktreeChanges: isWorktreeWorkspace
      ? handleApplyWorktreeChanges
      : undefined,
    gitStatus,
    fileStatus,
    selectedDiffPath,
    diffScrollRequestId,
    onSelectDiff: handleSelectDiff,
    diffSource,
    gitLogEntries,
    gitLogTotal,
    gitLogAhead,
    gitLogBehind,
    gitLogAheadEntries,
    gitLogBehindEntries,
    gitLogUpstream,
    gitLogError,
    gitLogLoading,
    selectedCommitSha,
    gitIssues,
    gitIssuesTotal,
    gitIssuesLoading,
    gitIssuesError,
    gitPullRequests,
    gitPullRequestsTotal,
    gitPullRequestsLoading,
    gitPullRequestsError,
    selectedPullRequestNumber: selectedPullRequest?.number ?? null,
    selectedPullRequest: diffSource === "pr" ? selectedPullRequest : null,
    selectedPullRequestComments: diffSource === "pr" ? gitPullRequestComments : [],
    selectedPullRequestCommentsLoading: gitPullRequestCommentsLoading,
    selectedPullRequestCommentsError: gitPullRequestCommentsError,
    onSelectPullRequest: (pullRequest) => {
      setSelectedCommitSha(null);
      handleSelectPullRequest(pullRequest);
    },
    onSelectCommit: (entry) => {
      handleSelectCommit(entry.sha);
    },
    gitRemoteUrl,
    gitRoot: activeGitRoot,
    gitRootCandidates,
    gitRootScanDepth,
    gitRootScanLoading,
    gitRootScanError,
    gitRootScanHasScanned,
    onGitRootScanDepthChange: setGitRootScanDepth,
    onScanGitRoots: scanGitRoots,
    onSelectGitRoot: (path) => {
      void handleSetGitRoot(path);
    },
    onClearGitRoot: () => {
      void handleSetGitRoot(null);
    },
    onPickGitRoot: handlePickGitRoot,
    onStageGitAll: handleStageGitAll,
    onStageGitFile: handleStageGitFile,
    onUnstageGitFile: handleUnstageGitFile,
    onRevertGitFile: handleRevertGitFile,
    onRevertAllGitChanges: handleRevertAllGitChanges,
    gitDiffs: activeDiffs,
    gitDiffLoading: activeDiffLoading,
    gitDiffError: activeDiffError,
    onDiffActivePathChange: handleActiveDiffPath,
    commitMessage,
    commitMessageLoading,
    commitMessageError,
    onCommitMessageChange: handleCommitMessageChange,
    onGenerateCommitMessage: handleGenerateCommitMessage,
    onCommit: handleCommit,
    onCommitAndPush: handleCommitAndPush,
    onCommitAndSync: handleCommitAndSync,
    onPull: handlePull,
    onFetch: handleFetch,
    onPush: handlePush,
    onSync: handleSync,
    commitLoading,
    pullLoading,
    fetchLoading,
    pushLoading,
    syncLoading,
    commitError,
    pullError,
    fetchError,
    pushError,
    syncError,
    commitsAhead: gitLogAhead,
    onSendPrompt: handleSendPrompt,
    onSendPromptToNewAgent: handleSendPromptToNewAgent,
    onCreatePrompt: handleCreatePrompt,
    onUpdatePrompt: handleUpdatePrompt,
    onDeletePrompt: handleDeletePrompt,
    onMovePrompt: handleMovePrompt,
    onRevealWorkspacePrompts: handleRevealWorkspacePrompts,
    onRevealGeneralPrompts: handleRevealGeneralPrompts,
    canRevealGeneralPrompts: Boolean(activeWorkspace),
    onSend: handleComposerSendWithDraftStart,
    onQueue: handleComposerQueueWithDraftStart,
    onStop: interruptTurn,
    canStop: canInterrupt,
    onFileAutocompleteActiveChange: setFileAutocompleteActive,
    isReviewing,
    isProcessing,
    steerEnabled: appSettings.steerEnabled,
    reviewPrompt,
    onReviewPromptClose: closeReviewPrompt,
    onReviewPromptShowPreset: showPresetStep,
    onReviewPromptChoosePreset: choosePreset,
    highlightedPresetIndex,
    onReviewPromptHighlightPreset: setHighlightedPresetIndex,
    highlightedBranchIndex,
    onReviewPromptHighlightBranch: setHighlightedBranchIndex,
    highlightedCommitIndex,
    onReviewPromptHighlightCommit: setHighlightedCommitIndex,
    onReviewPromptKeyDown: handleReviewPromptKeyDown,
    onReviewPromptSelectBranch: selectBranch,
    onReviewPromptSelectBranchAtIndex: selectBranchAtIndex,
    onReviewPromptConfirmBranch: confirmBranch,
    onReviewPromptSelectCommit: selectCommit,
    onReviewPromptSelectCommitAtIndex: selectCommitAtIndex,
    onReviewPromptConfirmCommit: confirmCommit,
    onReviewPromptUpdateCustomInstructions: updateCustomInstructions,
    onReviewPromptConfirmCustom: confirmCustom,
    activeQueue,
    draftText: activeDraft,
    onDraftChange: handleDraftChange,
    activeImages,
    onPickImages: pickImages,
    onAttachImages: attachImages,
    onRemoveImage: removeImage,
    prefillDraft,
    onPrefillHandled: (id) => {
      if (prefillDraft?.id === id) {
        setPrefillDraft(null);
      }
    },
    insertText: composerInsert,
    onInsertHandled: (id) => {
      if (composerInsert?.id === id) {
        setComposerInsert(null);
      }
    },
    onEditQueued: handleEditQueued,
    onDeleteQueued: handleDeleteQueued,
    collaborationModes,
    selectedCollaborationModeId,
    onSelectCollaborationMode: setSelectedCollaborationModeId,
    models,
    selectedModelId,
    onSelectModel: setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: setSelectedEffort,
    reasoningSupported,
    accessMode,
    onSelectAccessMode: setAccessMode,
    skills,
    appsEnabled: appSettings.experimentalAppsEnabled,
    apps,
    prompts,
    slashCommands: activeSlashCommands,
    files,
    onInsertComposerText: handleInsertComposerText,
    canInsertComposerText,
    textareaRef: composerInputRef,
    composerEditorSettings,
    composerEditorExpanded,
    onToggleComposerEditorExpanded: toggleComposerEditorExpanded,
    dictationEnabled: appSettings.dictationEnabled && dictationReady,
    dictationState,
    dictationLevel,
    onToggleDictation: handleToggleDictation,
    dictationTranscript,
    onDictationTranscriptHandled: (id) => {
      clearDictationTranscript(id);
    },
    dictationError,
    onDismissDictationError: clearDictationError,
    dictationHint,
    onDismissDictationHint: clearDictationHint,
    composerSendLabel,
    showComposer,
    plan: activePlan,
    debugEntries,
    debugOpen,
    terminalOpen,
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    onClearDebug: clearDebugEntries,
    onCopyDebug: handleCopyDebug,
    onResizeDebug: onDebugPanelResizeStart,
    onResizeTerminal: onTerminalPanelResizeStart,
    onBackFromDiff: () => {
      setSelectedDiffPath(null);
      setCenterMode("chat");
    },
    onGoProjects: () => setActiveTab("projects"),
    workspaceDropTargetRef,
    isWorkspaceDropActive: dropOverlayActive,
    workspaceDropText: dropOverlayText,
    onWorkspaceDragOver: handleWorkspaceDragOver,
    onWorkspaceDragEnter: handleWorkspaceDragEnter,
    onWorkspaceDragLeave: handleWorkspaceDragLeave,
    onWorkspaceDrop: handleWorkspaceDrop,
  });

  const workspaceHomeNode = activeWorkspace ? (
    <WorkspaceHome
      workspace={activeWorkspace}
      runs={workspaceRuns}
      recentThreadInstances={recentThreadInstances}
      recentThreadsUpdatedAt={recentThreadsUpdatedAt}
      prompt={workspacePrompt}
      onPromptChange={setWorkspacePrompt}
      onStartRun={startWorkspaceRun}
      runMode={workspaceRunMode}
      onRunModeChange={setWorkspaceRunMode}
      models={models}
      selectedModelId={selectedModelId}
      onSelectModel={setSelectedModelId}
      modelSelections={workspaceModelSelections}
      onToggleModel={toggleWorkspaceModelSelection}
      onModelCountChange={setWorkspaceModelCount}
      collaborationModes={collaborationModes}
      selectedCollaborationModeId={selectedCollaborationModeId}
      onSelectCollaborationMode={setSelectedCollaborationModeId}
      reasoningOptions={reasoningOptions}
      selectedEffort={selectedEffort}
      onSelectEffort={setSelectedEffort}
      reasoningSupported={reasoningSupported}
      error={workspaceRunError}
      isSubmitting={workspaceRunSubmitting}
      activeWorkspaceId={activeWorkspaceId}
      activeThreadId={activeThreadId}
      threadStatusById={threadStatusById}
      onSelectInstance={handleSelectWorkspaceInstance}
      skills={skills}
      appsEnabled={appSettings.experimentalAppsEnabled}
      apps={apps}
      prompts={prompts}
      slashCommands={activeSlashCommands}
      files={files}
      onFileAutocompleteActiveChange={setFileAutocompleteActive}
      dictationEnabled={appSettings.dictationEnabled && dictationReady}
      dictationState={dictationState}
      dictationLevel={dictationLevel}
      onToggleDictation={handleToggleDictation}
      onOpenDictationSettings={() => openSettings("dictation")}
      dictationError={dictationError}
      onDismissDictationError={clearDictationError}
      dictationHint={dictationHint}
      onDismissDictationHint={clearDictationHint}
      dictationTranscript={dictationTranscript}
      onDictationTranscriptHandled={clearDictationTranscript}
      textareaRef={workspaceHomeTextareaRef}
      agentMdContent={agentMdContent}
      agentMdExists={agentMdExists}
      agentMdTruncated={agentMdTruncated}
      agentMdLoading={agentMdLoading}
      agentMdSaving={agentMdSaving}
      agentMdError={agentMdError}
      agentMdDirty={agentMdDirty}
      onAgentMdChange={setAgentMdContent}
      onAgentMdRefresh={() => {
        void refreshAgentMd();
      }}
      onAgentMdSave={() => {
        void saveAgentMd();
      }}
    />
  ) : null;

  const mainMessagesNode = showWorkspaceHome ? workspaceHomeNode : messagesNode;

  const desktopTopbarLeftNodeWithToggle = !isCompact ? (
    <div className="topbar-leading">
      <SidebarCollapseButton {...sidebarToggleProps} />
      {desktopTopbarLeftNode}
    </div>
  ) : (
    desktopTopbarLeftNode
  );

  return (
    <div
      className={appClassName}
      style={
        {
          "--sidebar-width": `${
            isCompact ? sidebarWidth : sidebarCollapsed ? 0 : sidebarWidth
          }px`,
          "--right-panel-width": `${
            isCompact ? rightPanelWidth : rightPanelCollapsed ? 0 : rightPanelWidth
          }px`,
          "--plan-panel-height": `${planPanelHeight}px`,
          "--terminal-panel-height": `${terminalPanelHeight}px`,
          "--debug-panel-height": `${debugPanelHeight}px`,
          "--ui-font-family": appSettings.uiFontFamily,
          "--code-font-family": appSettings.codeFontFamily,
          "--code-font-size": `${appSettings.codeFontSize}px`
        } as React.CSSProperties
      }
    >
      <div className="drag-strip" id="titlebar" data-tauri-drag-region />
      <TitlebarExpandControls {...sidebarToggleProps} />
      {shouldLoadGitHubPanelData ? (
        <Suspense fallback={null}>
          <GitHubPanelData
            activeWorkspace={activeWorkspace}
            gitPanelMode={gitPanelMode}
            shouldLoadDiffs={shouldLoadDiffs}
            diffSource={diffSource}
            selectedPullRequestNumber={selectedPullRequest?.number ?? null}
            onIssuesChange={handleGitIssuesChange}
            onPullRequestsChange={handleGitPullRequestsChange}
            onPullRequestDiffsChange={handleGitPullRequestDiffsChange}
            onPullRequestCommentsChange={handleGitPullRequestCommentsChange}
          />
        </Suspense>
      ) : null}
      <AppLayout
        isPhone={isPhone}
        isTablet={isTablet}
        showHome={showHome}
        showGitDetail={showGitDetail}
        activeTab={activeTab}
        tabletTab={tabletTab}
        centerMode={centerMode}
        preloadGitDiffs={appSettings.preloadGitDiffs}
        hasActivePlan={hasActivePlan}
        activeWorkspace={Boolean(activeWorkspace)}
        sidebarNode={sidebarNode}
        messagesNode={mainMessagesNode}
        composerNode={composerNode}
        approvalToastsNode={approvalToastsNode}
        updateToastNode={updateToastNode}
        errorToastsNode={errorToastsNode}
        homeNode={homeNode}
        mainHeaderNode={mainHeaderNode}
        desktopTopbarLeftNode={desktopTopbarLeftNodeWithToggle}
        tabletNavNode={tabletNavNode}
        tabBarNode={tabBarNode}
        gitDiffPanelNode={gitDiffPanelNode}
        gitDiffViewerNode={gitDiffViewerNode}
        planPanelNode={planPanelNode}
        debugPanelNode={debugPanelNode}
        debugPanelFullNode={debugPanelFullNode}
        terminalDockNode={terminalDockNode}
        compactEmptyMiCodeNode={compactEmptyMiCodeNode}
        compactEmptyGitNode={compactEmptyGitNode}
        compactGitBackNode={compactGitBackNode}
        onSidebarResizeStart={onSidebarResizeStart}
        onRightPanelResizeStart={onRightPanelResizeStart}
        onPlanPanelResizeStart={onPlanPanelResizeStart}
      />
      <AppModals
        renamePrompt={renamePrompt}
        onRenamePromptChange={handleRenamePromptChange}
        onRenamePromptCancel={handleRenamePromptCancel}
        onRenamePromptConfirm={handleRenamePromptConfirm}
        worktreePrompt={worktreePrompt}
        onWorktreePromptNameChange={updateWorktreeName}
        onWorktreePromptChange={updateWorktreeBranch}
        onWorktreePromptCopyAgentsMdChange={updateWorktreeCopyAgentsMd}
        onWorktreeSetupScriptChange={updateWorktreeSetupScript}
        onWorktreePromptCancel={cancelWorktreePrompt}
        onWorktreePromptConfirm={confirmWorktreePrompt}
        branchSwitcher={branchSwitcher}
        branches={branches}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        currentBranch={currentBranch}
        onBranchSwitcherSelect={handleBranchSelect}
        onBranchSwitcherCancel={closeBranchSwitcher}
        settingsOpen={settingsOpen}
        settingsSection={settingsSection ?? undefined}
        onCloseSettings={closeSettings}
        SettingsViewComponent={SettingsView}
        settingsProps={{
          workspaceGroups,
          groupedWorkspaces,
          ungroupedLabel,
          onMoveWorkspace: handleMoveWorkspace,
          onDeleteWorkspace: (workspaceId) => {
            void removeWorkspace(workspaceId);
          },
          onCreateWorkspaceGroup: createWorkspaceGroup,
          onRenameWorkspaceGroup: renameWorkspaceGroup,
          onMoveWorkspaceGroup: moveWorkspaceGroup,
          onDeleteWorkspaceGroup: deleteWorkspaceGroup,
          onAssignWorkspaceGroup: assignWorkspaceGroup,
          reduceTransparency,
          onToggleTransparency: setReduceTransparency,
          appSettings,
          openAppIconById,
          onUpdateAppSettings: handleUpdateAppSettings,
          onRunDoctor: doctor,
          onUpdateWorkspaceMiCodeBin: async (id, micodeBin) => {
            await updateWorkspaceMiCodeBin(id, micodeBin);
          },
          onUpdateWorkspaceSettings: async (id, settings) => {
            await updateWorkspaceSettings(id, settings);
          },
          scaleShortcutTitle,
          scaleShortcutText,
          onTestNotificationSound: handleTestNotificationSound,
          onTestSystemNotification: handleTestSystemNotification,
          dictationModelStatus: dictationModel.status,
          onDownloadDictationModel: dictationModel.download,
          onCancelDictationDownload: dictationModel.cancel,
          onRemoveDictationModel: dictationModel.remove,
        }}
      />
    </div>
  );
}

function App() {
  const windowLabel = useWindowLabel();
  if (windowLabel === "about") {
    return (
      <Suspense fallback={null}>
        <AboutView />
      </Suspense>
    );
  }
  return <MainApp />;
}

export default App;
