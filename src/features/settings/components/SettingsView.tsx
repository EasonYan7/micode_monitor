import { useCallback, useEffect, useMemo, useState } from "react";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Mic from "lucide-react/dist/esm/icons/mic";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Layers from "lucide-react/dist/esm/icons/layers";
import type {
  AppSettings,
  MiCodeDoctorResult,
  DictationModelStatus,
  WorkspaceSettings,
  OpenAppTarget,
  WorkspaceGroup,
  WorkspaceInfo,
} from "../../../types";
import { formatDownloadSize } from "../../../utils/formatting";
import {
  buildShortcutValue,
  formatShortcut,
  getDefaultInterruptShortcut,
} from "../../../utils/shortcuts";
import { clampUiScale } from "../../../utils/uiScale";
import { getMiCodeConfigPath } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  CODE_FONT_SIZE_DEFAULT,
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  clampCodeFontSize,
  normalizeFontFamily,
} from "../../../utils/fonts";
import { DEFAULT_OPEN_APP_ID, OPEN_APP_STORAGE_KEY } from "../../app/constants";
import { GENERIC_APP_ICON, getKnownOpenAppIcon } from "../../app/utils/openAppIcons";
import { useGlobalAgentsMd } from "../hooks/useGlobalAgentsMd";
import { useGlobalMiCodeConfigToml } from "../hooks/useGlobalMiCodeConfigToml";
import { FileEditorCard } from "../../shared/components/FileEditorCard";

const DICTATION_MODELS = [
  { id: "tiny", label: "Tiny", size: "75 MB", note: "Fastest, least accurate." },
  { id: "base", label: "Base", size: "142 MB", note: "Balanced default." },
  { id: "small", label: "Small", size: "466 MB", note: "Better accuracy." },
  { id: "medium", label: "Medium", size: "1.5 GB", note: "High accuracy." },
  { id: "large-v3", label: "Large V3", size: "3.0 GB", note: "Best accuracy, heavy download." },
];

type ComposerPreset = AppSettings["composerEditorPreset"];

type ComposerPresetSettings = Pick<
  AppSettings,
  | "composerFenceExpandOnSpace"
  | "composerFenceExpandOnEnter"
  | "composerFenceLanguageTags"
  | "composerFenceWrapSelection"
  | "composerFenceAutoWrapPasteMultiline"
  | "composerFenceAutoWrapPasteCodeLike"
  | "composerListContinuation"
  | "composerCodeBlockCopyUseModifier"
>;

const COMPOSER_PRESET_LABELS: Record<ComposerPreset, string> = {
  default: "Default (no helpers)",
  helpful: "Helpful",
  smart: "Smart",
};
const COMPOSER_PRESET_LABELS_ZH: Record<ComposerPreset, string> = {
  default: "默认（不启用辅助）",
  helpful: "实用",
  smart: "智能",
};

const COMPOSER_PRESET_CONFIGS: Record<ComposerPreset, ComposerPresetSettings> = {
  default: {
    composerFenceExpandOnSpace: false,
    composerFenceExpandOnEnter: false,
    composerFenceLanguageTags: false,
    composerFenceWrapSelection: false,
    composerFenceAutoWrapPasteMultiline: false,
    composerFenceAutoWrapPasteCodeLike: false,
    composerListContinuation: false,
    composerCodeBlockCopyUseModifier: false,
  },
  helpful: {
    composerFenceExpandOnSpace: true,
    composerFenceExpandOnEnter: false,
    composerFenceLanguageTags: true,
    composerFenceWrapSelection: true,
    composerFenceAutoWrapPasteMultiline: true,
    composerFenceAutoWrapPasteCodeLike: false,
    composerListContinuation: true,
    composerCodeBlockCopyUseModifier: false,
  },
  smart: {
    composerFenceExpandOnSpace: true,
    composerFenceExpandOnEnter: false,
    composerFenceLanguageTags: true,
    composerFenceWrapSelection: true,
    composerFenceAutoWrapPasteMultiline: true,
    composerFenceAutoWrapPasteCodeLike: true,
    composerListContinuation: true,
    composerCodeBlockCopyUseModifier: false,
  },
};

const normalizeOverrideValue = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeWorktreeSetupScript = (
  value: string | null | undefined,
): string | null => {
  const next = value ?? "";
  return next.trim().length > 0 ? next : null;
};

const buildWorkspaceOverrideDrafts = (
  projects: WorkspaceInfo[],
  prev: Record<string, string>,
  getValue: (workspace: WorkspaceInfo) => string | null | undefined,
): Record<string, string> => {
  const next: Record<string, string> = {};
  projects.forEach((workspace) => {
    const existing = prev[workspace.id];
    next[workspace.id] = existing ?? getValue(workspace) ?? "";
  });
  return next;
};

export type SettingsViewProps = {
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: Array<{
    id: string | null;
    name: string;
    workspaces: WorkspaceInfo[];
  }>;
  ungroupedLabel: string;
  onClose: () => void;
  onMoveWorkspace: (id: string, direction: "up" | "down") => void;
  onDeleteWorkspace: (id: string) => void;
  onCreateWorkspaceGroup: (name: string) => Promise<WorkspaceGroup | null>;
  onRenameWorkspaceGroup: (id: string, name: string) => Promise<boolean | null>;
  onMoveWorkspaceGroup: (id: string, direction: "up" | "down") => Promise<boolean | null>;
  onDeleteWorkspaceGroup: (id: string) => Promise<boolean | null>;
  onAssignWorkspaceGroup: (
    workspaceId: string,
    groupId: string | null,
  ) => Promise<boolean | null>;
  reduceTransparency: boolean;
  onToggleTransparency: (value: boolean) => void;
  appSettings: AppSettings;
  openAppIconById: Record<string, string>;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onRunDoctor: (
    micodeBin: string | null,
    micodeArgs: string | null,
  ) => Promise<MiCodeDoctorResult>;
  onUpdateWorkspaceMiCodeBin: (id: string, micodeBin: string | null) => Promise<void>;
  onUpdateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceSettings>,
  ) => Promise<void>;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  onTestNotificationSound: () => void;
  onTestSystemNotification: () => void;
  dictationModelStatus?: DictationModelStatus | null;
  onDownloadDictationModel?: () => void;
  onCancelDictationDownload?: () => void;
  onRemoveDictationModel?: () => void;
  initialSection?: MiCodeSection;
};

type SettingsSection =
  | "projects"
  | "environments"
  | "display"
  | "composer"
  | "dictation"
  | "shortcuts"
  | "open-apps"
  | "git";
type MiCodeSection = SettingsSection | "micode" | "features";
type ShortcutSettingKey =
  | "composerModelShortcut"
  | "composerAccessShortcut"
  | "composerReasoningShortcut"
  | "composerCollaborationShortcut"
  | "interruptShortcut"
  | "newAgentShortcut"
  | "newWorktreeAgentShortcut"
  | "newCloneAgentShortcut"
  | "archiveThreadShortcut"
  | "toggleProjectsSidebarShortcut"
  | "toggleGitSidebarShortcut"
  | "branchSwitcherShortcut"
  | "toggleDebugPanelShortcut"
  | "toggleTerminalShortcut"
  | "cycleAgentNextShortcut"
  | "cycleAgentPrevShortcut"
  | "cycleWorkspaceNextShortcut"
  | "cycleWorkspacePrevShortcut";
type ShortcutDraftKey =
  | "model"
  | "access"
  | "reasoning"
  | "collaboration"
  | "interrupt"
  | "newAgent"
  | "newWorktreeAgent"
  | "newCloneAgent"
  | "archiveThread"
  | "projectsSidebar"
  | "gitSidebar"
  | "branchSwitcher"
  | "debugPanel"
  | "terminal"
  | "cycleAgentNext"
  | "cycleAgentPrev"
  | "cycleWorkspaceNext"
  | "cycleWorkspacePrev";

type OpenAppDraft = OpenAppTarget & { argsText: string };

const shortcutDraftKeyBySetting: Record<ShortcutSettingKey, ShortcutDraftKey> = {
  composerModelShortcut: "model",
  composerAccessShortcut: "access",
  composerReasoningShortcut: "reasoning",
  composerCollaborationShortcut: "collaboration",
  interruptShortcut: "interrupt",
  newAgentShortcut: "newAgent",
  newWorktreeAgentShortcut: "newWorktreeAgent",
  newCloneAgentShortcut: "newCloneAgent",
  archiveThreadShortcut: "archiveThread",
  toggleProjectsSidebarShortcut: "projectsSidebar",
  toggleGitSidebarShortcut: "gitSidebar",
  branchSwitcherShortcut: "branchSwitcher",
  toggleDebugPanelShortcut: "debugPanel",
  toggleTerminalShortcut: "terminal",
  cycleAgentNextShortcut: "cycleAgentNext",
  cycleAgentPrevShortcut: "cycleAgentPrev",
  cycleWorkspaceNextShortcut: "cycleWorkspaceNext",
  cycleWorkspacePrevShortcut: "cycleWorkspacePrev",
};

const buildOpenAppDrafts = (targets: OpenAppTarget[]): OpenAppDraft[] =>
  targets.map((target) => ({
    ...target,
    argsText: target.args.join(" "),
  }));

const isOpenAppLabelValid = (label: string) => label.trim().length > 0;

const isOpenAppDraftComplete = (draft: OpenAppDraft) => {
  if (!isOpenAppLabelValid(draft.label)) {
    return false;
  }
  if (draft.kind === "app") {
    return Boolean(draft.appName?.trim());
  }
  if (draft.kind === "command") {
    return Boolean(draft.command?.trim());
  }
  return true;
};

const isOpenAppTargetComplete = (target: OpenAppTarget) => {
  if (!isOpenAppLabelValid(target.label)) {
    return false;
  }
  if (target.kind === "app") {
    return Boolean(target.appName?.trim());
  }
  if (target.kind === "command") {
    return Boolean(target.command?.trim());
  }
  return true;
};

