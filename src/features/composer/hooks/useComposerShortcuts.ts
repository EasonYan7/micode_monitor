import { useEffect } from "react";
import type { AccessMode } from "../../../types";
import { pushErrorToast } from "../../../services/toasts";
import { matchesShortcut, parseShortcut } from "../../../utils/shortcuts";

type ModelOption = { id: string; displayName: string; model: string };

type UseComposerShortcutsOptions = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  modelShortcut: string | null;
  accessShortcut: string | null;
  reasoningShortcut: string | null;
  collaborationShortcut: string | null;
  models: ModelOption[];
  collaborationModes: { id: string; label: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  accessMode: AccessMode;
  onSelectAccessMode: (mode: AccessMode) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  reasoningSupported: boolean;
};

const ACCESS_ORDER: AccessMode[] = ["read-only", "current", "full-access"];

function requiresComposerFocus(shortcut: string | null) {
  const parsed = parseShortcut(shortcut);
  if (!parsed) {
    return false;
  }
  return parsed.key === "tab" && !parsed.meta && !parsed.ctrl && !parsed.alt;
}

export function useComposerShortcuts({
  textareaRef,
  modelShortcut,
  accessShortcut,
  reasoningShortcut,
  collaborationShortcut,
  models,
  collaborationModes,
  selectedModelId,
  onSelectModel,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  accessMode,
  onSelectAccessMode,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  reasoningSupported,
}: UseComposerShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      const composerFocused = document.activeElement === textareaRef.current;
      if (matchesShortcut(event, modelShortcut)) {
        if (!composerFocused && requiresComposerFocus(modelShortcut)) {
          return;
        }
        event.preventDefault();
        if (models.length === 0) {
          pushErrorToast({
            title: "Composer action unavailable",
            message: "No models are available for the current workspace.",
          });
          return;
        }
        const currentIndex = models.findIndex((model) => model.id === selectedModelId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % models.length : 0;
        const nextModel = models[nextIndex];
        if (nextModel) {
          onSelectModel(nextModel.id);
        }
        return;
      }
      if (matchesShortcut(event, accessShortcut)) {
        if (!composerFocused && requiresComposerFocus(accessShortcut)) {
          return;
        }
        event.preventDefault();
        const currentIndex = ACCESS_ORDER.indexOf(accessMode);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % ACCESS_ORDER.length : 0;
        const nextAccess = ACCESS_ORDER[nextIndex];
        if (nextAccess) {
          onSelectAccessMode(nextAccess);
        }
        return;
      }
      if (matchesShortcut(event, reasoningShortcut)) {
        if (!composerFocused && requiresComposerFocus(reasoningShortcut)) {
          return;
        }
        event.preventDefault();
        if (!reasoningSupported || reasoningOptions.length === 0) {
          pushErrorToast({
            title: "Composer action unavailable",
            message: "Reasoning mode is not available for the current model.",
          });
          return;
        }
        const currentIndex = reasoningOptions.indexOf(selectedEffort ?? "");
        const nextIndex =
          currentIndex >= 0 ? (currentIndex + 1) % reasoningOptions.length : 0;
        const nextEffort = reasoningOptions[nextIndex];
        if (nextEffort) {
          onSelectEffort(nextEffort);
        }
        return;
      }
      if (
        collaborationModes.length > 0 &&
        matchesShortcut(event, collaborationShortcut)
      ) {
        if (!composerFocused && requiresComposerFocus(collaborationShortcut)) {
          return;
        }
        event.preventDefault();
        const currentIndex = collaborationModes.findIndex(
          (mode) => mode.id === selectedCollaborationModeId,
        );
        const nextIndex =
          currentIndex >= 0
            ? (currentIndex + 1) % collaborationModes.length
            : 0;
        const nextMode = collaborationModes[nextIndex];
        if (nextMode) {
          onSelectCollaborationMode(nextMode.id);
        }
      } else if (matchesShortcut(event, collaborationShortcut)) {
        if (!composerFocused && requiresComposerFocus(collaborationShortcut)) {
          return;
        }
        event.preventDefault();
        pushErrorToast({
          title: "Composer action unavailable",
          message: "No collaboration modes are available.",
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    accessMode,
    accessShortcut,
    collaborationModes,
    collaborationShortcut,
    modelShortcut,
    models,
    onSelectCollaborationMode,
    onSelectAccessMode,
    onSelectEffort,
    onSelectModel,
    reasoningOptions,
    reasoningShortcut,
    reasoningSupported,
    selectedCollaborationModeId,
    selectedEffort,
    selectedModelId,
    textareaRef,
  ]);
}
