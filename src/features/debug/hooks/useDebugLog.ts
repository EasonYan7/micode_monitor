import { useCallback, useEffect, useRef, useState } from "react";
import type { DebugEntry } from "../../../types";
import { appendDebugLogs, type PersistedDebugEntry } from "../../../services/tauri";

const MAX_DEBUG_ENTRIES = 200;
const MAX_PENDING_PERSIST_ENTRIES = 5000;
const PERSIST_INTERVAL_MS = 1000;

function tryExtractWorkspaceId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const direct =
    typeof record.workspaceId === "string"
      ? record.workspaceId
      : typeof record.workspace_id === "string"
        ? record.workspace_id
        : null;
  if (direct && direct.trim().length > 0) {
    return direct.trim();
  }
  return null;
}

export function useDebugLog() {
  const [debugOpen, setDebugOpenState] = useState(false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [hasDebugAlerts, setHasDebugAlerts] = useState(false);
  const [debugPinned, setDebugPinned] = useState(false);
  const pendingPersistRef = useRef<PersistedDebugEntry[]>([]);
  const persistingRef = useRef(false);

  const flushPersistQueue = useCallback(async () => {
    if (persistingRef.current) {
      return;
    }
    if (pendingPersistRef.current.length === 0) {
      return;
    }
    persistingRef.current = true;
    const batch = pendingPersistRef.current.splice(0, pendingPersistRef.current.length);
    try {
      await appendDebugLogs(batch);
    } catch (error) {
      console.warn("[debug-log] persist failed", error);
      pendingPersistRef.current = [...batch, ...pendingPersistRef.current].slice(
        -MAX_PENDING_PERSIST_ENTRIES,
      );
    } finally {
      persistingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void flushPersistQueue();
    }, PERSIST_INTERVAL_MS);
    const handleBeforeUnload = () => {
      void flushPersistQueue();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void flushPersistQueue();
    };
  }, [flushPersistQueue]);

  const isAlertEntry = useCallback((entry: DebugEntry) => {
    if (entry.source === "error" || entry.source === "stderr") {
      return true;
    }
    const label = entry.label.toLowerCase();
    if (label.includes("warn") || label.includes("warning")) {
      return true;
    }
    if (typeof entry.payload === "string") {
      const payload = entry.payload.toLowerCase();
      return payload.includes("warn") || payload.includes("warning");
    }
    return false;
  }, []);

  const shouldStoreEntry = useCallback(
    (entry: DebugEntry) => {
      if (debugOpen) {
        return true;
      }
      return isAlertEntry(entry);
    },
    [debugOpen, isAlertEntry],
  );

  const addDebugEntry = useCallback(
    (entry: DebugEntry) => {
      pendingPersistRef.current.push({
        id: entry.id,
        timestamp: entry.timestamp,
        source: entry.source,
        label: entry.label,
        payload: entry.payload,
        workspaceId: tryExtractWorkspaceId(entry.payload),
      });
      if (pendingPersistRef.current.length > MAX_PENDING_PERSIST_ENTRIES) {
        pendingPersistRef.current = pendingPersistRef.current.slice(-MAX_PENDING_PERSIST_ENTRIES);
      }
      if (!shouldStoreEntry(entry)) {
        return;
      }
      if (isAlertEntry(entry)) {
        setHasDebugAlerts(true);
      }
      setDebugEntries((prev) => {
        const existingIndex = prev.findIndex((candidate) => candidate.id === entry.id);
        if (existingIndex === -1) {
          return [...prev, entry].slice(-MAX_DEBUG_ENTRIES);
        }
        const next = [...prev];
        next.splice(existingIndex, 1);
        next.push(entry);
        return next.slice(-MAX_DEBUG_ENTRIES);
      });
    },
    [isAlertEntry, shouldStoreEntry],
  );

  const handleCopyDebug = useCallback(async () => {
    const text = debugEntries
      .map((entry) => {
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        const payload =
          entry.payload !== undefined
            ? typeof entry.payload === "string"
              ? entry.payload
              : JSON.stringify(entry.payload, null, 2)
            : "";
        return [entry.source.toUpperCase(), timestamp, entry.label, payload]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  }, [debugEntries]);

  const clearDebugEntries = useCallback(() => {
    setDebugEntries([]);
    setHasDebugAlerts(false);
  }, []);

  const setDebugOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setDebugOpenState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (resolved) {
          setDebugPinned(true);
        }
        return resolved;
      });
    },
    [],
  );

  const showDebugButton = hasDebugAlerts || debugOpen || debugPinned || true;

  return {
    debugOpen,
    setDebugOpen,
    debugEntries,
    hasDebugAlerts,
    showDebugButton,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries,
  };
}
