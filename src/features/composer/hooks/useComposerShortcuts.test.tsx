// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useComposerShortcuts } from "./useComposerShortcuts";

function ShortcutHarness(props: {
  accessShortcut?: string | null;
  accessMode?: "read-only" | "current" | "full-access";
  onSelectAccessMode?: (mode: "read-only" | "current" | "full-access") => void;
  collaborationShortcut: string | null;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useComposerShortcuts({
    textareaRef,
    modelShortcut: null,
    accessShortcut: props.accessShortcut ?? null,
    reasoningShortcut: null,
    collaborationShortcut: props.collaborationShortcut,
    models: [],
    collaborationModes: props.collaborationModes,
    selectedModelId: null,
    onSelectModel: () => {},
    selectedCollaborationModeId: props.selectedCollaborationModeId,
    onSelectCollaborationMode: props.onSelectCollaborationMode,
    accessMode: props.accessMode ?? "read-only",
    onSelectAccessMode: props.onSelectAccessMode ?? (() => {}),
    reasoningOptions: [],
    selectedEffort: null,
    onSelectEffort: () => {},
    reasoningSupported: false,
  });

  return <textarea ref={textareaRef} aria-label="prompt" />;
}

describe("useComposerShortcuts", () => {
  it("cycles collaboration mode on shift+tab while focused", () => {
    const onSelectCollaborationMode = vi.fn();
    const { getByLabelText } = render(
      <ShortcutHarness
        collaborationShortcut="shift+tab"
        collaborationModes={[
          { id: "default", label: "Default" },
          { id: "plan", label: "Plan" },
        ]}
        selectedCollaborationModeId="default"
        onSelectCollaborationMode={onSelectCollaborationMode}
      />,
    );

    const textarea = getByLabelText("prompt") as HTMLTextAreaElement;
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(onSelectCollaborationMode).toHaveBeenCalledWith("plan");
  });

  it("does nothing when textarea is not focused", () => {
    const onSelectCollaborationMode = vi.fn();
    render(
      <ShortcutHarness
        collaborationShortcut="shift+tab"
        collaborationModes={[
          { id: "default", label: "Default" },
          { id: "plan", label: "Plan" },
        ]}
        selectedCollaborationModeId="default"
        onSelectCollaborationMode={onSelectCollaborationMode}
      />,
    );

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(onSelectCollaborationMode).not.toHaveBeenCalled();
  });

  it("cycles access mode without textarea focus for ctrl+shift shortcuts", () => {
    const onSelectAccessMode = vi.fn();
    render(
      <ShortcutHarness
        accessShortcut="ctrl+shift+a"
        accessMode="read-only"
        onSelectAccessMode={onSelectAccessMode}
        collaborationShortcut="shift+tab"
        collaborationModes={[]}
        selectedCollaborationModeId={null}
        onSelectCollaborationMode={vi.fn()}
      />,
    );

    const event = new KeyboardEvent("keydown", {
      key: "A",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(onSelectAccessMode).toHaveBeenCalledWith("current");
  });
});
