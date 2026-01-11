import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AppServerEvent, ApprovalRequest } from "../types";

type AgentDelta = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  delta: string;
};

type AgentCompleted = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  text: string;
};

type AppServerEventHandlers = {
  onWorkspaceConnected?: (workspaceId: string) => void;
  onApprovalRequest?: (request: ApprovalRequest) => void;
  onAgentMessageDelta?: (event: AgentDelta) => void;
  onAgentMessageCompleted?: (event: AgentCompleted) => void;
  onAppServerEvent?: (event: AppServerEvent) => void;
  onTurnStarted?: (workspaceId: string, threadId: string) => void;
  onTurnCompleted?: (workspaceId: string, threadId: string) => void;
};

export function useAppServerEvents(handlers: AppServerEventHandlers) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let canceled = false;
    listen<AppServerEvent>("app-server-event", (event) => {
      handlers.onAppServerEvent?.(event.payload);

      const { workspace_id, message } = event.payload;
      const method = String(message.method ?? "");

      if (method === "codex/connected") {
        handlers.onWorkspaceConnected?.(workspace_id);
        return;
      }

      if (method.includes("requestApproval") && typeof message.id === "number") {
        handlers.onApprovalRequest?.({
          workspace_id,
          request_id: message.id,
          method,
          params: (message.params as Record<string, unknown>) ?? {},
        });
        return;
      }

      if (method === "item/agentMessage/delta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onAgentMessageDelta?.({
            workspaceId: workspace_id,
            threadId,
            itemId,
            delta,
          });
        }
        return;
      }

      if (method === "turn/started") {
        const params = message.params as Record<string, unknown>;
        const turn = params.turn as Record<string, unknown> | undefined;
        const threadId = String(turn?.threadId ?? turn?.thread_id ?? "");
        if (threadId) {
          handlers.onTurnStarted?.(workspace_id, threadId);
        }
        return;
      }

      if (method === "turn/completed") {
        const params = message.params as Record<string, unknown>;
        const turn = params.turn as Record<string, unknown> | undefined;
        const threadId = String(turn?.threadId ?? turn?.thread_id ?? "");
        if (threadId) {
          handlers.onTurnCompleted?.(workspace_id, threadId);
        }
        return;
      }

      if (method === "item/completed") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const item = params.item as Record<string, unknown> | undefined;
        if (threadId && item?.type === "agentMessage") {
          const itemId = String(item.id ?? "");
          const text = String(item.text ?? "");
          if (itemId) {
            handlers.onAgentMessageCompleted?.({
              workspaceId: workspace_id,
              threadId,
              itemId,
              text,
            });
          }
        }
      }
    }).then((handler) => {
      if (canceled) {
        handler();
      } else {
        unlisten = handler;
      }
    });

    return () => {
      canceled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [handlers]);
}
