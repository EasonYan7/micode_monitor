// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TurnPlan } from "../../../types";
import { useThreadEventHandlers } from "./useThreadEventHandlers";

function makeOptions(overrides?: Partial<Parameters<typeof useThreadEventHandlers>[0]>) {
  return {
    activeThreadId: "thread-1",
    dispatch: vi.fn(),
    itemsByThread: {},
    planByThreadRef: { current: {} as Record<string, TurnPlan | null> },
    getCustomName: vi.fn(),
    isThreadHidden: vi.fn(() => false),
    markProcessing: vi.fn(),
    markReviewing: vi.fn(),
    setActiveTurnId: vi.fn(),
    safeMessageActivity: vi.fn(),
    recordThreadActivity: vi.fn(),
    pushThreadErrorMessage: vi.fn(),
    onDebug: vi.fn(),
    onWorkspaceConnected: vi.fn(),
    applyCollabThreadLinks: vi.fn(),
    onReviewExited: vi.fn(),
    approvalAllowlistRef: { current: {} as Record<string, string[][]> },
    pendingInterruptsRef: { current: new Set<string>() },
    ...overrides,
  };
}

describe("useThreadEventHandlers debug stream logging", () => {
  it("aggregates agent deltas into a single debug entry id", () => {
    const onDebug = vi.fn();
    const { result } = renderHook(() =>
      useThreadEventHandlers(
        makeOptions({
          onDebug,
        }),
      ),
    );

    act(() => {
      result.current.onAppServerEvent({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-1",
            itemId: "assistant-1",
            delta: "Hello ",
          },
        },
      });
      result.current.onAppServerEvent({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-1",
            itemId: "assistant-1",
            delta: "world",
          },
        },
      });
    });

    expect(onDebug).toHaveBeenCalledTimes(2);
    const first = onDebug.mock.calls[0]?.[0];
    const second = onDebug.mock.calls[1]?.[0];
    expect(first.id).toBe("stream:ws-1:thread-1:assistant-1");
    expect(first.label).toBe("item/agentMessage/stream");
    expect(second.id).toBe("stream:ws-1:thread-1:assistant-1");
    expect(second.label).toBe("item/agentMessage/stream");
    expect(second.payload).toMatchObject({
      threadId: "thread-1",
      itemId: "assistant-1",
      chunkCount: 2,
      text: "Hello world",
    });
  });

  it("emits one final debug entry when the assistant message completes", () => {
    const onDebug = vi.fn();
    const { result } = renderHook(() =>
      useThreadEventHandlers(
        makeOptions({
          onDebug,
        }),
      ),
    );

    act(() => {
      result.current.onAppServerEvent({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-1",
            itemId: "assistant-1",
            delta: "Hello ",
          },
        },
      });
      result.current.onAppServerEvent({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: {
              id: "assistant-1",
              type: "agentMessage",
              text: "world!",
            },
          },
        },
      });
    });

    expect(onDebug).toHaveBeenCalledTimes(2);
    const final = onDebug.mock.calls[1]?.[0];
    expect(final.id).toBe("stream:ws-1:thread-1:assistant-1");
    expect(final.label).toBe("item/agentMessage/final");
    expect(final.payload).toMatchObject({
      threadId: "thread-1",
      itemId: "assistant-1",
      chunkCount: 1,
      text: "Hello world!",
    });
  });
});
