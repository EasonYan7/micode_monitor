import { useCallback, useMemo, useReducer } from "react";
import type {
  ApprovalRequest,
  DebugEntry,
  Message,
  ThreadSummary,
  WorkspaceInfo,
} from "../types";
import {
  respondToServerRequest,
  sendUserMessage as sendUserMessageService,
  startThread as startThreadService,
} from "../services/tauri";
import { useAppServerEvents } from "./useAppServerEvents";

const emptyMessages: Record<string, Message[]> = {};

type ThreadState = {
  activeThreadIdByWorkspace: Record<string, string | null>;
  messagesByThread: Record<string, Message[]>;
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
  | { type: "addUserMessage"; threadId: string; message: Message }
  | { type: "appendAgentDelta"; threadId: string; itemId: string; delta: string }
  | { type: "completeAgentMessage"; threadId: string; itemId: string; text: string }
  | { type: "addApproval"; approval: ApprovalRequest }
  | { type: "removeApproval"; requestId: number };

const initialState: ThreadState = {
  activeThreadIdByWorkspace: {},
  messagesByThread: emptyMessages,
  threadsByWorkspace: {},
  threadStatusById: {},
  approvals: [],
};

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
      const { [action.threadId]: _, ...restMessages } = state.messagesByThread;
      const { [action.threadId]: __, ...restStatus } = state.threadStatusById;
      return {
        ...state,
        threadsByWorkspace: {
          ...state.threadsByWorkspace,
          [action.workspaceId]: filtered,
        },
        messagesByThread: restMessages,
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
      const list = state.messagesByThread[action.threadId] ?? [];
      return {
        ...state,
        messagesByThread: {
          ...state.messagesByThread,
          [action.threadId]: [...list, action.message],
        },
      };
    }
    case "appendAgentDelta": {
      const list = [...(state.messagesByThread[action.threadId] ?? [])];
      const existing = list.find((msg) => msg.id === action.itemId);
      if (existing) {
        existing.text += action.delta;
      } else {
        list.push({ id: action.itemId, role: "assistant", text: action.delta });
      }
      return {
        ...state,
        messagesByThread: { ...state.messagesByThread, [action.threadId]: list },
      };
    }
    case "completeAgentMessage": {
      const list = [...(state.messagesByThread[action.threadId] ?? [])];
      const existing = list.find((msg) => msg.id === action.itemId);
      if (existing) {
        existing.text = action.text || existing.text;
      } else {
        list.push({ id: action.itemId, role: "assistant", text: action.text });
      }
      return {
        ...state,
        messagesByThread: { ...state.messagesByThread, [action.threadId]: list },
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

  const activeMessages = useMemo(
    () => (activeThreadId ? state.messagesByThread[activeThreadId] ?? [] : []),
    [activeThreadId, state.messagesByThread],
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
        if (threadId !== activeThreadId) {
          dispatch({ type: "markUnread", threadId, hasUnread: true });
        }
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

      const message: Message = {
        id: `${Date.now()}-user`,
        role: "user",
        text: text.trim(),
      };
      dispatch({ type: "addUserMessage", threadId, message });
      onDebug?.({
        id: `${Date.now()}-client-turn-start`,
        timestamp: Date.now(),
        source: "client",
        label: "turn/start",
        payload: {
          workspaceId: activeWorkspace.id,
          threadId,
          text: message.text,
          model,
          effort,
        },
      });
      try {
        const response = await sendUserMessageService(
          activeWorkspace.id,
          threadId,
          message.text,
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
    activeMessages,
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
