import { useCallback, useEffect, useMemo, useState } from "react";
import type { QueuedMessage, WorkspaceInfo } from "../../../types";

type UseQueuedSendOptions = {
  activeThreadId: string | null;
  isProcessing: boolean;
  isReviewing: boolean;
  steerEnabled: boolean;
  appsEnabled: boolean;
  activeWorkspace: WorkspaceInfo | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  sendUserMessage: (text: string, images?: string[]) => Promise<void>;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    text: string,
    images?: string[],
  ) => Promise<void>;
  startFork: (text: string) => Promise<void>;
  startReview: (text: string) => Promise<void>;
  startResume: (text: string) => Promise<void>;
  startCompact: (text: string) => Promise<void>;
  startApps: (text: string) => Promise<void>;
  startMcp: (text: string) => Promise<void>;
  startStatus: (text: string) => Promise<void>;
  clearActiveImages: () => void;
};

type UseQueuedSendResult = {
  queuedByThread: Record<string, QueuedMessage[]>;
  activeQueue: QueuedMessage[];
  handleSend: (text: string, images?: string[]) => Promise<void>;
  queueMessage: (text: string, images?: string[]) => Promise<void>;
  removeQueuedMessage: (threadId: string, messageId: string) => void;
};

export function useQueuedSend({
  activeThreadId,
  isProcessing,
  isReviewing,
  steerEnabled,
  appsEnabled,
  activeWorkspace,
  connectWorkspace,
  sendUserMessage,
  startThreadForWorkspace,
  sendUserMessageToThread,
  startFork,
  startReview,
  startResume,
  startCompact,
  startApps,
  startMcp,
  startStatus,
  clearActiveImages,
}: UseQueuedSendOptions): UseQueuedSendResult {
  const [queuedByThread, setQueuedByThread] = useState<
    Record<string, QueuedMessage[]>
  >({});
  const [inFlightByThread, setInFlightByThread] = useState<
    Record<string, QueuedMessage | null>
  >({});
  const [hasStartedByThread, setHasStartedByThread] = useState<
    Record<string, boolean>
  >({});

  const activeQueue = useMemo(
    () => (activeThreadId ? queuedByThread[activeThreadId] ?? [] : []),
    [activeThreadId, queuedByThread],
  );

  const enqueueMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] ?? []), item],
    }));
  }, []);

  const removeQueuedMessage = useCallback(
    (threadId: string, messageId: string) => {
      setQueuedByThread((prev) => ({
        ...prev,
        [threadId]: (prev[threadId] ?? []).filter(
          (entry) => entry.id !== messageId,
        ),
      }));
    },
    [],
  );

  const prependQueuedMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [item, ...(prev[threadId] ?? [])],
    }));
  }, []);

  const executeSlashOrSend = useCallback(
    async (trimmed: string, images: string[] = []) => {
      const nextImages = images;
      const slashMatch = trimmed.match(/^\/([a-z0-9_-]+)\b/i);
      if (slashMatch) {
        const command = slashMatch[1].toLowerCase();
        switch (command) {
          case "new": {
            if (!activeWorkspace) {
              return;
            }
            const threadId = await startThreadForWorkspace(activeWorkspace.id);
            if (!threadId) {
              return;
            }
            const nextText = trimmed.replace(/^\/new\b/i, "").trim();
            if (nextText) {
              await sendUserMessageToThread(activeWorkspace, threadId, nextText, []);
            }
            return;
          }
          case "review":
            await startReview(trimmed);
            return;
          case "fork":
            await startFork(trimmed);
            return;
          case "resume":
            await startResume(trimmed);
            return;
          case "compact":
            await startCompact(trimmed);
            return;
          case "apps":
            if (appsEnabled) {
              await startApps(trimmed);
              return;
            }
            break;
          case "mcp":
            await startMcp(trimmed);
            return;
          case "status":
            await startStatus(trimmed);
            return;
          default:
            break;
        }
      }
      if (activeWorkspace && !activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      await sendUserMessage(trimmed, nextImages);
    },
    [
      activeWorkspace,
      appsEnabled,
      connectWorkspace,
      sendUserMessage,
      sendUserMessageToThread,
      startApps,
      startCompact,
      startFork,
      startMcp,
      startResume,
      startReview,
      startStatus,
      startThreadForWorkspace,
    ],
  );

  const handleSend = useCallback(
    async (text: string, images: string[] = []) => {
      const trimmed = text.trim();
      const nextImages = images;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      if (isProcessing && activeThreadId && !steerEnabled) {
        const item: QueuedMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: trimmed,
          createdAt: Date.now(),
          images: nextImages,
        };
        enqueueMessage(activeThreadId, item);
        clearActiveImages();
        return;
      }
      await executeSlashOrSend(trimmed, nextImages);
      clearActiveImages();
    },
    [
      activeThreadId,
      clearActiveImages,
      enqueueMessage,
      executeSlashOrSend,
      isProcessing,
      isReviewing,
      steerEnabled,
    ],
  );

  const queueMessage = useCallback(
    async (text: string, images: string[] = []) => {
      const trimmed = text.trim();
      const nextImages = images;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      if (!activeThreadId) {
        return;
      }
      const item: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        createdAt: Date.now(),
        images: nextImages,
      };
      enqueueMessage(activeThreadId, item);
      clearActiveImages();
    },
    [activeThreadId, clearActiveImages, enqueueMessage, isReviewing],
  );

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const inFlight = inFlightByThread[activeThreadId];
    if (!inFlight) {
      return;
    }
    if (isProcessing || isReviewing) {
      if (!hasStartedByThread[activeThreadId]) {
        setHasStartedByThread((prev) => ({
          ...prev,
          [activeThreadId]: true,
        }));
      }
      return;
    }
    if (hasStartedByThread[activeThreadId]) {
      setInFlightByThread((prev) => ({ ...prev, [activeThreadId]: null }));
      setHasStartedByThread((prev) => ({ ...prev, [activeThreadId]: false }));
    }
  }, [
    activeThreadId,
    hasStartedByThread,
    inFlightByThread,
    isProcessing,
    isReviewing,
  ]);

  useEffect(() => {
    if (!activeThreadId || isProcessing || isReviewing) {
      return;
    }
    if (inFlightByThread[activeThreadId]) {
      return;
    }
    const queue = queuedByThread[activeThreadId] ?? [];
    if (queue.length === 0) {
      return;
    }
    const threadId = activeThreadId;
    const nextItem = queue[0];
    setInFlightByThread((prev) => ({ ...prev, [threadId]: nextItem }));
    setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).slice(1),
    }));
    (async () => {
      try {
        await executeSlashOrSend(nextItem.text, nextItem.images ?? []);
      } catch {
        setInFlightByThread((prev) => ({ ...prev, [threadId]: null }));
        setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
        prependQueuedMessage(threadId, nextItem);
      }
    })();
  }, [
    activeThreadId,
    inFlightByThread,
    isProcessing,
    isReviewing,
    prependQueuedMessage,
    queuedByThread,
    executeSlashOrSend,
  ]);

  return {
    queuedByThread,
    activeQueue,
    handleSend,
    queueMessage,
    removeQueuedMessage,
  };
}
