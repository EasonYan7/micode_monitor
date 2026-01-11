import { useCallback, useMemo, useReducer } from "react";
import type {
  ApprovalRequest,
  ConversationItem,
  DebugEntry,
  ThreadSummary,
  WorkspaceInfo,
} from "../types";
import {
  respondToServerRequest,
  sendUserMessage as sendUserMessageService,
  startThread as startThreadService,
} from "../services/tauri";
import { useAppServerEvents } from "./useAppServerEvents";

const emptyItems: Record<string, ConversationItem[]> = {};

type ThreadState = {
  activeThreadIdByWorkspace: Record<string, string | null>;
  itemsByThread: Record<string, ConversationItem[]>;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadStatusById: Record<string, { isProcessing: boolean; hasUnread: boolean }>;
  approvals: ApprovalRequest[];
};

type ThreadAction =
  | { type: "setActiveThreadId"; workspaceId: string; threadId: string | null }
  | { type: "ensureThread"; workspaceId: string; threadId: string }
  | { type: "removeThread"; workspaceId: string; threadId: string }
  | { type: "markProcessing"; threadId: string; isProcessing: boolean }
  | { type: "markUnread"; threadId: string; hasUnread: boolean }
  | { type: "addUserMessage"; threadId: string; text: string }
  | { type: "appendAgentDelta"; threadId: string; itemId: string; delta: string }
  | { type: "completeAgentMessage"; threadId: string; itemId: string; text: string }
  | { type: "upsertItem"; threadId: string; item: ConversationItem }
  | {
      type: "appendReasoningSummary";
      threadId: string;
      itemId: string;
      delta: string;
    }
  | { type: "appendReasoningContent"; threadId: string; itemId: string; delta: string }
  | { type: "appendToolOutput"; threadId: string; itemId: string; delta: string }
  | { type: "addApproval"; approval: ApprovalRequest }
  | { type: "removeApproval"; requestId: number };

const initialState: ThreadState = {
  activeThreadIdByWorkspace: {},
  itemsByThread: emptyItems,
  threadsByWorkspace: {},
  threadStatusById: {},
  approvals: [],
};

function upsertItem(list: ConversationItem[], item: ConversationItem) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) {
    return [...list, item];
  }
  const next = [...list];
  next[index] = { ...next[index], ...item };
  return next;
}

