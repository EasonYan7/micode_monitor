import { useMemo, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { DebugEntry, UiLanguage } from "../../../types";
import {
  buildCompactDebugEntries,
  getDebugPanelLabels,
  type CompactDebugEntry,
  type DebugViewMode,
} from "../../../utils/debugEntries";

type DebugPanelProps = {
  entries: DebugEntry[];
  isOpen: boolean;
  onClear: () => void;
  onCopy: () => void;
  viewMode: DebugViewMode;
  onViewModeChange: (mode: DebugViewMode) => void;
  scopeMode: "thread" | "workspace";
  onScopeModeChange: (mode: "thread" | "workspace") => void;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  language?: UiLanguage;
  onResizeStart?: (event: ReactMouseEvent) => void;
  variant?: "dock" | "full";
};

function formatPayload(payload: unknown) {
  if (payload === undefined) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractWorkspaceId(entry: DebugEntry): string | null {
  const payload = asRecord(entry.payload);
  const message = asRecord(payload?.message);
  const params = asRecord(message?.params);
  return (
    pickString(payload?.workspaceId) ??
    pickString(payload?.workspace_id) ??
    pickString(params?.workspaceId) ??
    pickString(params?.workspace_id) ??
    null
  );
}

function extractThreadId(entry: DebugEntry): string | null {
  const payload = asRecord(entry.payload);
  const message = asRecord(payload?.message);
  const params = asRecord(message?.params);
  const turn = asRecord(params?.turn);
  const item = asRecord(params?.item);
  return (
    pickString(payload?.threadId) ??
    pickString(payload?.thread_id) ??
    pickString(params?.threadId) ??
    pickString(params?.thread_id) ??
    pickString(turn?.threadId) ??
    pickString(turn?.thread_id) ??
    pickString(item?.threadId) ??
    pickString(item?.thread_id) ??
    null
  );
}

export function DebugPanel({
  entries,
  isOpen,
  onClear,
  onCopy,
  viewMode,
  onViewModeChange,
  scopeMode,
  onScopeModeChange,
  activeWorkspaceId,
  activeThreadId,
  language,
  onResizeStart,
  variant = "dock",
}: DebugPanelProps) {
  const isVisible = variant === "full" || isOpen;
  const labels = getDebugPanelLabels(language);

  type FormattedDebugEntry = DebugEntry & {
    timeLabel: string;
    payloadText?: string;
  };

  const previousEntriesRef = useRef<DebugEntry[] | null>(null);
  const previousFormattedRef = useRef<FormattedDebugEntry[] | null>(null);

  const filteredEntries = useMemo(() => {
    if (scopeMode === "workspace") {
      if (!activeWorkspaceId) {
        return entries;
      }
      return entries.filter((entry) => extractWorkspaceId(entry) === activeWorkspaceId);
    }
    if (!activeThreadId) {
      return [];
    }
    return entries.filter((entry) => extractThreadId(entry) === activeThreadId);
  }, [activeThreadId, activeWorkspaceId, entries, scopeMode]);

  const formattedEntries = useMemo(() => {
    if (!isVisible) {
      return previousFormattedRef.current ?? [];
    }
    const previousEntries = previousEntriesRef.current;
    const previousFormatted = previousFormattedRef.current;

    const canReusePrevious =
      previousEntries !== null &&
      previousFormatted !== null &&
      previousEntries.length === filteredEntries.length &&
      filteredEntries.every((entry, index) => {
        const previous = previousEntries[index];
        return (
          previous !== undefined &&
          previous.id === entry.id &&
          previous.timestamp === entry.timestamp &&
          previous.source === entry.source &&
          previous.label === entry.label &&
          previous.payload === entry.payload
        );
      });

    if (canReusePrevious) {
      return previousFormatted;
    }

    const nextFormatted = filteredEntries.map((entry) => ({
      ...entry,
      timeLabel: new Date(entry.timestamp).toLocaleTimeString(),
      payloadText:
        entry.payload !== undefined ? formatPayload(entry.payload) : undefined,
    }));

    previousEntriesRef.current = filteredEntries;
    previousFormattedRef.current = nextFormatted;

    return nextFormatted;
  }, [filteredEntries, isVisible]);

  const compactEntries = useMemo<CompactDebugEntry[]>(() => {
    if (!isVisible) {
      return [];
    }
    return buildCompactDebugEntries(filteredEntries, language);
  }, [filteredEntries, isVisible, language]);

  if (!isVisible) {
    return null;
  }

  return (
    <section
      className={`debug-panel ${variant === "full" ? "full" : isOpen ? "open" : ""}`}
    >
      {variant !== "full" && isOpen && onResizeStart ? (
        <div
          className="debug-panel-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize debug panel"
          onMouseDown={onResizeStart}
        />
      ) : null}
      <div className="debug-header">
        <div className="debug-heading">
          <div className="debug-title">Debug</div>
          <div className="debug-mode-tabs" role="tablist" aria-label="Debug view mode">
            <button
              className={`debug-mode-tab ${scopeMode === "thread" ? "active" : ""}`}
              onClick={() => onScopeModeChange("thread")}
              role="tab"
              aria-selected={scopeMode === "thread"}
            >
              Thread
            </button>
            <button
              className={`debug-mode-tab ${scopeMode === "workspace" ? "active" : ""}`}
              onClick={() => onScopeModeChange("workspace")}
              role="tab"
              aria-selected={scopeMode === "workspace"}
            >
              Workspace
            </button>
            <button
              className={`debug-mode-tab ${viewMode === "compact" ? "active" : ""}`}
              onClick={() => onViewModeChange("compact")}
              role="tab"
              aria-selected={viewMode === "compact"}
            >
              {labels.compactTab}
            </button>
            <button
              className={`debug-mode-tab ${viewMode === "detail" ? "active" : ""}`}
              onClick={() => onViewModeChange("detail")}
              role="tab"
              aria-selected={viewMode === "detail"}
            >
              {labels.detailTab}
            </button>
          </div>
        </div>
        <div className="debug-actions">
          <button className="ghost" onClick={onCopy}>
            Copy
          </button>
          <button className="ghost" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      {isOpen ? (
        <div className="debug-list">
          {viewMode === "detail" ? (
            <div className="debug-note">
              {labels.detailNote}
            </div>
          ) : (
            <div className="debug-note">
              {labels.compactNote}
            </div>
          )}
          {viewMode === "detail" && formattedEntries.length === 0 ? (
            <div className="debug-empty">{labels.noDetail}</div>
          ) : null}
          {viewMode === "compact" && compactEntries.length === 0 ? (
            <div className="debug-empty">{labels.noCompact}</div>
          ) : null}
          {viewMode === "detail"
            ? formattedEntries.map((entry) => (
                <div key={entry.id} className="debug-row">
                  <div className="debug-meta">
                    <span className={`debug-source ${entry.source}`}>
                      {entry.source}
                    </span>
                    <span className="debug-time">{entry.timeLabel}</span>
                    <span className="debug-label">{entry.label}</span>
                  </div>
                  {entry.payloadText !== undefined ? (
                    <pre className="debug-payload">{entry.payloadText}</pre>
                  ) : null}
                </div>
              ))
            : compactEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`debug-row debug-row-compact ${entry.category}`}
                >
                  <div className="debug-meta">
                    <span className={`debug-source ${entry.source}`}>
                      {entry.category}
                    </span>
                    <span className="debug-time">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="debug-label">{entry.title}</span>
                  </div>
                  <div className="debug-compact-summary">{entry.summary}</div>
                  {entry.detail ? (
                    <pre className="debug-payload">{entry.detail}</pre>
                  ) : null}
                </div>
              ))}
        </div>
      ) : null}
    </section>
  );
}
