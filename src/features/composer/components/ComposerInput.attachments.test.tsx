/** @vitest-environment jsdom */
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useComposerImages } from "../hooks/useComposerImages";
import { ComposerInput } from "./ComposerInput";

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
}));

type HarnessProps = {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
  disabled?: boolean;
};

function ComposerHarness({
  activeThreadId,
  activeWorkspaceId,
  disabled = false,
}: HarnessProps) {
  const { activeImages, attachImages, removeImage, clearActiveImages } =
    useComposerImages({ activeThreadId, activeWorkspaceId });
  const [text, setText] = useState("");
  const [, setSelectionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div>
      <ComposerInput
        text={text}
        disabled={disabled}
        sendLabel="Send"
        canStop={false}
        canSend={false}
        isProcessing={false}
        onStop={() => {}}
        onSend={() => {}}
        attachments={activeImages}
        onAddAttachment={() => {}}
        onAttachImages={attachImages}
        onRemoveAttachment={removeImage}
        onTextChange={(next, nextSelection) => {
          setText(next);
          setSelectionStart(nextSelection);
        }}
        onSelectionChange={setSelectionStart}
        onKeyDown={() => {}}
        textareaRef={textareaRef}
        suggestionsOpen={false}
        suggestions={[]}
        highlightIndex={0}
        onHighlightIndex={() => {}}
        onSelectSuggestion={() => {}}
      />
      <button
        type="button"
        data-testid="clear-images"
        onClick={clearActiveImages}
      >
        Clear
      </button>
    </div>
  );
}

type RenderedHarness = {
  container: HTMLDivElement;
  rerender: (next: HarnessProps) => void;
  unmount: () => void;
};

function renderComposerHarness(initial: HarnessProps): RenderedHarness {
  let props = initial;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ComposerHarness {...props} />);
  });

  return {
    container,
    rerender: (next) => {
      props = next;
      act(() => {
        root.render(<ComposerHarness {...props} />);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function getAttachmentNames(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll(".composer-attachment-name"),
  ).map((node) => node.textContent ?? "");
}

function getTextarea(container: HTMLElement) {
  const textarea = container.querySelector("textarea");
  if (!textarea) {
    throw new Error("Textarea not found");
  }
  return textarea;
}

function dispatchDrop(
  element: HTMLElement,
  files: File[],
  items: Array<{ kind: string; getAsFile: () => File | null }> = [],
) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files,
      items,
    },
  });
  element.dispatchEvent(event);
}

function dispatchPaste(
  element: HTMLElement,
  items: Array<{ type: string; getAsFile: () => File | null }>,
) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      items,
    },
  });
  element.dispatchEvent(event);
}

function setMockFileReader() {
  const OriginalFileReader = window.FileReader;
  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;
    onerror: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;

    readAsDataURL(file: File) {
      this.result = `data:${file.type};base64,MOCK`;
      this.onload?.({} as ProgressEvent<FileReader>);
    }
  }
  window.FileReader = MockFileReader as typeof FileReader;
  return () => {
    window.FileReader = OriginalFileReader;
  };
}

describe("Composer attachments integration", () => {
  it("does not render the add-image button when uploads are disabled", () => {
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    expect(harness.container.querySelector(".composer-attach")).toBeNull();

    harness.unmount();
  });

  it("ignores dropped image files while uploads are disabled", async () => {
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const image = new File(["data"], "photo.png", { type: "image/png" });
    (image as File & { path?: string }).path = "/tmp/photo.png";

    await act(async () => {
      dispatchDrop(textarea, [image]);
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.unmount();
  });

  it("ignores pasted images while uploads are disabled", async () => {
    const restoreFileReader = setMockFileReader();
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const image = new File(["data"], "paste.png", { type: "image/png" });
    const imageItem = { type: "image/png", getAsFile: () => image };
    const textItem = { type: "text/plain", getAsFile: () => null };

    await act(async () => {
      dispatchPaste(textarea, [textItem, imageItem]);
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.unmount();
    restoreFileReader();
  });

  it("keeps attachment state empty across draft operations while disabled", async () => {
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const first = new File(["data"], "first.png", { type: "image/png" });
    (first as File & { path?: string }).path = "/tmp/first.png";
    const second = new File(["data"], "second.png", { type: "image/png" });
    (second as File & { path?: string }).path = "/tmp/second.png";

    await act(async () => {
      dispatchDrop(textarea, [first, second]);
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    const removeButtons = harness.container.querySelectorAll(
      ".composer-attachment-remove",
    );
    expect(removeButtons.length).toBe(0);

    const clearButton = harness.container.querySelector(
      "[data-testid='clear-images']",
    );
    if (!clearButton) {
      throw new Error("Clear button missing");
    }

    act(() => {
      (clearButton as HTMLButtonElement).click();
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.unmount();
  });

  it("keeps disabled attachment state empty when switching threads", async () => {
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const threadOneImage = new File(["data"], "thread-one.png", {
      type: "image/png",
    });
    (threadOneImage as File & { path?: string }).path = "/tmp/thread-one.png";

    await act(async () => {
      dispatchDrop(textarea, [threadOneImage]);
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.rerender({
      activeThreadId: "thread-2",
      activeWorkspaceId: "ws-1",
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    const threadTwoImage = new File(["data"], "thread-two.png", {
      type: "image/png",
    });
    (threadTwoImage as File & { path?: string }).path = "/tmp/thread-two.png";

    await act(async () => {
      dispatchDrop(getTextarea(harness.container), [threadTwoImage]);
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.rerender({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.unmount();
  });

  it("keeps disabled attachment state empty when switching workspaces", async () => {
    const harness = renderComposerHarness({
      activeThreadId: null,
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const draftImage = new File(["data"], "draft-one.png", {
      type: "image/png",
    });
    (draftImage as File & { path?: string }).path = "/tmp/draft-one.png";

    await act(async () => {
      dispatchDrop(textarea, [draftImage]);
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.rerender({
      activeThreadId: null,
      activeWorkspaceId: "ws-2",
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.rerender({
      activeThreadId: null,
      activeWorkspaceId: "ws-1",
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.unmount();
  });
});