function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case "setActiveThreadId":
      return {
        ...state,
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: action.threadId,
        },
        threadStatusById: action.threadId
          ? {
              ...state.threadStatusById,
              [action.threadId]: {
                isProcessing:
                  state.threadStatusById[action.threadId]?.isProcessing ?? false,
                hasUnread: false,
              },
            }
          : state.threadStatusById,
      };
    case "ensureThread": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      if (list.some((thread) => thread.id === action.threadId)) {
        return state;
      }
      const thread: ThreadSummary = {
        id: action.threadId,
        name: `Agent ${list.length + 1}`,
      };
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: [...list, thread],
        },
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: { isProcessing: false, hasUnread: false },
        },
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]:
            state.activeThreadIdByWorkspace[action.workspaceId] ?? action.threadId,
        },
      };
    }
    case "removeThread": {
      const list = state.threadsByWorkspace[action.workspaceId] ?? [];
      const filtered = list.filter((thread) => thread.id !== action.threadId);
      const nextActive =
        state.activeThreadIdByWorkspace[action.workspaceId] === action.threadId
          ? filtered[0]?.id ?? null
          : state.activeThreadIdByWorkspace[action.workspaceId] ?? null;
      const { [action.threadId]: _, ...restItems } = state.itemsByThread;
      const { [action.threadId]: __, ...restStatus } = state.threadStatusById;
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: filtered,
        },
        itemsByThread: restItems,
        threadStatusById: restStatus,
        activeThreadIdByWorkspace: {
          ...state.activeThreadIdByWorkspace,
          [action.workspaceId]: nextActive,
        },
      };
    }
    case "markProcessing":
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: {
            isProcessing: action.isProcessing,
            hasUnread: state.threadStatusById[action.threadId]?.hasUnread ?? false,
          },
        },
      };
    case "markUnread":
      return {
        ...state,
        threadStatusById: {
          ...state.threadStatusById,
          [action.threadId]: {
            isProcessing:
              state.threadStatusById[action.threadId]?.isProcessing ?? false,
            hasUnread: action.hasUnread,
          },
        },
      };
    case "addUserMessage": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const message: ConversationItem = {
        id: `${Date.now()}-user`,
        kind: "message",
        role: "user",
        text: action.text,
      };
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: [...list, message],
        },
      };
    }
    case "appendAgentDelta": {
      const list = [...(state.itemsByThread[action.threadId] ?? [])];
      const index = list.findIndex((msg) => msg.id === action.itemId);
      if (index >= 0 && list[index].kind === "message") {
        const existing = list[index] as ConversationItem;
        list[index] = {
          ...existing,
          text: `${existing.text}${action.delta}`,
        } as ConversationItem;
      } else {
        list.push({
          id: action.itemId,
          kind: "message",
          role: "assistant",
          text: action.delta,
        });
      }
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: list },
      };
    }
    case "completeAgentMessage": {
      const list = [...(state.itemsByThread[action.threadId] ?? [])];
      const index = list.findIndex((msg) => msg.id === action.itemId);
      if (index >= 0 && list[index].kind === "message") {
        const existing = list[index] as ConversationItem;
        list[index] = {
          ...existing,
          text: action.text || existing.text,
        } as ConversationItem;
      } else {
        list.push({
          id: action.itemId,
          kind: "message",
          role: "assistant",
          text: action.text,
        });
      }
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: list },
      };
    }
    case "upsertItem": {
      const list = state.itemsByThread[action.threadId] ?? [];
      return {
        ...state,
        itemsByThread: {
          ...state.itemsByThread,
          [action.threadId]: upsertItem(list, action.item),
        },
      };
    }
    case "appendReasoningSummary": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const index = list.findIndex((entry) => entry.id === action.itemId);
      const base =
        index >= 0 && list[index].kind === "reasoning"
          ? (list[index] as ConversationItem)
          : {
              id: action.itemId,
              kind: "reasoning",
              summary: "",
              content: "",
            };
      const updated: ConversationItem = {
        ...base,
        summary: `${"summary" in base ? base.summary : ""}${action.delta}`,
      } as ConversationItem;
      const next = index >= 0 ? [...list] : [...list, updated];
      if (index >= 0) {
        next[index] = updated;
      }
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: next },
      };
    }
    case "appendReasoningContent": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const index = list.findIndex((entry) => entry.id === action.itemId);
      const base =
        index >= 0 && list[index].kind === "reasoning"
          ? (list[index] as ConversationItem)
          : {
              id: action.itemId,
              kind: "reasoning",
              summary: "",
              content: "",
            };
      const updated: ConversationItem = {
        ...base,
        content: `${"content" in base ? base.content : ""}${action.delta}`,
      } as ConversationItem;
      const next = index >= 0 ? [...list] : [...list, updated];
      if (index >= 0) {
        next[index] = updated;
      }
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: next },
      };
    }
    case "appendToolOutput": {
      const list = state.itemsByThread[action.threadId] ?? [];
      const index = list.findIndex((entry) => entry.id === action.itemId);
      if (index < 0 || list[index].kind !== "tool") {
        return state;
      }
      const existing = list[index] as ConversationItem;
      const updated: ConversationItem = {
        ...existing,
        output: `${existing.output ?? ""}${action.delta}`,
      } as ConversationItem;
      const next = [...list];
      next[index] = updated;
      return {
        ...state,
        itemsByThread: { ...state.itemsByThread, [action.threadId]: next },
      };
    }
    case "addApproval":
      return { ...state, approvals: [...state.approvals, action.approval] };
    case "removeApproval":
      return {
        ...state,
        approvals: state.approvals.filter(
          (item) => item.request_id !== action.requestId,
        ),
      };
    default:
      return state;
  }
}

type UseThreadsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onWorkspaceConnected: (id: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  model?: string | null;
  effort?: string | null;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function buildConversationItem(item: Record<string, unknown>): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!id || !type) {
    return null;
  }
  if (type === "agentMessage" || type === "userMessage") {
    return null;
  }
  if (type === "reasoning") {
    const summary = asString(item.summary ?? "");
    const content = Array.isArray(item.content)
      ? item.content.map((entry) => asString(entry)).join("\n")
      : asString(item.content ?? "");
    return { id, kind: "reasoning", summary, content };
  }
  if (type === "commandExecution") {
    const command = Array.isArray(item.command)
      ? item.command.map((part) => asString(part)).join(" ")
      : asString(item.command ?? "");
    return {
      id,
      kind: "tool",
      toolType: type,
      title: command ? `Command: ${command}` : "Command",
      detail: asString(item.cwd ?? ""),
      status: asString(item.status ?? ""),
      output: asString(item.aggregatedOutput ?? ""),
    };
  }
  if (type === "fileChange") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const paths = changes
      .map((change) => asString(change?.path ?? ""))
      .filter(Boolean)
      .join(", ");
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "File changes",
      detail: paths || "Pending changes",
      status: asString(item.status ?? ""),
      output: "",
    };
  }
  if (type === "mcpToolCall") {
    const server = asString(item.server ?? "");
    const tool = asString(item.tool ?? "");
    const args = item.arguments ? JSON.stringify(item.arguments, null, 2) : "";
    return {
      id,
      kind: "tool",
      toolType: type,
      title: `Tool: ${server}${tool ? ` / ${tool}` : ""}`,
      detail: args,
      status: asString(item.status ?? ""),
      output: asString(item.result ?? item.error ?? ""),
    };
  }
  if (type === "webSearch") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Web search",
      detail: asString(item.query ?? ""),
      status: "",
      output: "",
    };
  }
  if (type === "imageView") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Image view",
      detail: asString(item.path ?? ""),
      status: "",
      output: "",
    };
  }
  if (type === "enteredReviewMode" || type === "exitedReviewMode") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: type === "enteredReviewMode" ? "Review started" : "Review completed",
      detail: asString(item.review ?? ""),
      status: "",
      output: "",
    };
  }
  return null;
}

