import { lazy, memo, Suspense } from "react";
import type { ComponentType } from "react";
import type { BranchInfo, WorkspaceInfo } from "../../../types";
import type { SettingsViewProps } from "../../settings/components/SettingsView";
import { useRenameThreadPrompt } from "../../threads/hooks/useRenameThreadPrompt";
import { useWorktreePrompt } from "../../workspaces/hooks/useWorktreePrompt";
import type { BranchSwitcherState } from "../../git/hooks/useBranchSwitcher";
import { useGitBranches } from "../../git/hooks/useGitBranches";

const RenameThreadPrompt = lazy(() =>
  import("../../threads/components/RenameThreadPrompt").then((module) => ({
    default: module.RenameThreadPrompt,
  })),
);
const WorktreePrompt = lazy(() =>
  import("../../workspaces/components/WorktreePrompt").then((module) => ({
    default: module.WorktreePrompt,
  })),
);
const BranchSwitcherPrompt = lazy(() =>
  import("../../git/components/BranchSwitcherPrompt").then((module) => ({
    default: module.BranchSwitcherPrompt,
  })),
);

type RenamePromptState = ReturnType<typeof useRenameThreadPrompt>["renamePrompt"];

type WorktreePromptState = ReturnType<typeof useWorktreePrompt>["worktreePrompt"];

type AppModalsProps = {
  renamePrompt: RenamePromptState;
  onRenamePromptChange: (value: string) => void;
  onRenamePromptCancel: () => void;
  onRenamePromptConfirm: () => void;
  worktreePrompt: WorktreePromptState;
  onWorktreePromptNameChange: (value: string) => void;
  onWorktreePromptChange: (value: string) => void;
  onWorktreePromptCopyAgentsMdChange: (value: boolean) => void;
  onWorktreeSetupScriptChange: (value: string) => void;
  onWorktreePromptCancel: () => void;
  onWorktreePromptConfirm: () => void;
  branchSwitcher: BranchSwitcherState;
  branches: BranchInfo[];
  workspaces: WorkspaceInfo[];
  activeWorkspace: WorkspaceInfo | null;
  currentBranch: string | null;
  onBranchSwitcherSelect: (branch: string, worktree: WorkspaceInfo | null) => void;
  onBranchSwitcherCancel: () => void;
  settingsOpen: boolean;
  settingsSection: SettingsViewProps["initialSection"] | null;
  onCloseSettings: () => void;
  SettingsViewComponent: ComponentType<SettingsViewProps>;
  settingsProps: Omit<SettingsViewProps, "initialSection" | "onClose">;
};

export const AppModals = memo(function AppModals({
  renamePrompt,
  onRenamePromptChange,
  onRenamePromptCancel,
  onRenamePromptConfirm,
  worktreePrompt,
  onWorktreePromptNameChange,
  onWorktreePromptChange,
  onWorktreePromptCopyAgentsMdChange,
  onWorktreeSetupScriptChange,
  onWorktreePromptCancel,
  onWorktreePromptConfirm,
  branchSwitcher,
  branches,
  workspaces,
  activeWorkspace,
  currentBranch,
  onBranchSwitcherSelect,
  onBranchSwitcherCancel,
  settingsOpen,
  settingsSection,
  onCloseSettings,
  SettingsViewComponent,
  settingsProps,
}: AppModalsProps) {
  const { branches: worktreeBranches } = useGitBranches({
    activeWorkspace: worktreePrompt?.workspace ?? null,
  });

  return (
    <>
      {renamePrompt && (
        <Suspense fallback={null}>
          <RenameThreadPrompt
            currentName={renamePrompt.originalName}
            name={renamePrompt.name}
            onChange={onRenamePromptChange}
            onCancel={onRenamePromptCancel}
            onConfirm={onRenamePromptConfirm}
          />
        </Suspense>
      )}
      {worktreePrompt && (
        <Suspense fallback={null}>
          <WorktreePrompt
            workspaceName={worktreePrompt.workspace.name}
            name={worktreePrompt.name}
            branch={worktreePrompt.branch}
            branchWasEdited={worktreePrompt.branchWasEdited}
            branchSuggestions={worktreeBranches}
            copyAgentsMd={worktreePrompt.copyAgentsMd}
            setupScript={worktreePrompt.setupScript}
            scriptError={worktreePrompt.scriptError}
            error={worktreePrompt.error}
            isBusy={worktreePrompt.isSubmitting}
            isSavingScript={worktreePrompt.isSavingScript}
            onNameChange={onWorktreePromptNameChange}
            onChange={onWorktreePromptChange}
            onCopyAgentsMdChange={onWorktreePromptCopyAgentsMdChange}
            onSetupScriptChange={onWorktreeSetupScriptChange}
            onCancel={onWorktreePromptCancel}
            onConfirm={onWorktreePromptConfirm}
          />
        </Suspense>
      )}
      {branchSwitcher && (
        <Suspense fallback={null}>
          <BranchSwitcherPrompt
            branches={branches}
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            currentBranch={currentBranch}
            onSelect={onBranchSwitcherSelect}
            onCancel={onBranchSwitcherCancel}
          />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsViewComponent
            {...settingsProps}
            onClose={onCloseSettings}
            initialSection={settingsSection ?? undefined}
          />
        </Suspense>
      )}
    </>
  );
});
