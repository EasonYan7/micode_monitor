import type { DebugEntry } from "../types";

type DebugPanelProps = {
  entries: DebugEntry[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  onCopy: () => void;
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

export function DebugPanel({
  entries,
  isOpen,
  onToggle,
  onClear,
  onCopy,
}: DebugPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="debug-panel open">
      <div className="debug-header">
        <div className="debug-title">Debug</div>
        <div className="debug-actions">
          <button className="ghost" onClick={onCopy}>
            Copy
          </button>
          <button className="ghost" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      {isOpen && (
        <div className="debug-list">
          {entries.length === 0 && (
            <div className="debug-empty">No debug events yet.</div>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="debug-row">
              <div className="debug-meta">
                <span className={`debug-source ${entry.source}`}>
                  {entry.source}
                </span>
                <span className="debug-time">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="debug-label">{entry.label}</span>
              </div>
              {entry.payload !== undefined && (
                <pre className="debug-payload">
                  {formatPayload(entry.payload)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