export function useThreads({
  activeWorkspace,
  onWorkspaceConnected,
  onDebug,
  model,
  effort,
}: UseThreadsOptions) {
  const [state, dispatch] = useReducer(threadReducer, initialState);

  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const activeThreadId = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return state.activeThreadIdByWorkspace[activeWorkspaceId] ?? null;
  }, [activeWorkspaceId, state.activeThreadIdByWorkspace]);

  const activeItems = useMemo(
    () => (activeThreadId ? state.itemsByThread[activeThreadId] ?? [] : []),
    [activeThreadId, state.itemsByThread],
  );

  const handleWorkspaceConnected = useCallback(
    (workspaceId: string) => {
      onWorkspaceConnected(workspaceId);
    },
    [onWorkspaceConnected],
  );

  const handlers = useMemo(
    () => ({
      onWorkspaceConnected: handleWorkspaceConnected,
      onApprovalRequest: (approval: ApprovalRequest) => {
        dispatch({ type: "addApproval", approval });
      },
      onAppServerEvent: (event) => {
        const method = String(event.message?.method ?? "");
        const inferredSource =
          method === "codex/stderr" ? "stderr" : "event";
        onDebug?.({
          id: `${Date.now()}-server-event`,
          timestamp: Date.now(),
          source: inferredSource,
          label: method || "event",
          payload: event,
        });
      },
      onAgentMessageDelta: ({
        workspaceId,
        threadId,
        itemId,
        delta,
      }: {
        workspaceId: string;
        threadId: string;
        itemId: string;
        delta: string;
      }) => {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        dispatch({ type: "appendAgentDelta", threadId, itemId, delta });
      },
      onAgentMessageCompleted: ({
        workspaceId,
        threadId,
        itemId,
        text,
      }: {
        workspaceId: string;
        threadId: string;
        itemId: string;
        text: string;
      }) => {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        dispatch({ type: "completeAgentMessage", threadId, itemId, text });
        dispatch({ type: "markProcessing", threadId, isProcessing: false });
        if (threadId !== activeThreadId) {
          dispatch({ type: "markUnread", threadId, hasUnread: true });
        }
      },
      onItemStarted: (workspaceId: string, threadId: string, item) => {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        const converted = buildConversationItem(item);
        if (converted) {
          dispatch({ type: "upsertItem", threadId, item: converted });
        }
      },
      onItemCompleted: (workspaceId: string, threadId: string, item) => {
        dispatch({ type: "ensureThread", workspaceId, threadId });
        const converted = buildConversationItem(item);
        if (converted) {
          dispatch({ type: "upsertItem", threadId, item: converted });
        }
      },
      onReasoningSummaryDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendReasoningSummary", threadId, itemId, delta });
      },
      onReasoningTextDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendReasoningContent", threadId, itemId, delta });
      },
      onCommandOutputDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendToolOutput", threadId, itemId, delta });
      },
      onFileChangeOutputDelta: (
        _workspaceId: string,
        threadId: string,
        itemId: string,
        delta: string,
      ) => {
        dispatch({ type: "appendToolOutput", threadId, itemId, delta });
      },
      onTurnStarted: (workspaceId: string, threadId: string) => {
        dispatch({
          type: "ensureThread",
          workspaceId,
          threadId,
        });
        dispatch({ type: "markProcessing", threadId, isProcessing: true });
      },
      onTurnCompleted: (_workspaceId: string, threadId: string) => {
        dispatch({ type: "markProcessing", threadId, isProcessing: false });
      },
    }),
    [activeThreadId, activeWorkspaceId, handleWorkspaceConnected, onDebug],
  );

  useAppServerEvents(handlers);

  const startThreadForWorkspace = useCallback(
    async (workspaceId: string) => {
      onDebug?.({
        id: `${Date.now()}-client-thread-start`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/start",
        payload: { workspaceId },
      });
      try {
        const response = await startThreadService(workspaceId);
        onDebug?.({
          id: `${Date.now()}-server-thread-start`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/start response",
          payload: response,
        });
        const thread = response.result?.thread ?? response.thread;
        const threadId = String(thread?.id ?? "");
        if (threadId) {
          dispatch({ type: "ensureThread", workspaceId, threadId });
          dispatch({ type: "setActiveThreadId", workspaceId, threadId });
          return threadId;
        }
        return null;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [onDebug],
  );

  const startThread = useCallback(async () => {
    if (!activeWorkspaceId) {
      return null;
    }
    return startThreadForWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId, startThreadForWorkspace]);

  const sendUserMessage = useCallback(
    async (text: string) => {
      if (!activeWorkspace || !text.trim()) {
        return;
      }
      let threadId = activeThreadId;
      if (!threadId) {
        threadId = await startThread();
        if (!threadId) {
          return;
        }
      }

      const messageText = text.trim();
      dispatch({ type: "addUserMessage", threadId, text: messageText });
      dispatch({ type: "markProcessing", threadId, isProcessing: true });
      onDebug?.({
        id: `${Date.now()}-client-turn-start`,
        timestamp: Date.now(),
        source: "client",
        label: "turn/start",
        payload: {
          workspaceId: activeWorkspace.id,
          threadId,
          text: messageText,
          model,
          effort,
        },
      });
      try {
        const response = await sendUserMessageService(
          activeWorkspace.id,
          threadId,
          messageText,
          { model, effort },
        );
        onDebug?.({
          id: `${Date.now()}-server-turn-start`,
          timestamp: Date.now(),
          source: "server",
          label: "turn/start response",
          payload: response,
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-turn-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "turn/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [activeWorkspace, activeThreadId, effort, model, onDebug, startThread],
  );

  const handleApprovalDecision = useCallback(
    async (request: ApprovalRequest, decision: "accept" | "decline") => {
      await respondToServerRequest(
        request.workspace_id,
        request.request_id,
        decision,
      );
      dispatch({ type: "removeApproval", requestId: request.request_id });
    },
    [],
  );

  const setActiveThreadId = useCallback(
    (threadId: string | null, workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      dispatch({ type: "setActiveThreadId", workspaceId: targetId, threadId });
    },
    [activeWorkspaceId],
  );

  const removeThread = useCallback((workspaceId: string, threadId: string) => {
    dispatch({ type: "removeThread", workspaceId, threadId });
  }, []);

  return {
    activeThreadId,
    setActiveThreadId,
    activeItems,
    approvals: state.approvals,
    threadsByWorkspace: state.threadsByWorkspace,
    threadStatusById: state.threadStatusById,
    removeThread,
    startThread,
    startThreadForWorkspace,
    sendUserMessage,
    handleApprovalDecision,
  };
}
