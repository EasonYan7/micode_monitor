import { useCallback, useMemo, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type { AppServerEvent, DebugEntry, TurnPlan } from "../../../types";
import { getAppServerParams, getAppServerRawMethod } from "../../../utils/appServerEvents";
import { useThreadApprovalEvents } from "./useThreadApprovalEvents";
import { useThreadItemEvents } from "./useThreadItemEvents";
import { useThreadTurnEvents } from "./useThreadTurnEvents";
import { useThreadUserInputEvents } from "./useThreadUserInputEvents";
import type { ThreadAction } from "./useThreadsReducer";

type ThreadEventHandlersOptions = {
  activeThreadId: string | null;
  dispatch: Dispatch<ThreadAction>;
  itemsByThread: Record<string, { kind: string; status?: string }[]>;
  planByThreadRef: MutableRefObject<Record<string, TurnPlan | null>>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  isThreadHidden: (workspaceId: string, threadId: string) => boolean;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
  safeMessageActivity: () => void;
  recordThreadActivity: (
    workspaceId: string,
    threadId: string,
    timestamp?: number,
  ) => void;
  pushThreadErrorMessage: (threadId: string, message: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  onWorkspaceConnected: (workspaceId: string) => void;
  applyCollabThreadLinks: (
    threadId: string,
    item: Record<string, unknown>,
  ) => void;
  onReviewExited?: (workspaceId: string, threadId: string) => void;
  approvalAllowlistRef: MutableRefObject<Record<string, string[][]>>;
  pendingInterruptsRef: MutableRefObject<Set<string>>;
};

const DEBUG_MAX_STRING_LENGTH = 1200;
const DEBUG_MAX_ARRAY_ITEMS = 32;

type StreamedAssistantDebugEntry = {
  text: string;
  chunkCount: number;
};

function buildAssistantStreamDebugId(workspaceId: string, threadId: string, itemId: string) {
  return `stream:${workspaceId}:${threadId}:${itemId}`;
}

function buildAssistantStreamDebugKey(workspaceId: string, threadId: string, itemId: string) {
  return `${workspaceId}:${threadId}:${itemId}`;
}

function mergeStreamingDebugText(existing: string, delta: string) {
  if (!delta) {
    return existing;
  }
  if (!existing) {
    return delta;
  }
  if (delta === existing) {
    return existing;
  }
  if (delta.startsWith(existing)) {
    return delta;
  }
  if (existing.startsWith(delta)) {
    return existing;
  }
  const maxOverlap = Math.min(existing.length, delta.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (existing.endsWith(delta.slice(0, length))) {
      return `${existing}${delta.slice(length)}`;
    }
  }
  return `${existing}${delta}`;
}

function truncateDebugString(value: string) {
  if (value.length <= DEBUG_MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, DEBUG_MAX_STRING_LENGTH)}... [truncated ${value.length - DEBUG_MAX_STRING_LENGTH} chars]`;
}

function sanitizeDebugEvent(event: AppServerEvent): AppServerEvent {
  const method = getAppServerRawMethod(event);
  if (!method) {
    return event;
  }
  const message = event.message ?? {};
  const params =
    message && typeof message === "object" && !Array.isArray(message)
      ? ((message as Record<string, unknown>).params as Record<string, unknown> | undefined)
      : undefined;
  if (!params || (method !== "item/started" && method !== "item/completed")) {
    return event;
  }
  const item =
    params.item && typeof params.item === "object" && !Array.isArray(params.item)
      ? (params.item as Record<string, unknown>)
      : null;
  if (!item) {
    return event;
  }
  const nextItem: Record<string, unknown> = { ...item };
  const result = nextItem.result;
  if (typeof result === "string") {
    nextItem.result = truncateDebugString(result);
  }
  const error = nextItem.error;
  if (typeof error === "string") {
    nextItem.error = truncateDebugString(error);
  }
  const args = nextItem.arguments;
  if (Array.isArray(args) && args.length > DEBUG_MAX_ARRAY_ITEMS) {
    nextItem.arguments = [
      ...args.slice(0, DEBUG_MAX_ARRAY_ITEMS),
      `... [truncated ${args.length - DEBUG_MAX_ARRAY_ITEMS} items]`,
    ];
  }
  const nextParams: Record<string, unknown> = { ...params, item: nextItem };
  const nextMessage: Record<string, unknown> = {
    ...(message as Record<string, unknown>),
    params: nextParams,
  };
  return {
    ...event,
    message: nextMessage,
  };
}

export function useThreadEventHandlers({
  activeThreadId,
  dispatch,
  itemsByThread,
  planByThreadRef,
  getCustomName,
  isThreadHidden,
  markProcessing,
  markReviewing,
  setActiveTurnId,
  safeMessageActivity,
  recordThreadActivity,
  pushThreadErrorMessage,
  onDebug,
  onWorkspaceConnected,
  applyCollabThreadLinks,
  onReviewExited,
  approvalAllowlistRef,
  pendingInterruptsRef,
}: ThreadEventHandlersOptions) {
  const assistantStreamDebugRef = useRef<Record<string, StreamedAssistantDebugEntry>>({});
  const onApprovalRequest = useThreadApprovalEvents({
    dispatch,
    approvalAllowlistRef,
  });
  const onRequestUserInput = useThreadUserInputEvents({ dispatch });

  const {
    onAgentMessageDelta,
    onAgentMessageCompleted,
    onItemStarted,
    onItemCompleted,
    onReasoningSummaryDelta,
    onReasoningSummaryBoundary,
    onReasoningTextDelta,
    onPlanDelta,
    onCommandOutputDelta,
    onTerminalInteraction,
    onFileChangeOutputDelta,
  } = useThreadItemEvents({
    activeThreadId,
    dispatch,
    getCustomName,
    markProcessing,
    markReviewing,
    safeMessageActivity,
    recordThreadActivity,
    applyCollabThreadLinks,
    onReviewExited,
  });

  const {
    onThreadStarted,
    onThreadNameUpdated,
    onTurnStarted,
    onTurnCompleted,
    onTurnPlanUpdated,
    onThreadTokenUsageUpdated,
    onAccountRateLimitsUpdated,
    onTurnError,
  } = useThreadTurnEvents({
    dispatch,
    itemsByThread,
    planByThreadRef,
    getCustomName,
    isThreadHidden,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    pendingInterruptsRef,
    pushThreadErrorMessage,
    safeMessageActivity,
    recordThreadActivity,
  });

  const onBackgroundThreadAction = useCallback(
    (workspaceId: string, threadId: string, action: string) => {
      if (action !== "hide") {
        return;
      }
      dispatch({ type: "hideThread", workspaceId, threadId });
    },
    [dispatch],
  );

  const onAppServerEvent = useCallback(
    (event: AppServerEvent) => {
      const sanitizedEvent = sanitizeDebugEvent(event);
      const method = getAppServerRawMethod(sanitizedEvent) ?? "";
      const inferredSource = method === "micode/stderr" ? "stderr" : "event";
      const params = getAppServerParams(sanitizedEvent);
      const threadId = String(params.threadId ?? params.thread_id ?? "");
      const itemId = String(params.itemId ?? params.item_id ?? "");

      if (method === "item/agentMessage/delta") {
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          const streamKey = buildAssistantStreamDebugKey(
            sanitizedEvent.workspace_id,
            threadId,
            itemId,
          );
          const previous = assistantStreamDebugRef.current[streamKey] ?? {
            text: "",
            chunkCount: 0,
          };
          const nextText = mergeStreamingDebugText(previous.text, delta);
          const nextChunkCount = previous.chunkCount + 1;
          assistantStreamDebugRef.current[streamKey] = {
            text: nextText,
            chunkCount: nextChunkCount,
          };
          onDebug?.({
            id: buildAssistantStreamDebugId(sanitizedEvent.workspace_id, threadId, itemId),
            timestamp: Date.now(),
            source: inferredSource,
            label: "item/agentMessage/stream",
            payload: {
              workspaceId: sanitizedEvent.workspace_id,
              threadId,
              itemId,
              chunkCount: nextChunkCount,
              text: truncateDebugString(nextText),
            },
          });
          return;
        }
      }

      if (method === "item/completed") {
        const item =
          params.item && typeof params.item === "object" && !Array.isArray(params.item)
            ? (params.item as Record<string, unknown>)
            : null;
        const completedType = String(item?.type ?? "");
        const completedItemId = String(item?.id ?? itemId);
        if (threadId && completedItemId && completedType === "agentMessage") {
          const streamKey = buildAssistantStreamDebugKey(
            sanitizedEvent.workspace_id,
            threadId,
            completedItemId,
          );
          const streamed = assistantStreamDebugRef.current[streamKey] ?? null;
          const completedText = String(item?.text ?? "");
          const mergedText = streamed
            ? mergeStreamingDebugText(streamed.text, completedText)
            : completedText;
          delete assistantStreamDebugRef.current[streamKey];
          onDebug?.({
            id: buildAssistantStreamDebugId(
              sanitizedEvent.workspace_id,
              threadId,
              completedItemId,
            ),
            timestamp: Date.now(),
            source: inferredSource,
            label: "item/agentMessage/final",
            payload: {
              workspaceId: sanitizedEvent.workspace_id,
              threadId,
              itemId: completedItemId,
              chunkCount: streamed?.chunkCount ?? 0,
              text: truncateDebugString(mergedText),
            },
          });
          return;
        }
      }

      onDebug?.({
        id: `${Date.now()}-server-event`,
        timestamp: Date.now(),
        source: inferredSource,
        label: method || "event",
        payload: sanitizedEvent,
      });
    },
    [onDebug],
  );

  const handlers = useMemo(
    () => ({
      onWorkspaceConnected,
      onApprovalRequest,
      onRequestUserInput,
      onBackgroundThreadAction,
      onAppServerEvent,
      onAgentMessageDelta,
      onAgentMessageCompleted,
      onItemStarted,
      onItemCompleted,
      onReasoningSummaryDelta,
      onReasoningSummaryBoundary,
      onReasoningTextDelta,
      onPlanDelta,
      onCommandOutputDelta,
      onTerminalInteraction,
      onFileChangeOutputDelta,
      onThreadStarted,
      onThreadNameUpdated,
      onTurnStarted,
      onTurnCompleted,
      onTurnPlanUpdated,
      onThreadTokenUsageUpdated,
      onAccountRateLimitsUpdated,
      onTurnError,
    }),
    [
      onWorkspaceConnected,
      onApprovalRequest,
      onRequestUserInput,
      onBackgroundThreadAction,
      onAppServerEvent,
      onAgentMessageDelta,
      onAgentMessageCompleted,
      onItemStarted,
      onItemCompleted,
      onReasoningSummaryDelta,
      onReasoningSummaryBoundary,
      onReasoningTextDelta,
      onPlanDelta,
      onCommandOutputDelta,
      onTerminalInteraction,
      onFileChangeOutputDelta,
      onThreadStarted,
      onThreadNameUpdated,
      onTurnStarted,
      onTurnCompleted,
      onTurnPlanUpdated,
      onThreadTokenUsageUpdated,
      onAccountRateLimitsUpdated,
      onTurnError,
    ],
  );

  return handlers;
}
