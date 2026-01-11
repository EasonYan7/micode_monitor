type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  models: { id: string; displayName: string; model: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
};

export function Composer({
  value,
  onChange,
  onSend,
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
}: ComposerProps) {
  return (
    <footer className="composer">
      <div className="composer-input">
        <textarea
          placeholder="Ask Codex to do something..."
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <button className="composer-send" onClick={onSend}>
          Send
        </button>
      </div>
      <div className="composer-bar">
        <div className="composer-meta">
          <select
            className="composer-select"
            aria-label="Model"
            value={selectedModelId ?? ""}
            onChange={(event) => onSelectModel(event.target.value)}
          >
            {models.length === 0 && <option value="">No models</option>}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName || model.model}
              </option>
            ))}
          </select>
          <select
            className="composer-select"
            aria-label="Thinking mode"
            value={selectedEffort ?? ""}
            onChange={(event) => onSelectEffort(event.target.value)}
          >
            {reasoningOptions.length === 0 && (
              <option value="">Thinking: default</option>
            )}
            {reasoningOptions.map((effort) => (
              <option key={effort} value={effort}>
                Thinking: {effort}
              </option>
            ))}
          </select>
        </div>
      </div>
    </footer>
  );
}