const createOpenAppId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `open-app-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function SettingsView({
  workspaceGroups,
  groupedWorkspaces,
  ungroupedLabel,
  onClose,
  onMoveWorkspace,
  onDeleteWorkspace,
  onCreateWorkspaceGroup,
  onRenameWorkspaceGroup,
  onMoveWorkspaceGroup,
  onDeleteWorkspaceGroup,
  onAssignWorkspaceGroup,
  reduceTransparency,
  onToggleTransparency,
  appSettings,
  openAppIconById,
  onUpdateAppSettings,
  onRunDoctor,
  onUpdateWorkspaceMiCodeBin,
  onUpdateWorkspaceSettings,
  scaleShortcutTitle,
  scaleShortcutText,
  onTestNotificationSound,
  onTestSystemNotification,
  dictationModelStatus,
  onDownloadDictationModel,
  onCancelDictationDownload,
  onRemoveDictationModel,
  initialSection,
}: SettingsViewProps) {
  const isZh = (appSettings.language ?? "en") === "zh";
  const t = useCallback(
    (en: string, zh: string) => (isZh ? zh : en),
    [isZh],
  );
  const [activeSection, setActiveSection] = useState<MiCodeSection>("projects");
  const [environmentWorkspaceId, setEnvironmentWorkspaceId] = useState<string | null>(
    null,
  );
  const [environmentDraftScript, setEnvironmentDraftScript] = useState("");
  const [environmentSavedScript, setEnvironmentSavedScript] = useState<string | null>(
    null,
  );
  const [environmentLoadedWorkspaceId, setEnvironmentLoadedWorkspaceId] = useState<
    string | null
  >(null);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [environmentSaving, setEnvironmentSaving] = useState(false);
  const [micodePathDraft, setMiCodePathDraft] = useState(
    appSettings.agentBin ?? appSettings.micodeBin ?? "",
  );
  const [micodeArgsDraft, setMiCodeArgsDraft] = useState(
    appSettings.agentArgs ?? appSettings.micodeArgs ?? "",
  );
  const [scaleDraft, setScaleDraft] = useState(
    `${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`,
  );
  const [uiFontDraft, setUiFontDraft] = useState(appSettings.uiFontFamily);
  const [codeFontDraft, setCodeFontDraft] = useState(appSettings.codeFontFamily);
  const [codeFontSizeDraft, setCodeFontSizeDraft] = useState(appSettings.codeFontSize);
  const [micodeBinOverrideDrafts, setMiCodeBinOverrideDrafts] = useState<
    Record<string, string>
  >({});
  const [micodeHomeOverrideDrafts, setMiCodeHomeOverrideDrafts] = useState<
    Record<string, string>
  >({});
  const [micodeArgsOverrideDrafts, setMiCodeArgsOverrideDrafts] = useState<
    Record<string, string>
  >({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  const [openAppDrafts, setOpenAppDrafts] = useState<OpenAppDraft[]>(() =>
    buildOpenAppDrafts(appSettings.openAppTargets),
  );
  const [openAppSelectedId, setOpenAppSelectedId] = useState(
    appSettings.selectedOpenAppId,
  );
  const [doctorState, setDoctorState] = useState<{
    status: "idle" | "running" | "done";
    result: MiCodeDoctorResult | null;
  }>({ status: "idle", result: null });
  const {
    content: globalAgentsContent,
    exists: globalAgentsExists,
    truncated: globalAgentsTruncated,
    isLoading: globalAgentsLoading,
    isSaving: globalAgentsSaving,
    error: globalAgentsError,
    isDirty: globalAgentsDirty,
    setContent: setGlobalAgentsContent,
    refresh: refreshGlobalAgents,
    save: saveGlobalAgents,
  } = useGlobalAgentsMd();
  const {
    content: globalConfigContent,
    exists: globalConfigExists,
    truncated: globalConfigTruncated,
    isLoading: globalConfigLoading,
    isSaving: globalConfigSaving,
    error: globalConfigError,
    isDirty: globalConfigDirty,
    setContent: setGlobalConfigContent,
    refresh: refreshGlobalConfig,
    save: saveGlobalConfig,
  } = useGlobalMiCodeConfigToml();
  const [openConfigError, setOpenConfigError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [shortcutDrafts, setShortcutDrafts] = useState({
    model: appSettings.composerModelShortcut ?? "",
    access: appSettings.composerAccessShortcut ?? "",
    reasoning: appSettings.composerReasoningShortcut ?? "",
    collaboration: appSettings.composerCollaborationShortcut ?? "",
    interrupt: appSettings.interruptShortcut ?? "",
    newAgent: appSettings.newAgentShortcut ?? "",
    newWorktreeAgent: appSettings.newWorktreeAgentShortcut ?? "",
    newCloneAgent: appSettings.newCloneAgentShortcut ?? "",
    archiveThread: appSettings.archiveThreadShortcut ?? "",
    projectsSidebar: appSettings.toggleProjectsSidebarShortcut ?? "",
    gitSidebar: appSettings.toggleGitSidebarShortcut ?? "",
    branchSwitcher: appSettings.branchSwitcherShortcut ?? "",
    debugPanel: appSettings.toggleDebugPanelShortcut ?? "",
    terminal: appSettings.toggleTerminalShortcut ?? "",
    cycleAgentNext: appSettings.cycleAgentNextShortcut ?? "",
    cycleAgentPrev: appSettings.cycleAgentPrevShortcut ?? "",
    cycleWorkspaceNext: appSettings.cycleWorkspaceNextShortcut ?? "",
    cycleWorkspacePrev: appSettings.cycleWorkspacePrevShortcut ?? "",
  });
  const dictationReady = dictationModelStatus?.state === "ready";
  const dictationProgress = dictationModelStatus?.progress ?? null;
  const globalAgentsStatus = globalAgentsLoading
    ? "Loading…"
    : globalAgentsSaving
      ? "Saving…"
      : globalAgentsExists
        ? ""
        : "Not found";
  const globalAgentsMetaParts: string[] = [];
  if (globalAgentsStatus) {
    globalAgentsMetaParts.push(globalAgentsStatus);
  }
  if (globalAgentsTruncated) {
    globalAgentsMetaParts.push("Truncated");
  }
  const globalAgentsMeta = globalAgentsMetaParts.join(" · ");
  const globalAgentsSaveLabel = globalAgentsExists ? "Save" : "Create";
  const globalAgentsSaveDisabled = globalAgentsLoading || globalAgentsSaving || !globalAgentsDirty;
  const globalAgentsRefreshDisabled = globalAgentsLoading || globalAgentsSaving;
  const globalConfigStatus = globalConfigLoading
    ? "Loading…"
    : globalConfigSaving
      ? "Saving…"
      : globalConfigExists
        ? ""
        : "Not found";
  const globalConfigMetaParts: string[] = [];
  if (globalConfigStatus) {
    globalConfigMetaParts.push(globalConfigStatus);
  }
  if (globalConfigTruncated) {
    globalConfigMetaParts.push("Truncated");
  }
  const globalConfigMeta = globalConfigMetaParts.join(" · ");
  const globalConfigSaveLabel = globalConfigExists ? "Save" : "Create";
  const globalConfigSaveDisabled = globalConfigLoading || globalConfigSaving || !globalConfigDirty;
  const globalConfigRefreshDisabled = globalConfigLoading || globalConfigSaving;
  const selectedDictationModel = useMemo(() => {
    return (
      DICTATION_MODELS.find(
        (model) => model.id === appSettings.dictationModelId,
      ) ?? DICTATION_MODELS[1]
    );
  }, [appSettings.dictationModelId]);

  const projects = useMemo(
    () => groupedWorkspaces.flatMap((group) => group.workspaces),
    [groupedWorkspaces],
  );
  const mainWorkspaces = useMemo(
    () => projects.filter((workspace) => (workspace.kind ?? "main") !== "worktree"),
    [projects],
  );
  const environmentWorkspace = useMemo(() => {
    if (mainWorkspaces.length === 0) {
      return null;
    }
    if (environmentWorkspaceId) {
      const found = mainWorkspaces.find((workspace) => workspace.id === environmentWorkspaceId);
      if (found) {
        return found;
      }
    }
    return mainWorkspaces[0] ?? null;
  }, [environmentWorkspaceId, mainWorkspaces]);
  const environmentSavedScriptFromWorkspace = useMemo(() => {
    return normalizeWorktreeSetupScript(environmentWorkspace?.settings.worktreeSetupScript);
  }, [environmentWorkspace?.settings.worktreeSetupScript]);
  const environmentDraftNormalized = useMemo(() => {
    return normalizeWorktreeSetupScript(environmentDraftScript);
  }, [environmentDraftScript]);
  const environmentDirty = environmentDraftNormalized !== environmentSavedScript;
  const hasMiCodeHomeOverrides = useMemo(
    () =>
      projects.some(
        (workspace) =>
          workspace.settings.agentHome != null || workspace.settings.micodeHome != null,
      ),
    [projects],
  );

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };

    const handleCloseShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("keydown", handleCloseShortcut);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("keydown", handleCloseShortcut);
    };
  }, [onClose]);

  useEffect(() => {
    setMiCodePathDraft(appSettings.agentBin ?? appSettings.micodeBin ?? "");
  }, [appSettings.agentBin, appSettings.micodeBin]);

  useEffect(() => {
    setMiCodeArgsDraft(appSettings.agentArgs ?? appSettings.micodeArgs ?? "");
  }, [appSettings.agentArgs, appSettings.micodeArgs]);


  useEffect(() => {
    setScaleDraft(`${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`);
  }, [appSettings.uiScale]);

  useEffect(() => {
    setUiFontDraft(appSettings.uiFontFamily);
  }, [appSettings.uiFontFamily]);

  useEffect(() => {
    setCodeFontDraft(appSettings.codeFontFamily);
  }, [appSettings.codeFontFamily]);

  useEffect(() => {
    setCodeFontSizeDraft(appSettings.codeFontSize);
  }, [appSettings.codeFontSize]);

  useEffect(() => {
    setOpenAppDrafts(buildOpenAppDrafts(appSettings.openAppTargets));
    setOpenAppSelectedId(appSettings.selectedOpenAppId);
  }, [appSettings.openAppTargets, appSettings.selectedOpenAppId]);

  useEffect(() => {
    setShortcutDrafts({
      model: appSettings.composerModelShortcut ?? "",
      access: appSettings.composerAccessShortcut ?? "",
      reasoning: appSettings.composerReasoningShortcut ?? "",
      collaboration: appSettings.composerCollaborationShortcut ?? "",
      interrupt: appSettings.interruptShortcut ?? "",
      newAgent: appSettings.newAgentShortcut ?? "",
      newWorktreeAgent: appSettings.newWorktreeAgentShortcut ?? "",
      newCloneAgent: appSettings.newCloneAgentShortcut ?? "",
      archiveThread: appSettings.archiveThreadShortcut ?? "",
      projectsSidebar: appSettings.toggleProjectsSidebarShortcut ?? "",
      gitSidebar: appSettings.toggleGitSidebarShortcut ?? "",
      branchSwitcher: appSettings.branchSwitcherShortcut ?? "",
      debugPanel: appSettings.toggleDebugPanelShortcut ?? "",
      terminal: appSettings.toggleTerminalShortcut ?? "",
      cycleAgentNext: appSettings.cycleAgentNextShortcut ?? "",
      cycleAgentPrev: appSettings.cycleAgentPrevShortcut ?? "",
      cycleWorkspaceNext: appSettings.cycleWorkspaceNextShortcut ?? "",
      cycleWorkspacePrev: appSettings.cycleWorkspacePrevShortcut ?? "",
    });
  }, [
    appSettings.composerAccessShortcut,
    appSettings.composerModelShortcut,
    appSettings.composerReasoningShortcut,
    appSettings.composerCollaborationShortcut,
    appSettings.interruptShortcut,
    appSettings.newAgentShortcut,
    appSettings.newWorktreeAgentShortcut,
    appSettings.newCloneAgentShortcut,
    appSettings.archiveThreadShortcut,
    appSettings.toggleProjectsSidebarShortcut,
    appSettings.toggleGitSidebarShortcut,
    appSettings.branchSwitcherShortcut,
    appSettings.toggleDebugPanelShortcut,
    appSettings.toggleTerminalShortcut,
    appSettings.cycleAgentNextShortcut,
    appSettings.cycleAgentPrevShortcut,
    appSettings.cycleWorkspaceNextShortcut,
    appSettings.cycleWorkspacePrevShortcut,
  ]);

  const handleOpenConfig = useCallback(async () => {
    setOpenConfigError(null);
    try {
      const configPath = await getMiCodeConfigPath();
      await revealItemInDir(configPath);
    } catch (error) {
      setOpenConfigError(
        error instanceof Error ? error.message : "Unable to open config.",
      );
    }
  }, []);

  useEffect(() => {
    setMiCodeBinOverrideDrafts((prev) =>
      buildWorkspaceOverrideDrafts(
        projects,
        prev,
        (workspace) => workspace.agent_bin ?? workspace.micode_bin ?? null,
      ),
    );
    setMiCodeHomeOverrideDrafts((prev) =>
      buildWorkspaceOverrideDrafts(
        projects,
        prev,
        (workspace) => workspace.settings.agentHome ?? workspace.settings.micodeHome ?? null,
      ),
    );
    setMiCodeArgsOverrideDrafts((prev) =>
      buildWorkspaceOverrideDrafts(
        projects,
        prev,
        (workspace) => workspace.settings.agentArgs ?? workspace.settings.micodeArgs ?? null,
      ),
    );
  }, [projects]);

  useEffect(() => {
    setGroupDrafts((prev) => {
      const next: Record<string, string> = {};
      workspaceGroups.forEach((group) => {
        next[group.id] = prev[group.id] ?? group.name;
      });
      return next;
    });
  }, [workspaceGroups]);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  useEffect(() => {
    if (!environmentWorkspace) {
      setEnvironmentWorkspaceId(null);
      setEnvironmentLoadedWorkspaceId(null);
      setEnvironmentSavedScript(null);
      setEnvironmentDraftScript("");
      setEnvironmentError(null);
      setEnvironmentSaving(false);
      return;
    }

    if (environmentWorkspaceId !== environmentWorkspace.id) {
      setEnvironmentWorkspaceId(environmentWorkspace.id);
    }
  }, [environmentWorkspace, environmentWorkspaceId]);

  useEffect(() => {
    if (!environmentWorkspace) {
      return;
    }

    if (environmentLoadedWorkspaceId !== environmentWorkspace.id) {
      setEnvironmentLoadedWorkspaceId(environmentWorkspace.id);
      setEnvironmentSavedScript(environmentSavedScriptFromWorkspace);
      setEnvironmentDraftScript(environmentSavedScriptFromWorkspace ?? "");
      setEnvironmentError(null);
      return;
    }

    if (!environmentDirty && environmentSavedScript !== environmentSavedScriptFromWorkspace) {
      setEnvironmentSavedScript(environmentSavedScriptFromWorkspace);
      setEnvironmentDraftScript(environmentSavedScriptFromWorkspace ?? "");
      setEnvironmentError(null);
    }
  }, [
    environmentDirty,
    environmentLoadedWorkspaceId,
    environmentSavedScript,
    environmentSavedScriptFromWorkspace,
    environmentWorkspace,
  ]);

  const nextMiCodeBin = micodePathDraft.trim() ? micodePathDraft.trim() : null;
  const nextMiCodeArgs = micodeArgsDraft.trim() ? micodeArgsDraft.trim() : null;
  const micodeDirty =
    nextMiCodeBin !== (appSettings.agentBin ?? appSettings.micodeBin ?? null) ||
    nextMiCodeArgs !== (appSettings.agentArgs ?? appSettings.micodeArgs ?? null);

  const trimmedScale = scaleDraft.trim();
  const parsedPercent = trimmedScale
    ? Number(trimmedScale.replace("%", ""))
    : Number.NaN;
  const parsedScale = Number.isFinite(parsedPercent) ? parsedPercent / 100 : null;

  const handleSaveMiCodeSettings = async () => {
    setIsSavingSettings(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        agentBin: nextMiCodeBin,
        agentArgs: nextMiCodeArgs,
        micodeBin: nextMiCodeBin,
        micodeArgs: nextMiCodeArgs,
      });
    } finally {
      setIsSavingSettings(false);
    }
  };


  const handleCommitScale = async () => {
    if (parsedScale === null) {
      setScaleDraft(`${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`);
      return;
    }
    const nextScale = clampUiScale(parsedScale);
    setScaleDraft(`${Math.round(nextScale * 100)}%`);
    if (nextScale === appSettings.uiScale) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiScale: nextScale,
    });
  };

  const handleResetScale = async () => {
    if (appSettings.uiScale === 1) {
      setScaleDraft("100%");
      return;
    }
    setScaleDraft("100%");
    await onUpdateAppSettings({
      ...appSettings,
      uiScale: 1,
    });
  };

  const handleCommitUiFont = async () => {
    const nextFont = normalizeFontFamily(
      uiFontDraft,
      DEFAULT_UI_FONT_FAMILY,
    );
    setUiFontDraft(nextFont);
    if (nextFont === appSettings.uiFontFamily) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiFontFamily: nextFont,
    });
  };

  const handleCommitCodeFont = async () => {
    const nextFont = normalizeFontFamily(
      codeFontDraft,
      DEFAULT_CODE_FONT_FAMILY,
    );
    setCodeFontDraft(nextFont);
    if (nextFont === appSettings.codeFontFamily) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      codeFontFamily: nextFont,
    });
  };

  const handleCommitCodeFontSize = async (nextSize: number) => {
    const clampedSize = clampCodeFontSize(nextSize);
    setCodeFontSizeDraft(clampedSize);
    if (clampedSize === appSettings.codeFontSize) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      codeFontSize: clampedSize,
    });
  };

  const normalizeOpenAppTargets = useCallback(
    (drafts: OpenAppDraft[]): OpenAppTarget[] =>
      drafts.map(({ argsText, ...target }) => ({
        ...target,
        label: target.label.trim(),
        appName: (target.appName?.trim() ?? "") || null,
        command: (target.command?.trim() ?? "") || null,
        args: argsText.trim() ? argsText.trim().split(/\s+/) : [],
      })),
    [],
  );

  const handleCommitOpenApps = useCallback(
    async (drafts: OpenAppDraft[], selectedId = openAppSelectedId) => {
      const nextTargets = normalizeOpenAppTargets(drafts);
      const resolvedSelectedId = nextTargets.find(
        (target) => target.id === selectedId && isOpenAppTargetComplete(target),
      )?.id;
      const firstCompleteId = nextTargets.find(isOpenAppTargetComplete)?.id;
      const nextSelectedId =
        resolvedSelectedId ??
        firstCompleteId ??
        nextTargets[0]?.id ??
        DEFAULT_OPEN_APP_ID;
      setOpenAppDrafts(buildOpenAppDrafts(nextTargets));
      setOpenAppSelectedId(nextSelectedId);
      await onUpdateAppSettings({
        ...appSettings,
        openAppTargets: nextTargets,
        selectedOpenAppId: nextSelectedId,
      });
    },
    [
      appSettings,
      normalizeOpenAppTargets,
      onUpdateAppSettings,
      openAppSelectedId,
    ],
  );

  const handleOpenAppDraftChange = (
    index: number,
    updates: Partial<OpenAppDraft>,
  ) => {
    setOpenAppDrafts((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) {
        return prev;
      }
      next[index] = { ...current, ...updates };
      return next;
    });
  };

  const handleOpenAppKindChange = (index: number, kind: OpenAppTarget["kind"]) => {
    setOpenAppDrafts((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) {
        return prev;
      }
      next[index] = {
        ...current,
        kind,
        appName: kind === "app" ? current.appName ?? "" : null,
        command: kind === "command" ? current.command ?? "" : null,
        argsText: kind === "finder" ? "" : current.argsText,
      };
      void handleCommitOpenApps(next);
      return next;
    });
  };

  const handleMoveOpenApp = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= openAppDrafts.length) {
      return;
    }
    const next = [...openAppDrafts];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    setOpenAppDrafts(next);
    void handleCommitOpenApps(next);
  };

  const handleDeleteOpenApp = (index: number) => {
    if (openAppDrafts.length <= 1) {
      return;
    }
    const removed = openAppDrafts[index];
    const next = openAppDrafts.filter((_, draftIndex) => draftIndex !== index);
    const nextSelected =
      removed?.id === openAppSelectedId ? next[0]?.id ?? DEFAULT_OPEN_APP_ID : openAppSelectedId;
    setOpenAppDrafts(next);
    void handleCommitOpenApps(next, nextSelected);
  };

  const handleAddOpenApp = () => {
    const newTarget: OpenAppDraft = {
      id: createOpenAppId(),
      label: "New App",
      kind: "app",
      appName: "",
      command: null,
      args: [],
      argsText: "",
    };
    const next = [...openAppDrafts, newTarget];
    setOpenAppDrafts(next);
    void handleCommitOpenApps(next, newTarget.id);
  };

  const handleSelectOpenAppDefault = (id: string) => {
    const selectedTarget = openAppDrafts.find((target) => target.id === id);
    if (selectedTarget && !isOpenAppDraftComplete(selectedTarget)) {
      return;
    }
    setOpenAppSelectedId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OPEN_APP_STORAGE_KEY, id);
    }
    void handleCommitOpenApps(openAppDrafts, id);
  };

  const handleComposerPresetChange = (preset: ComposerPreset) => {
    const config = COMPOSER_PRESET_CONFIGS[preset];
    void onUpdateAppSettings({
      ...appSettings,
      composerEditorPreset: preset,
      ...config,
    });
  };

  const handleBrowseMiCode = async () => {
    const selection = await open({ multiple: false, directory: false });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    setMiCodePathDraft(selection);
  };

  const handleRunDoctor = async () => {
    setDoctorState({ status: "running", result: null });
    try {
      const result = await onRunDoctor(nextMiCodeBin, nextMiCodeArgs);
      setDoctorState({ status: "done", result });
    } catch (error) {
      setDoctorState({
        status: "done",
        result: {
          ok: false,
          micodeBin: nextMiCodeBin,
          version: null,
          appServerOk: false,
          details: error instanceof Error ? error.message : String(error),
          path: null,
          nodeOk: false,
          nodeVersion: null,
          nodeDetails: null,
        },
      });
    }
  };

  const updateShortcut = async (key: ShortcutSettingKey, value: string | null) => {
    const draftKey = shortcutDraftKeyBySetting[key];
    setShortcutDrafts((prev) => ({
      ...prev,
      [draftKey]: value ?? "",
    }));
    await onUpdateAppSettings({
      ...appSettings,
      [key]: value,
    });
  };

  const handleShortcutKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => {
    if (event.key === "Tab" && key !== "composerCollaborationShortcut") {
      return;
    }
    if (event.key === "Tab" && !event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (event.key === "Backspace" || event.key === "Delete") {
      void updateShortcut(key, null);
      return;
    }
    const value = buildShortcutValue(event.nativeEvent);
    if (!value) {
      return;
    }
    void updateShortcut(key, value);
  };

  const handleSaveEnvironmentSetup = async () => {
    if (!environmentWorkspace || environmentSaving) {
      return;
    }
    const nextScript = environmentDraftNormalized;
    setEnvironmentSaving(true);
    setEnvironmentError(null);
    try {
      await onUpdateWorkspaceSettings(environmentWorkspace.id, {
        worktreeSetupScript: nextScript,
      });
      setEnvironmentSavedScript(nextScript);
      setEnvironmentDraftScript(nextScript ?? "");
    } catch (error) {
      setEnvironmentError(error instanceof Error ? error.message : String(error));
    } finally {
      setEnvironmentSaving(false);
    }
  };

  const trimmedGroupName = newGroupName.trim();
  const canCreateGroup = Boolean(trimmedGroupName);

  const handleCreateGroup = async () => {
    setGroupError(null);
    try {
      const created = await onCreateWorkspaceGroup(newGroupName);
      if (created) {
        setNewGroupName("");
      }
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRenameGroup = async (group: WorkspaceGroup) => {
    const draft = groupDrafts[group.id] ?? "";
    const trimmed = draft.trim();
    if (!trimmed || trimmed === group.name) {
      setGroupDrafts((prev) => ({
        ...prev,
        [group.id]: group.name,
      }));
      return;
    }
    setGroupError(null);
    try {
      await onRenameWorkspaceGroup(group.id, trimmed);
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : String(error));
      setGroupDrafts((prev) => ({
        ...prev,
        [group.id]: group.name,
      }));
    }
  };

  const updateGroupCopiesFolder = async (
    groupId: string,
    copiesFolder: string | null,
  ) => {
    setGroupError(null);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        workspaceGroups: appSettings.workspaceGroups.map((entry) =>
          entry.id === groupId ? { ...entry, copiesFolder } : entry,
        ),
      });
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleChooseGroupCopiesFolder = async (group: WorkspaceGroup) => {
    const selection = await open({ multiple: false, directory: true });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    await updateGroupCopiesFolder(group.id, selection);
  };

  const handleClearGroupCopiesFolder = async (group: WorkspaceGroup) => {
    if (!group.copiesFolder) {
      return;
    }
    await updateGroupCopiesFolder(group.id, null);
  };

  const handleDeleteGroup = async (group: WorkspaceGroup) => {
    const groupProjects =
      groupedWorkspaces.find((entry) => entry.id === group.id)?.workspaces ?? [];
    const detail =
      groupProjects.length > 0
        ? `\n\nProjects in this group will move to "${ungroupedLabel}".`
        : "";
    const confirmed = await ask(
      `Delete "${group.name}"?${detail}`,
      {
        title: "Delete Group",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) {
      return;
    }
    setGroupError(null);
    try {
      await onDeleteWorkspaceGroup(group.id);
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-window">
        <div className="settings-titlebar">
          <div className="settings-title">Settings</div>
          <button
            type="button"
            className="ghost icon-button settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X aria-hidden />
          </button>
        </div>
        <div className="settings-body">
          <aside className="settings-sidebar">
            <button
              type="button"
              className={`settings-nav ${activeSection === "projects" ? "active" : ""}`}
              onClick={() => setActiveSection("projects")}
            >
              <LayoutGrid aria-hidden />
              {t("Projects", "项目")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "environments" ? "active" : ""}`}
              onClick={() => setActiveSection("environments")}
            >
              <Layers aria-hidden />
              {t("Environments", "环境")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "display" ? "active" : ""}`}
              onClick={() => setActiveSection("display")}
            >
              <SlidersHorizontal aria-hidden />
              {t("Display & Sound", "显示与声音")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "composer" ? "active" : ""}`}
              onClick={() => setActiveSection("composer")}
            >
              <FileText aria-hidden />
              {t("Composer", "编辑器")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "dictation" ? "active" : ""}`}
              onClick={() => setActiveSection("dictation")}
            >
              <Mic aria-hidden />
              {t("Dictation", "语音输入")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "shortcuts" ? "active" : ""}`}
              onClick={() => setActiveSection("shortcuts")}
            >
              <Keyboard aria-hidden />
              {t("Shortcuts", "快捷键")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "open-apps" ? "active" : ""}`}
              onClick={() => setActiveSection("open-apps")}
            >
              <ExternalLink aria-hidden />
              {t("Open in", "打开方式")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "git" ? "active" : ""}`}
              onClick={() => setActiveSection("git")}
            >
              <GitBranch aria-hidden />
              Git
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "micode" ? "active" : ""}`}
              onClick={() => setActiveSection("micode")}
            >
              <TerminalSquare aria-hidden />
              MiCode
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "features" ? "active" : ""}`}
              onClick={() => setActiveSection("features")}
            >
              <FlaskConical aria-hidden />
              {t("Features", "功能")}
            </button>
          </aside>
          <div className="settings-content">
            {activeSection === "projects" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("Projects", "项目")}</div>
                <div className="settings-section-subtitle">
                  {t(
                    "Group related workspaces and reorder projects within each group.",
                    "按组管理相关工作区，并调整组内项目顺序。",
                  )}
                </div>
                <div className="settings-subsection-title">{t("Groups", "分组")}</div>
                <div className="settings-subsection-subtitle">
                  {t("Create group labels for related repositories.", "为相关仓库创建分组标签。")}
                </div>
                <div className="settings-groups">
                  <div className="settings-group-create">
                    <input
                      className="settings-input settings-input--compact"
                      value={newGroupName}
                      placeholder={t("New group name", "新分组名称")}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canCreateGroup) {
                          event.preventDefault();
                          void handleCreateGroup();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => {
                        void handleCreateGroup();
                      }}
                      disabled={!canCreateGroup}
                    >
                      {t("Add group", "添加分组")}
                    </button>
                  </div>
                  {groupError && <div className="settings-group-error">{groupError}</div>}
                  {workspaceGroups.length > 0 ? (
                    <div className="settings-group-list">
                      {workspaceGroups.map((group, index) => (
                        <div key={group.id} className="settings-group-row">
                          <div className="settings-group-fields">
                            <input
                              className="settings-input settings-input--compact"
                              value={groupDrafts[group.id] ?? group.name}
                              onChange={(event) =>
                                setGroupDrafts((prev) => ({
                                  ...prev,
                                  [group.id]: event.target.value,
                                }))
                              }
                              onBlur={() => {
                                void handleRenameGroup(group);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleRenameGroup(group);
                                }
                              }}
                            />
                            <div className="settings-group-copies">
                              <div className="settings-group-copies-label">
                                {t("Copies folder", "副本目录")}
                              </div>
                              <div className="settings-group-copies-row">
                                <div
                                  className={`settings-group-copies-path${
                                    group.copiesFolder ? "" : " empty"
                                  }`}
                                  title={group.copiesFolder ?? ""}
                                >
                                  {group.copiesFolder ?? t("Not set", "未设置")}
                                </div>
                                <button
                                  type="button"
                                  className="ghost settings-button-compact"
                                  onClick={() => {
                                    void handleChooseGroupCopiesFolder(group);
                                  }}
                                >
                                  {t("Choose…", "选择…")}
                                </button>
                                <button
                                  type="button"
                                  className="ghost settings-button-compact"
                                  onClick={() => {
                                    void handleClearGroupCopiesFolder(group);
                                  }}
                                  disabled={!group.copiesFolder}
                                >
                                  {t("Clear", "清空")}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="settings-group-actions">
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => {
                                void onMoveWorkspaceGroup(group.id, "up");
                              }}
                              disabled={index === 0}
                              aria-label={t("Move group up", "上移分组")}
                            >
                              <ChevronUp aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => {
                                void onMoveWorkspaceGroup(group.id, "down");
                              }}
                              disabled={index === workspaceGroups.length - 1}
                              aria-label={t("Move group down", "下移分组")}
                            >
                              <ChevronDown aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => {
                                void handleDeleteGroup(group);
                              }}
                              aria-label={t("Delete group", "删除分组")}
                            >
                              <Trash2 aria-hidden />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="settings-empty">{t("No groups yet.", "暂无分组。")}</div>
                  )}
                </div>
                <div className="settings-subsection-title">{t("Projects", "项目")}</div>
                <div className="settings-subsection-subtitle">
                  {t("Assign projects to groups and adjust their order.", "将项目分配到分组并调整顺序。")}
                </div>
                <div className="settings-projects">
                  {groupedWorkspaces.map((group) => (
                    <div key={group.id ?? "ungrouped"} className="settings-project-group">
                      <div className="settings-project-group-label">{group.name}</div>
                      {group.workspaces.map((workspace, index) => {
                        const groupValue =
                          workspaceGroups.some(
                            (entry) => entry.id === workspace.settings.groupId,
                          )
                            ? workspace.settings.groupId ?? ""
                            : "";
                        return (
                          <div key={workspace.id} className="settings-project-row">
                            <div className="settings-project-info">
                              <div className="settings-project-name">{workspace.name}</div>
                              <div className="settings-project-path">{workspace.path}</div>
                            </div>
                            <div className="settings-project-actions">
                              <select
                                className="settings-select settings-select--compact"
                                value={groupValue}
                                onChange={(event) => {
                                  const nextGroupId = event.target.value || null;
                                  void onAssignWorkspaceGroup(
                                    workspace.id,
                                    nextGroupId,
                                  );
                                }}
                              >
                                <option value="">{ungroupedLabel}</option>
                                {workspaceGroups.map((entry) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="ghost icon-button"
                                onClick={() => onMoveWorkspace(workspace.id, "up")}
                                disabled={index === 0}
                                aria-label={t("Move project up", "上移项目")}
                              >
                                <ChevronUp aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="ghost icon-button"
                                onClick={() => onMoveWorkspace(workspace.id, "down")}
                                disabled={index === group.workspaces.length - 1}
                                aria-label={t("Move project down", "下移项目")}
                              >
                                <ChevronDown aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="ghost icon-button"
                                onClick={() => onDeleteWorkspace(workspace.id)}
                                aria-label={t("Delete project", "删除项目")}
                              >
                                <Trash2 aria-hidden />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {projects.length === 0 && (
                    <div className="settings-empty">{t("No projects yet.", "暂无项目。")}</div>
                  )}
                </div>
              </section>
            )}
            {activeSection === "environments" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("Environments", "环境")}</div>
                <div className="settings-section-subtitle">
                  {t(
                    "Configure per-project setup scripts that run after worktree creation.",
                    "配置每个项目在创建工作树后执行的一次性初始化脚本。",
                  )}
                </div>
                {mainWorkspaces.length === 0 ? (
                  <div className="settings-empty">{t("No projects yet.", "暂无项目。")}</div>
                ) : (
                  <>
                    <div className="settings-field">
                      <label
                        className="settings-field-label"
                        htmlFor="settings-environment-project"
                      >
                        {t("Project", "项目")}
                      </label>
                      <select
                        id="settings-environment-project"
                        className="settings-select"
                        value={environmentWorkspace?.id ?? ""}
                        onChange={(event) => setEnvironmentWorkspaceId(event.target.value)}
                        disabled={environmentSaving}
                      >
                        {mainWorkspaces.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                      {environmentWorkspace ? (
                        <div className="settings-help">{environmentWorkspace.path}</div>
                      ) : null}
                    </div>

                    <div className="settings-field">
                      <div className="settings-field-label">{t("Setup script", "初始化脚本")}</div>
                      <div className="settings-help">
                        {t(
                          "Runs once in a dedicated terminal after each new worktree is created.",
                          "每次新建工作树后，会在独立终端中执行一次。",
                        )}
                      </div>
                      {environmentError ? (
                        <div className="settings-agents-error">{environmentError}</div>
                      ) : null}
                      <textarea
                        className="settings-agents-textarea"
                        value={environmentDraftScript}
                        onChange={(event) => setEnvironmentDraftScript(event.target.value)}
                        placeholder="pnpm install"
                        spellCheck={false}
                        disabled={environmentSaving}
                      />
                      <div className="settings-field-actions">
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={() => {
                            const clipboard =
                              typeof navigator === "undefined" ? null : navigator.clipboard;
                            if (!clipboard?.writeText) {
                              pushErrorToast({
                                title: t("Copy failed", "复制失败"),
                                message:
                                  t(
                                    "Clipboard access is unavailable in this environment. Copy the script manually instead.",
                                    "当前环境无法访问剪贴板，请手动复制脚本。",
                                  ),
                              });
                              return;
                            }

                            void clipboard.writeText(environmentDraftScript).catch(() => {
                              pushErrorToast({
                                title: t("Copy failed", "复制失败"),
                                message:
                                  t(
                                    "Could not write to the clipboard. Copy the script manually instead.",
                                    "写入剪贴板失败，请手动复制脚本。",
                                  ),
                              });
                            });
                          }}
                          disabled={environmentSaving || environmentDraftScript.length === 0}
                        >
                          {t("Copy", "复制")}
                        </button>
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={() => setEnvironmentDraftScript(environmentSavedScript ?? "")}
                          disabled={environmentSaving || !environmentDirty}
                        >
                          {t("Reset", "重置")}
                        </button>
                        <button
                          type="button"
                          className="primary settings-button-compact"
                          onClick={() => {
                            void handleSaveEnvironmentSetup();
                          }}
                          disabled={environmentSaving || !environmentDirty}
                        >
                          {environmentSaving ? t("Saving...", "保存中...") : t("Save", "保存")}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
            {activeSection === "display" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("Display & Sound", "显示与声音")}</div>
                <div className="settings-section-subtitle">
                  {t("Tune visuals and audio alerts to your preferences.", "按你的偏好调整视觉与声音提醒。")}
                </div>
                <div className="settings-subsection-title">{t("Display", "显示")}</div>
                <div className="settings-subsection-subtitle">
                  {t("Adjust how the window renders backgrounds and effects.", "调整窗口背景与特效显示方式。")}
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="language-select">
                    {t("Language", "语言")}
                  </label>
                  <select
                    id="language-select"
                    className="settings-select"
                    value={appSettings.language ?? "en"}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        language: event.target.value as "en" | "zh",
                      })
                    }
                  >
                    <option value="en">{t("English", "英文")}</option>
                    <option value="zh">中文</option>
                  </select>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="theme-select">
                    {t("Theme", "主题")}
                  </label>
                  <select
                    id="theme-select"
                    className="settings-select"
                    value={appSettings.theme}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        theme: event.target.value as AppSettings["theme"],
                      })
                    }
                  >
                    <option value="system">{t("System", "跟随系统")}</option>
                    <option value="light">{t("Light", "浅色")}</option>
                    <option value="dark">{t("Dark", "深色")}</option>
                    <option value="dim">{t("Dim", "柔和暗色")}</option>
                  </select>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">
                      {t("Show remaining agent limits", "显示剩余额度")}
                    </div>
                    <div className="settings-toggle-subtitle">
                      {t("Display what is left instead of what is used.", "显示剩余值而不是已使用值。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${
                      appSettings.usageShowRemaining ? "on" : ""
                    }`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        usageShowRemaining: !appSettings.usageShowRemaining,
                      })
                    }
                    aria-pressed={appSettings.usageShowRemaining}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Reduce transparency", "降低透明效果")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Use solid surfaces instead of glass.", "使用纯色背景代替玻璃效果。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${reduceTransparency ? "on" : ""}`}
                    onClick={() => onToggleTransparency(!reduceTransparency)}
                    aria-pressed={reduceTransparency}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row settings-scale-row">
                  <div>
                    <div className="settings-toggle-title">{t("Interface scale", "界面缩放")}</div>
                    <div
                      className="settings-toggle-subtitle"
                      title={scaleShortcutTitle}
                    >
                      {scaleShortcutText}
                    </div>
                  </div>
                  <div className="settings-scale-controls">
                    <input
                      id="ui-scale"
                      type="text"
                      inputMode="decimal"
                      className="settings-input settings-input--scale"
                      value={scaleDraft}
                      aria-label={t("Interface scale", "界面缩放")}
                      onChange={(event) => setScaleDraft(event.target.value)}
                      onBlur={() => {
                        void handleCommitScale();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCommitScale();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost settings-scale-reset"
                      onClick={() => {
                        void handleResetScale();
                      }}
                    >
                      {t("Reset", "重置")}
                    </button>
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="ui-font-family">
                    {t("UI font family", "界面字体")}
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="ui-font-family"
                      type="text"
                      className="settings-input"
                      value={uiFontDraft}
                      onChange={(event) => setUiFontDraft(event.target.value)}
                      onBlur={() => {
                        void handleCommitUiFont();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCommitUiFont();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => {
                        setUiFontDraft(DEFAULT_UI_FONT_FAMILY);
                        void onUpdateAppSettings({
                          ...appSettings,
                          uiFontFamily: DEFAULT_UI_FONT_FAMILY,
                        });
                      }}
                    >
                      {t("Reset", "重置")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t(
                      "Applies to all UI text. Leave empty to use the default system font stack.",
                      "应用于所有界面文字。留空将使用系统默认字体栈。",
                    )}
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="code-font-family">
                    {t("Code font family", "代码字体")}
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="code-font-family"
                      type="text"
                      className="settings-input"
                      value={codeFontDraft}
                      onChange={(event) => setCodeFontDraft(event.target.value)}
                      onBlur={() => {
                        void handleCommitCodeFont();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCommitCodeFont();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => {
                        setCodeFontDraft(DEFAULT_CODE_FONT_FAMILY);
                        void onUpdateAppSettings({
                          ...appSettings,
                          codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
                        });
                      }}
                    >
                      {t("Reset", "重置")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Applies to git diffs and other mono-spaced readouts.", "应用于 Git Diff 和其他等宽文本区域。")}
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="code-font-size">
                    {t("Code font size", "代码字号")}
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="code-font-size"
                      type="range"
                      min={CODE_FONT_SIZE_MIN}
                      max={CODE_FONT_SIZE_MAX}
                      step={1}
                      className="settings-input settings-input--range"
                      value={codeFontSizeDraft}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setCodeFontSizeDraft(nextValue);
                        void handleCommitCodeFontSize(nextValue);
                      }}
                    />
                    <div className="settings-scale-value">{codeFontSizeDraft}px</div>
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => {
                        setCodeFontSizeDraft(CODE_FONT_SIZE_DEFAULT);
                        void handleCommitCodeFontSize(CODE_FONT_SIZE_DEFAULT);
                      }}
                    >
                      {t("Reset", "重置")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Adjusts code and diff text size.", "调整代码与 Diff 的文字大小。")}
                  </div>
                </div>
                <div className="settings-subsection-title">{t("Sounds", "声音")}</div>
                <div className="settings-subsection-subtitle">
                  {t("Control notification audio alerts.", "控制通知声音提醒。")}
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Notification sounds", "提示音")}</div>
                    <div className="settings-toggle-subtitle">
                      {t(
                        "Play a sound when a long-running agent finishes while the window is unfocused.",
                        "窗口不在前台时，长任务完成后播放提示音。",
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.notificationSoundsEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        notificationSoundsEnabled: !appSettings.notificationSoundsEnabled,
                      })
                    }
                    aria-pressed={appSettings.notificationSoundsEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("System notifications", "系统通知")}</div>
                    <div className="settings-toggle-subtitle">
                      {t(
                        "Show a macOS notification when a long-running agent finishes while the window is unfocused.",
                        "窗口不在前台时，长任务完成后显示 macOS 通知。",
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.systemNotificationsEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        systemNotificationsEnabled: !appSettings.systemNotificationsEnabled,
                      })
                    }
                    aria-pressed={appSettings.systemNotificationsEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-sound-actions">
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={onTestNotificationSound}
                  >
                    {t("Test sound", "测试提示音")}
                  </button>
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={onTestSystemNotification}
                  >
                    {t("Test notification", "测试通知")}
                  </button>
                </div>
              </section>
            )}
            {activeSection === "composer" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("Composer", "编辑器")}</div>
                <div className="settings-section-subtitle">
                  {t(
                    "Control helpers and formatting behavior inside the message editor.",
                    "控制消息编辑器中的辅助能力和格式化行为。",
                  )}
                </div>
                <div className="settings-subsection-title">{t("Presets", "预设")}</div>
                <div className="settings-subsection-subtitle">
                  {t("Choose a starting point and fine-tune the toggles below.", "先选择预设，再按需微调下方开关。")}
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="composer-preset">
                    {t("Preset", "预设")}
                  </label>
                  <select
                    id="composer-preset"
                    className="settings-select"
                    value={appSettings.composerEditorPreset}
                    onChange={(event) =>
                      handleComposerPresetChange(
                        event.target.value as ComposerPreset,
                      )
                    }
                  >
                    {Object.entries(COMPOSER_PRESET_LABELS).map(([preset, label]) => (
                      <option key={preset} value={preset}>
                        {isZh
                          ? COMPOSER_PRESET_LABELS_ZH[preset as ComposerPreset]
                          : label}
                      </option>
                    ))}
                  </select>
                  <div className="settings-help">
                    {t(
                      "Presets update the toggles below. Customize any setting after selecting.",
                      "选择预设后会同步更新下方开关，你仍可继续单独调整。",
                    )}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("Code fences", "代码围栏")}</div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Expand fences on Space", "按 Space 展开围栏")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Typing ``` then Space inserts a fenced block.", "输入 ``` 后按空格，自动插入代码块结构。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceExpandOnSpace ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceExpandOnSpace: !appSettings.composerFenceExpandOnSpace,
                      })
                    }
                    aria-pressed={appSettings.composerFenceExpandOnSpace}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Expand fences on Enter", "按 Enter 展开围栏")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Use Enter to expand ``` lines when enabled.", "启用后可用 Enter 展开 ``` 行。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceExpandOnEnter ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceExpandOnEnter: !appSettings.composerFenceExpandOnEnter,
                      })
                    }
                    aria-pressed={appSettings.composerFenceExpandOnEnter}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Support language tags", "支持语言标签")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Allows ```lang + Space to include a language.", "支持通过 ```lang + 空格插入语言标签。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceLanguageTags ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceLanguageTags: !appSettings.composerFenceLanguageTags,
                      })
                    }
                    aria-pressed={appSettings.composerFenceLanguageTags}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Wrap selection in fences", "选中文本包裹围栏")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Wraps selected text when creating a fence.", "创建围栏时自动包裹当前选中文本。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceWrapSelection ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceWrapSelection: !appSettings.composerFenceWrapSelection,
                      })
                    }
                    aria-pressed={appSettings.composerFenceWrapSelection}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Copy blocks without fences", "复制时去掉围栏")}</div>
                    <div className="settings-toggle-subtitle">
                      {t(
                        "When enabled, Copy is plain text. Hold Option to include ``` fences.",
                        "开启后默认复制纯文本；按住 Option 可保留 ``` 围栏。",
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerCodeBlockCopyUseModifier ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerCodeBlockCopyUseModifier:
                          !appSettings.composerCodeBlockCopyUseModifier,
                      })
                    }
                    aria-pressed={appSettings.composerCodeBlockCopyUseModifier}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("Pasting", "粘贴")}</div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Auto-wrap multi-line paste", "多行粘贴自动包裹")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Wraps multi-line paste inside a fenced block.", "将多行粘贴内容自动包裹为代码块。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceAutoWrapPasteMultiline ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceAutoWrapPasteMultiline:
                          !appSettings.composerFenceAutoWrapPasteMultiline,
                      })
                    }
                    aria-pressed={appSettings.composerFenceAutoWrapPasteMultiline}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Auto-wrap code-like single lines", "类代码单行自动包裹")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Wraps long single-line code snippets on paste.", "粘贴长单行代码片段时自动包裹。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceAutoWrapPasteCodeLike ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceAutoWrapPasteCodeLike:
                          !appSettings.composerFenceAutoWrapPasteCodeLike,
                      })
                    }
                    aria-pressed={appSettings.composerFenceAutoWrapPasteCodeLike}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("Lists", "列表")}</div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Continue lists on Shift+Enter", "Shift+Enter 延续列表")}</div>
                    <div className="settings-toggle-subtitle">
                      {t(
                        "Continues numbered and bulleted lists when the line has content.",
                        "当前行有内容时，按 Shift+Enter 自动延续有序/无序列表。",
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerListContinuation ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerListContinuation: !appSettings.composerListContinuation,
                      })
                    }
                    aria-pressed={appSettings.composerListContinuation}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </section>
            )}
            {activeSection === "dictation" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("Dictation", "语音输入")}</div>
                <div className="settings-section-subtitle">
                  {t("Enable microphone dictation with on-device transcription.", "启用麦克风语音输入与本地转写。")}
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Enable dictation", "启用语音输入")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Downloads the selected Whisper model on first use.", "首次使用会下载所选 Whisper 模型。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.dictationEnabled ? "on" : ""}`}
                    onClick={() => {
                      const nextEnabled = !appSettings.dictationEnabled;
                      void onUpdateAppSettings({
                        ...appSettings,
                        dictationEnabled: nextEnabled,
                      });
                      if (
                        !nextEnabled &&
                        dictationModelStatus?.state === "downloading" &&
                        onCancelDictationDownload
                      ) {
                        onCancelDictationDownload();
                      }
                      if (
                        nextEnabled &&
                        dictationModelStatus?.state === "missing" &&
                        onDownloadDictationModel
                      ) {
                        onDownloadDictationModel();
                      }
                    }}
                    aria-pressed={appSettings.dictationEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="dictation-model">
                    {t("Dictation model", "语音模型")}
                  </label>
                  <select
                    id="dictation-model"
                    className="settings-select"
                    value={appSettings.dictationModelId}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        dictationModelId: event.target.value,
                      })
                    }
                  >
                    {DICTATION_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label} ({model.size})
                      </option>
                    ))}
                  </select>
                  <div className="settings-help">
                    {isZh
                      ? `下载大小：${selectedDictationModel.size}。`
                      : `${selectedDictationModel.note} Download size: ${selectedDictationModel.size}.`}
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="dictation-language">
                    {t("Preferred dictation language", "优先识别语言")}
                  </label>
                  <select
                    id="dictation-language"
                    className="settings-select"
                    value={appSettings.dictationPreferredLanguage ?? ""}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        dictationPreferredLanguage: event.target.value || null,
                      })
                    }
                  >
                    <option value="">{t("Auto-detect only", "仅自动识别")}</option>
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="nl">Dutch</option>
                    <option value="sv">Swedish</option>
                    <option value="no">Norwegian</option>
                    <option value="da">Danish</option>
                    <option value="fi">Finnish</option>
                    <option value="pl">Polish</option>
                    <option value="tr">Turkish</option>
                    <option value="ru">Russian</option>
                    <option value="uk">Ukrainian</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="zh">Chinese</option>
                  </select>
                  <div className="settings-help">
                    {t(
                      "Auto-detect stays on; this nudges the decoder toward your preference.",
                      "自动识别会保持开启；该项仅用于提升偏好语言的识别概率。",
                    )}
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="dictation-hold-key">
                    {t("Hold-to-dictate key", "按住说话按键")}
                  </label>
                  <select
                    id="dictation-hold-key"
                    className="settings-select"
                    value={appSettings.dictationHoldKey ?? ""}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        dictationHoldKey: event.target.value,
                      })
                    }
                  >
                    <option value="">{t("Off", "关闭")}</option>
                    <option value="alt">{t("Option / Alt", "Option / Alt")}</option>
                    <option value="shift">Shift</option>
                    <option value="control">Control</option>
                    <option value="meta">Command / Meta</option>
                  </select>
                  <div className="settings-help">
                    {t("Hold the key to start dictation, release to stop and process.", "按住按键开始说话，松开后停止并处理。")}
                  </div>
                </div>
                {dictationModelStatus && (
                  <div className="settings-field">
                    <div className="settings-field-label">
                      {t("Model status", "模型状态")} ({selectedDictationModel.label})
                    </div>
                    <div className="settings-help">
                      {dictationModelStatus.state === "ready" &&
                        t("Ready for dictation.", "可开始语音输入。")}
                      {dictationModelStatus.state === "missing" &&
                        t("Model not downloaded yet.", "模型尚未下载。")}
                      {dictationModelStatus.state === "downloading" &&
                        t("Downloading model...", "模型下载中...")}
                      {dictationModelStatus.state === "error" &&
                        (dictationModelStatus.error ?? t("Download error.", "下载失败。"))}
                    </div>
                    {dictationProgress && (
                      <div className="settings-download-progress">
                        <div className="settings-download-bar">
                          <div
                            className="settings-download-fill"
                            style={{
                              width: dictationProgress.totalBytes
                                ? `${Math.min(
                                    100,
                                    (dictationProgress.downloadedBytes /
                                      dictationProgress.totalBytes) *
                                      100,
                                  )}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <div className="settings-download-meta">
                          {formatDownloadSize(dictationProgress.downloadedBytes)}
                        </div>
                      </div>
                    )}
                    <div className="settings-field-actions">
                      {dictationModelStatus.state === "missing" && (
                        <button
                          type="button"
                          className="primary"
                          onClick={onDownloadDictationModel}
                          disabled={!onDownloadDictationModel}
                        >
                          {t("Download model", "下载模型")}
                        </button>
                      )}
                      {dictationModelStatus.state === "downloading" && (
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={onCancelDictationDownload}
                          disabled={!onCancelDictationDownload}
                        >
                          {t("Cancel download", "取消下载")}
                        </button>
                      )}
                      {dictationReady && (
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={onRemoveDictationModel}
                          disabled={!onRemoveDictationModel}
                        >
                          {t("Remove model", "删除模型")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
            {activeSection === "shortcuts" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("Shortcuts", "快捷键")}</div>
                <div className="settings-section-subtitle">
                  {t(
                    "Customize keyboard shortcuts for file actions, composer, panels, and navigation.",
                    "自定义文件操作、编辑器、面板与导航相关的键盘快捷键。",
                  )}
                </div>
                <div className="settings-subsection-title">{t("File", "文件")}</div>
                <div className="settings-subsection-subtitle">
                  {t("Create agents and worktrees from the keyboard.", "通过键盘创建 Agent 和工作树。")}
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("New Agent", "新建 Agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.newAgent)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "newAgentShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("newAgentShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+n")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("New Worktree Agent", "新建工作树 Agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.newWorktreeAgent)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "newWorktreeAgentShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("newWorktreeAgentShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+shift+n")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("New Clone Agent", "新建克隆 Agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.newCloneAgent)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "newCloneAgentShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("newCloneAgentShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+alt+n")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Archive active thread", "归档当前会话")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.archiveThread)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "archiveThreadShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("archiveThreadShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+ctrl+a")}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("Composer", "编辑器")}</div>
                <div className="settings-subsection-subtitle">
                  {t(
                    "Cycle between model, access, reasoning, and collaboration modes.",
                    "在模型、权限、推理与协作模式之间切换。",
                  )}
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Cycle model", "切换模型")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.model)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerModelShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerModelShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Press a new shortcut while focused. Default:", "聚焦输入框后按下新快捷键。默认：")}{" "}
                    {formatShortcut("cmd+shift+m")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Cycle access mode", "切换权限模式")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.access)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerAccessShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerAccessShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+shift+a")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Cycle reasoning mode", "切换推理模式")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.reasoning)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerReasoningShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerReasoningShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+shift+r")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Cycle collaboration mode", "切换协作模式")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.collaboration)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerCollaborationShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerCollaborationShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("shift+tab")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Stop active run", "停止当前运行")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.interrupt)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "interruptShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("interruptShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut(getDefaultInterruptShortcut())}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("Panels", "面板")}</div>
                <div className="settings-subsection-subtitle">
                  {t("Toggle sidebars and panels.", "切换侧边栏与各类面板。")}
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Toggle projects sidebar", "切换项目侧栏")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.projectsSidebar)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleProjectsSidebarShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleProjectsSidebarShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+shift+p")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Toggle git sidebar", "切换 Git 侧栏")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.gitSidebar)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleGitSidebarShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleGitSidebarShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+shift+g")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Branch switcher", "分支切换器")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.branchSwitcher)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "branchSwitcherShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("branchSwitcherShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+b")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Toggle debug panel", "切换调试面板")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.debugPanel)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleDebugPanelShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleDebugPanelShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+shift+d")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Toggle terminal panel", "切换终端面板")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.terminal)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleTerminalShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleTerminalShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+shift+t")}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("Navigation", "导航")}</div>
                <div className="settings-subsection-subtitle">
                  {t("Cycle between agents and workspaces.", "在 Agent 和工作区之间切换。")}
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Next agent", "下一个 Agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleAgentNext)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleAgentNextShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleAgentNextShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+ctrl+down")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Previous agent", "上一个 Agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleAgentPrev)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleAgentPrevShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleAgentPrevShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+ctrl+up")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Next workspace", "下一个工作区")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleWorkspaceNext)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleWorkspaceNextShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleWorkspaceNextShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+shift+down")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("Previous workspace", "上一个工作区")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleWorkspacePrev)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleWorkspacePrevShortcut")
                      }
                      placeholder={t("Type shortcut", "按下快捷键")}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleWorkspacePrevShortcut", null)}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Default:", "默认：")} {formatShortcut("cmd+shift+up")}
                  </div>
                </div>
              </section>
            )}
            {activeSection === "open-apps" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("Open in", "打开方式")}</div>
                <div className="settings-section-subtitle">
                  {t(
                    "Customize the Open in menu shown in the title bar and file previews.",
                    "自定义标题栏和文件预览中的“打开方式”菜单。",
                  )}
                </div>
                <div className="settings-open-apps">
                  {openAppDrafts.map((target, index) => {
                    const iconSrc =
                      getKnownOpenAppIcon(target.id) ??
                      openAppIconById[target.id] ??
                      GENERIC_APP_ICON;
                    const labelValid = isOpenAppLabelValid(target.label);
                    const appNameValid =
                      target.kind !== "app" || Boolean(target.appName?.trim());
                    const commandValid =
                      target.kind !== "command" || Boolean(target.command?.trim());
                    const isComplete = labelValid && appNameValid && commandValid;
                    const incompleteHint = !labelValid
                      ? t("Label required", "名称必填")
                      : target.kind === "app"
                        ? t("App name required", "应用名必填")
                        : target.kind === "command"
                          ? t("Command required", "命令必填")
                          : t("Complete required fields", "请补全必填项");
                    return (
                      <div
                        key={target.id}
                        className={`settings-open-app-row${
                          isComplete ? "" : " is-incomplete"
                        }`}
                      >
                        <div className="settings-open-app-icon-wrap" aria-hidden>
                          <img
                            className="settings-open-app-icon"
                            src={iconSrc}
                            alt=""
                            width={18}
                            height={18}
                          />
                        </div>
                        <div className="settings-open-app-fields">
                          <label className="settings-open-app-field settings-open-app-field--label">
                              <span className="settings-visually-hidden">{t("Label", "名称")}</span>
                            <input
                              className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--label"
                              value={target.label}
                              placeholder={t("Label", "名称")}
                              onChange={(event) =>
                                handleOpenAppDraftChange(index, {
                                  label: event.target.value,
                                })
                              }
                              onBlur={() => {
                                void handleCommitOpenApps(openAppDrafts);
                              }}
                              aria-label={`Open app label ${index + 1}`}
                              data-invalid={!labelValid || undefined}
                            />
                          </label>
                          <label className="settings-open-app-field settings-open-app-field--type">
                              <span className="settings-visually-hidden">{t("Type", "类型")}</span>
                            <select
                              className="settings-select settings-select--compact settings-open-app-kind"
                              value={target.kind}
                              onChange={(event) =>
                                handleOpenAppKindChange(
                                  index,
                                  event.target.value as OpenAppTarget["kind"],
                                )
                              }
                              aria-label={`Open app type ${index + 1}`}
                            >
                              <option value="app">{t("App", "应用")}</option>
                              <option value="command">{t("Command", "命令")}</option>
                              <option value="finder">Finder</option>
                            </select>
                          </label>
                          {target.kind === "app" && (
                            <label className="settings-open-app-field settings-open-app-field--appname">
                              <span className="settings-visually-hidden">{t("App name", "应用名")}</span>
                              <input
                                className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--appname"
                                value={target.appName ?? ""}
                                placeholder={t("App name", "应用名")}
                                onChange={(event) =>
                                  handleOpenAppDraftChange(index, {
                                    appName: event.target.value,
                                  })
                                }
                                onBlur={() => {
                                  void handleCommitOpenApps(openAppDrafts);
                                }}
                                aria-label={`Open app name ${index + 1}`}
                                data-invalid={!appNameValid || undefined}
                              />
                            </label>
                          )}
                          {target.kind === "command" && (
                            <label className="settings-open-app-field settings-open-app-field--command">
                              <span className="settings-visually-hidden">{t("Command", "命令")}</span>
                              <input
                                className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--command"
                                value={target.command ?? ""}
                                placeholder={t("Command", "命令")}
                                onChange={(event) =>
                                  handleOpenAppDraftChange(index, {
                                    command: event.target.value,
                                  })
                                }
                                onBlur={() => {
                                  void handleCommitOpenApps(openAppDrafts);
                                }}
                                aria-label={`Open app command ${index + 1}`}
                                data-invalid={!commandValid || undefined}
                              />
                            </label>
                          )}
                          {target.kind !== "finder" && (
                            <label className="settings-open-app-field settings-open-app-field--args">
                              <span className="settings-visually-hidden">{t("Args", "参数")}</span>
                              <input
                                className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--args"
                                value={target.argsText}
                                placeholder={t("Args", "参数")}
                                onChange={(event) =>
                                  handleOpenAppDraftChange(index, {
                                    argsText: event.target.value,
                                  })
                                }
                                onBlur={() => {
                                  void handleCommitOpenApps(openAppDrafts);
                                }}
                                aria-label={`Open app args ${index + 1}`}
                              />
                            </label>
                          )}
                        </div>
                        <div className="settings-open-app-actions">
                          {!isComplete && (
                            <span
                              className="settings-open-app-status"
                              title={incompleteHint}
                              aria-label={incompleteHint}
                            >
                              {t("Incomplete", "未完成")}
                            </span>
                          )}
                          <label className="settings-open-app-default">
                            <input
                              type="radio"
                              name="open-app-default"
                              checked={target.id === openAppSelectedId}
                              onChange={() => handleSelectOpenAppDefault(target.id)}
                              disabled={!isComplete}
                            />
                            {t("Default", "默认")}
                          </label>
                          <div className="settings-open-app-order">
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => handleMoveOpenApp(index, "up")}
                              disabled={index === 0}
                              aria-label={t("Move up", "上移")}
                            >
                              <ChevronUp aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => handleMoveOpenApp(index, "down")}
                              disabled={index === openAppDrafts.length - 1}
                              aria-label={t("Move down", "下移")}
                            >
                              <ChevronDown aria-hidden />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="ghost icon-button"
                            onClick={() => handleDeleteOpenApp(index)}
                            disabled={openAppDrafts.length <= 1}
                            aria-label={t("Remove app", "移除应用")}
                            title={t("Remove app", "移除应用")}
                          >
                            <Trash2 aria-hidden />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="settings-open-app-footer">
                  <button
                    type="button"
                    className="ghost"
                    onClick={handleAddOpenApp}
                  >
                    {t("Add app", "添加应用")}
                  </button>
                  <div className="settings-help">
                    {t(
                      "Commands receive the selected path as the final argument. Apps use macOS open with optional args.",
                      "命令会将当前路径作为最后一个参数；应用会使用 macOS open 并附加可选参数。",
                    )}
                  </div>
                </div>
              </section>
            )}
            {activeSection === "git" && (
              <section className="settings-section">
                <div className="settings-section-title">Git</div>
                <div className="settings-section-subtitle">
                  {t("Manage how diffs are loaded in the Git sidebar.", "管理 Git 侧栏中 Diff 的加载方式。")}
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Preload git diffs", "预加载 Git Diff")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Make viewing git diff faster.", "提升查看 Git Diff 的速度。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.preloadGitDiffs ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        preloadGitDiffs: !appSettings.preloadGitDiffs,
                      })
                    }
                    aria-pressed={appSettings.preloadGitDiffs}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Ignore whitespace changes", "忽略空白字符变更")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Hides whitespace-only changes in local and commit diffs.", "在本地与提交 Diff 中隐藏仅空白字符的变更。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.gitDiffIgnoreWhitespaceChanges ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        gitDiffIgnoreWhitespaceChanges: !appSettings.gitDiffIgnoreWhitespaceChanges,
                      })
                    }
                    aria-pressed={appSettings.gitDiffIgnoreWhitespaceChanges}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </section>
            )}
            {activeSection === "micode" && (
              <section className="settings-section">
                <div className="settings-section-title">MiCode</div>
                <div className="settings-section-subtitle">
                  {t("Configure the MiCode CLI used by this app and validate the install.", "配置本应用使用的 MiCode CLI，并校验安装状态。")}
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="micode-path">
                    {t("Default agent path", "默认 Agent 路径")}
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="micode-path"
                      className="settings-input"
                      value={micodePathDraft}
                      placeholder="micode"
                      onChange={(event) => setMiCodePathDraft(event.target.value)}
                    />
                    <button type="button" className="ghost" onClick={handleBrowseMiCode}>
                      {t("Browse", "浏览")}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setMiCodePathDraft("")}
                    >
                      {t("Use PATH", "使用 PATH")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("Leave empty to use the system PATH resolution.", "留空则使用系统 PATH 自动解析。")}
                  </div>
                  <label className="settings-field-label" htmlFor="micode-args">
                    {t("Default agent args", "默认 Agent 参数")}
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="micode-args"
                      className="settings-input"
                      value={micodeArgsDraft}
                      placeholder="--profile personal"
                      onChange={(event) => setMiCodeArgsDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setMiCodeArgsDraft("")}
                    >
                      {t("Clear", "清空")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t(
                      "Extra flags passed to micode before --experimental-acp. Use quotes for values with spaces.",
                      "附加参数会在 --experimental-acp 之前传给 micode。含空格的参数值请使用引号。",
                    )}
                  </div>
                <div className="settings-field-actions">
                  {micodeDirty && (
                    <button
                      type="button"
                      className="primary"
                      onClick={handleSaveMiCodeSettings}
                      disabled={isSavingSettings}
                    >
                      {isSavingSettings ? t("Saving...", "保存中...") : t("Save", "保存")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={handleRunDoctor}
                    disabled={doctorState.status === "running"}
                  >
                    <Stethoscope aria-hidden />
                    {doctorState.status === "running" ? t("Running...", "检查中...") : t("Run doctor", "运行诊断")}
                  </button>
                </div>

                {doctorState.result && (
                  <div
                    className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}
                  >
                    <div className="settings-doctor-title">
                      {doctorState.result.ok
                        ? t("Agent CLI looks good", "Agent CLI 状态正常")
                        : t("Agent CLI issue detected", "检测到 Agent CLI 问题")}
                    </div>
                    <div className="settings-doctor-body">
                      <div>
                        {t("Version", "版本")}：{doctorState.result.version ?? t("unknown", "未知")}
                      </div>
                      <div>
                        App-server：{doctorState.result.appServerOk ? t("ok", "正常") : t("failed", "失败")}
                      </div>
                      <div>
                        Node：
                        {doctorState.result.nodeOk
                          ? `${t("ok", "正常")} (${doctorState.result.nodeVersion ?? t("unknown", "未知")})`
                          : t("missing", "缺失")}
                      </div>
                      {doctorState.result.details && (
                        <div>{doctorState.result.details}</div>
                      )}
                      {doctorState.result.nodeDetails && (
                        <div>{doctorState.result.nodeDetails}</div>
                      )}
                      {doctorState.result.path && (
                        <div className="settings-doctor-path">
                          PATH：{doctorState.result.path}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="default-access">
                    {t("Default access mode", "默认权限模式")}
                  </label>
                  <select
                    id="default-access"
                    className="settings-select"
                    value={appSettings.defaultAccessMode}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        defaultAccessMode: event.target.value as AppSettings["defaultAccessMode"],
                      })
                    }
                  >
                    <option value="read-only">{t("Read only", "只读")}</option>
                    <option value="current">{t("On-request", "按需授权")}</option>
                    <option value="full-access">{t("Full access", "完全访问")}</option>
                  </select>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="review-delivery">
                    {t("Review mode", "Review 模式")}
                  </label>
                  <select
                    id="review-delivery"
                    className="settings-select"
                    value={appSettings.reviewDeliveryMode}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        reviewDeliveryMode:
                          event.target.value as AppSettings["reviewDeliveryMode"],
                      })
                    }
                  >
                    <option value="inline">{t("Inline (same thread)", "内联（同线程）")}</option>
                    <option value="detached">{t("Detached (new review thread)", "分离（新 Review 线程）")}</option>
                  </select>
                  <div className="settings-help">
                    {t(
                      "Choose whether /review runs in the current thread or a detached review thread.",
                      "选择 /review 在当前线程执行，或使用独立 Review 线程。",
                    )}
                  </div>
                </div>

                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="backend-mode">
                    {t("Backend mode", "后端模式")}
                  </label>
                  <select
                    id="backend-mode"
                    className="settings-select"
                    value={appSettings.backendMode}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        backendMode: event.target.value as AppSettings["backendMode"],
                      })
                    }
                  >
                    <option value="local">{t("Local (default)", "本地（默认）")}</option>
                    <option value="remote">{t("Remote (daemon)", "远程（守护进程）")}</option>
                  </select>
                  <div className="settings-help">
                    {t(
                      "Remote mode connects to a separate daemon running the backend on another machine (e.g. WSL2/Linux).",
                      "远程模式会连接另一台机器（如 WSL2/Linux）上运行的独立后端守护进程。",
                    )}
                  </div>
                </div>


                <FileEditorCard
                  title={t("Global AGENTS.md", "全局 AGENTS.md")}
                  meta={globalAgentsMeta}
                  error={globalAgentsError}
                  value={globalAgentsContent}
                  placeholder={t("Add global instructions for agents…", "为 Agent 添加全局说明…")}
                  disabled={globalAgentsLoading}
                  refreshDisabled={globalAgentsRefreshDisabled}
                  saveDisabled={globalAgentsSaveDisabled}
                  saveLabel={globalAgentsSaveLabel}
                  onChange={setGlobalAgentsContent}
                  onRefresh={() => {
                    void refreshGlobalAgents();
                  }}
                  onSave={() => {
                    void saveGlobalAgents();
                  }}
                  helpText={
                    <>
                      {t("Stored at", "存储于")} <code>~/.micode/AGENTS.md</code>。
                    </>
                  }
                  classNames={{
                    container: "settings-field settings-agents",
                    header: "settings-agents-header",
                    title: "settings-field-label",
                    actions: "settings-agents-actions",
                    meta: "settings-help settings-help-inline",
                    iconButton: "ghost settings-icon-button",
                    error: "settings-agents-error",
                    textarea: "settings-agents-textarea",
                    help: "settings-help",
                  }}
                />

                <FileEditorCard
                  title={t("Global config.toml", "全局 config.toml")}
                  meta={globalConfigMeta}
                  error={globalConfigError}
                  value={globalConfigContent}
                  placeholder={t("Edit the global agent config.toml…", "编辑全局 agent config.toml…")}
                  disabled={globalConfigLoading}
                  refreshDisabled={globalConfigRefreshDisabled}
                  saveDisabled={globalConfigSaveDisabled}
                  saveLabel={globalConfigSaveLabel}
                  onChange={setGlobalConfigContent}
                  onRefresh={() => {
                    void refreshGlobalConfig();
                  }}
                  onSave={() => {
                    void saveGlobalConfig();
                  }}
                  helpText={
                    <>
                      {t("Stored at", "存储于")} <code>~/.micode/config.toml</code>。
                    </>
                  }
                  classNames={{
                    container: "settings-field settings-agents",
                    header: "settings-agents-header",
                    title: "settings-field-label",
                    actions: "settings-agents-actions",
                    meta: "settings-help settings-help-inline",
                    iconButton: "ghost settings-icon-button",
                    error: "settings-agents-error",
                    textarea: "settings-agents-textarea",
                    help: "settings-help",
                  }}
                />

                <div className="settings-field">
                  <div className="settings-field-label">{t("Workspace overrides", "工作区覆盖配置")}</div>
                  <div className="settings-overrides">
                    {projects.map((workspace) => (
                      <div key={workspace.id} className="settings-override-row">
                        <div className="settings-override-info">
                          <div className="settings-project-name">{workspace.name}</div>
                          <div className="settings-project-path">{workspace.path}</div>
                        </div>
                        <div className="settings-override-actions">
                          <div className="settings-override-field">
                            <input
                              className="settings-input settings-input--compact"
                              value={micodeBinOverrideDrafts[workspace.id] ?? ""}
                              placeholder={t("MiCode binary override", "MiCode 可执行文件覆盖")}
                              onChange={(event) =>
                                setMiCodeBinOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: event.target.value,
                                }))
                              }
                              onBlur={async () => {
                                const draft = micodeBinOverrideDrafts[workspace.id] ?? "";
                                const nextValue = normalizeOverrideValue(draft);
                                if (
                                  nextValue ===
                                  (workspace.agent_bin ?? workspace.micode_bin ?? null)
                                ) {
                                  return;
                                }
                                await onUpdateWorkspaceMiCodeBin(workspace.id, nextValue);
                              }}
                              aria-label={`MiCode binary override for ${workspace.name}`}
                            />
                            <button
                              type="button"
                              className="ghost"
                              onClick={async () => {
                                setMiCodeBinOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: "",
                                }));
                                await onUpdateWorkspaceMiCodeBin(workspace.id, null);
                              }}
                            >
                              Clear
                            </button>
                          </div>
                          <div className="settings-override-field">
                            <input
                              className="settings-input settings-input--compact"
                              value={micodeHomeOverrideDrafts[workspace.id] ?? ""}
                              placeholder={t("CODEX_HOME override", "CODEX_HOME 覆盖")}
                              onChange={(event) =>
                                setMiCodeHomeOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: event.target.value,
                                }))
                              }
                              onBlur={async () => {
                                const draft = micodeHomeOverrideDrafts[workspace.id] ?? "";
                                const nextValue = normalizeOverrideValue(draft);
                                if (
                                  nextValue ===
                                  (workspace.settings.agentHome ??
                                    workspace.settings.micodeHome ??
                                    null)
                                ) {
                                  return;
                                }
                                await onUpdateWorkspaceSettings(workspace.id, {
                                  agentHome: nextValue,
                                  micodeHome: nextValue,
                                });
                              }}
                              aria-label={`CODEX_HOME override for ${workspace.name}`}
                            />
                            <button
                              type="button"
                              className="ghost"
                              onClick={async () => {
                                setMiCodeHomeOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: "",
                                }));
                                await onUpdateWorkspaceSettings(workspace.id, {
                                  agentHome: null,
                                  micodeHome: null,
                                });
                              }}
                            >
                              Clear
                            </button>
                          </div>
                          <div className="settings-override-field">
                            <input
                              className="settings-input settings-input--compact"
                              value={micodeArgsOverrideDrafts[workspace.id] ?? ""}
                              placeholder={t("MiCode args override", "MiCode 参数覆盖")}
                              onChange={(event) =>
                                setMiCodeArgsOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: event.target.value,
                                }))
                              }
                              onBlur={async () => {
                                const draft = micodeArgsOverrideDrafts[workspace.id] ?? "";
                                const nextValue = normalizeOverrideValue(draft);
                                if (
                                  nextValue ===
                                  (workspace.settings.agentArgs ??
                                    workspace.settings.micodeArgs ??
                                    null)
                                ) {
                                  return;
                                }
                                await onUpdateWorkspaceSettings(workspace.id, {
                                  agentArgs: nextValue,
                                  micodeArgs: nextValue,
                                });
                              }}
                              aria-label={`MiCode args override for ${workspace.name}`}
                            />
                            <button
                              type="button"
                              className="ghost"
                              onClick={async () => {
                                setMiCodeArgsOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: "",
                                }));
                                await onUpdateWorkspaceSettings(workspace.id, {
                                  agentArgs: null,
                                  micodeArgs: null,
                                });
                              }}
                            >
                              {t("Clear", "清空")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <div className="settings-empty">{t("No projects yet.", "暂无项目。")}</div>
                    )}
                  </div>
                </div>

              </section>
            )}
            {activeSection === "features" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("Features", "功能")}</div>
                <div className="settings-section-subtitle">
                  {t("Manage stable agent features.", "管理稳定可用的 Agent 功能。")}
                </div>
                {hasMiCodeHomeOverrides && (
                  <div className="settings-help">
                    {t(
                      "Feature settings are stored in the default CODEX_HOME config.toml.",
                      "功能设置保存在默认 CODEX_HOME 下的 config.toml 中。",
                    )}
                    <br />
                    {t("Workspace overrides are not updated.", "不会自动更新工作区覆盖配置。")}
                  </div>
                )}
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Config file", "配置文件")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Open the agent config in Finder.", "在 Finder 中打开 Agent 配置。")}
                    </div>
                  </div>
                  <button type="button" className="ghost" onClick={handleOpenConfig}>
                    {t("Open in Finder", "在 Finder 中打开")}
                  </button>
                </div>
                {openConfigError && (
                  <div className="settings-help">{openConfigError}</div>
                )}
                <div className="settings-subsection-title">{t("Stable Features", "稳定功能")}</div>
                <div className="settings-subsection-subtitle">
                  {t("Production-ready features enabled by default.", "默认启用、可稳定使用的功能。")}
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Collaboration modes", "协作模式")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Enable collaboration mode presets (Code, Plan).", "启用协作模式预设（Code、Plan）。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${
                      appSettings.collaborationModesEnabled ? "on" : ""
                    }`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        collaborationModesEnabled:
                          !appSettings.collaborationModesEnabled,
                      })
                    }
                    aria-pressed={appSettings.collaborationModesEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Personality", "风格")}</div>
                    <div className="settings-toggle-subtitle">
                      {t(
                        "Choose agent communication style (writes top-level personality in config.toml).",
                        "选择 Agent 沟通风格（写入 config.toml 顶层 personality）。",
                      )}
                    </div>
                  </div>
                  <select
                    id="features-personality-select"
                    className="settings-select"
                    value={appSettings.personality}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        personality: event.target.value as AppSettings["personality"],
                      })
                    }
                    aria-label={t("Personality", "风格")}
                  >
                    <option value="friendly">{t("Friendly", "友好")}</option>
                    <option value="pragmatic">{t("Pragmatic", "务实")}</option>
                  </select>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Steer mode", "Steer 模式")}</div>
                    <div className="settings-toggle-subtitle">
                      {t(
                        "Send messages immediately. Use Tab to queue while a run is active.",
                        "消息立即发送；运行中可用 Tab 加入队列。",
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.steerEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        steerEnabled: !appSettings.steerEnabled,
                      })
                    }
                    aria-pressed={appSettings.steerEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("Background terminal", "后台终端")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("Run long-running terminal commands in the background.", "在后台运行长时间终端命令。")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.unifiedExecEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        unifiedExecEnabled: !appSettings.unifiedExecEnabled,
                      })
                    }
                    aria-pressed={appSettings.unifiedExecEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
