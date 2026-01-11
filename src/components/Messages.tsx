import { useEffect, useRef } from "react";
import type { ConversationItem } from "../types";

type MessagesProps = {
  items: ConversationItem[];
  isThinking: boolean;
};

export function Messages({ items, isThinking }: MessagesProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length, isThinking]);

  return (
    <div className="messages messages-full">
      {items.map((item) => {
        if (item.kind === "message") {
          return (
            <div key={item.id} className={`message ${item.role}`}>
              <div className="bubble">{item.text}</div>
            </div>
          );
        }
        if (item.kind === "reasoning") {
          return (
            <details key={item.id} className="item-card reasoning">
              <summary>
                <span className="item-summary-left">
                  <span className="item-chevron" aria-hidden>
                    ▸
                  </span>
                  <span className="item-title">Reasoning</span>
                </span>
              </summary>
              <div className="item-body">
                {item.summary && <div className="item-text">{item.summary}</div>}
                {item.content && <div className="item-text">{item.content}</div>}
              </div>
            </details>
          );
        }
        return (
          <details key={item.id} className="item-card tool">
            <summary>
              <span className="item-summary-left">
                <span className="item-chevron" aria-hidden>
                  ▸
                </span>
                <span className="item-title">{item.title}</span>
              </span>
              {item.status && <span className="item-status">{item.status}</span>}
            </summary>
            <div className="item-body">
              {item.detail && <div className="item-text">{item.detail}</div>}
              {item.output && <pre className="item-output">{item.output}</pre>}
            </div>
          </details>
        );
      })}
      {isThinking && (
        <div className="thinking">Codex is thinking...</div>
      )}
      {!items.length && (
        <div className="empty messages-empty">
          Start a thread and send a prompt to the agent.
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
