import type { DebugEntry, UiLanguage } from "../types";
import { buildConversationItem } from "./threadItems";

export type DebugViewMode = "detail" | "compact";

export type CompactDebugEntry = {
  id: string;
  timestamp: number;
  source: DebugEntry["source"];
  label: string;
  category: "user" | "assistant" | "tool" | "system" | "error";
  title: string;
  summary: string;
  detail?: string;
};

type DebugLocale = "en" | "zh";

type DebugI18n = {
  compactTab: string;
  detailTab: string;
  detailNote: string;
  compactNote: string;
  noDetail: string;
  noCompact: string;
  userMessage: string;
  richStarted: string;
  richCompleted: string;
  richOutput: string;
  toolStarted: string;
  toolCompleted: string;
  error: string;
  interrupt: string;
  threadStarted: string;
  assistantStartedSummary: string;
  assistantCompletedSummary: string;
  interruptRequestedSummary: string;
  interruptCompletedSummary: string;
  threadStartedSummary: string;
  emptyMessage: string;
  sentImages: (count: number) => string;
};

export function buildErrorDebugEntry(label: string, error: unknown): DebugEntry {
  const timestamp = Date.now();
  const payload = error instanceof Error ? error.message : String(error);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return {
    id: `${timestamp}-${slug || "error"}`,
    timestamp,
    source: "error",
    label,
    payload,
  };
}

const MAX_COMPACT_SUMMARY_LENGTH = 200;

function resolveLocale(language?: UiLanguage | null): DebugLocale {
  return language === "zh" ? "zh" : "en";
}

function getDebugI18n(language?: UiLanguage | null): DebugI18n {
  const locale = resolveLocale(language);
  if (locale === "zh") {
    return {
      compactTab: "简洁",
      detailTab: "详细",
      detailNote: "详细事件会继续完整保存到本地日志目录。",
      compactNote: "简洁模式只展示可读的会话时间线。",
      noDetail: "还没有详细调试事件。",
      noCompact: "还没有可读时间线事件。",
      userMessage: "用户消息",
      richStarted: "Rich 开始",
      richCompleted: "Rich 完成",
      richOutput: "Rich 回复",
      toolStarted: "工具开始",
      toolCompleted: "工具完成",
      error: "错误",
      interrupt: "中断",
      threadStarted: "会话开始",
      assistantStartedSummary: "助手开始处理这一轮请求。",
      assistantCompletedSummary: "助手完成了这一轮请求。",
      interruptRequestedSummary: "用户请求停止当前这一轮。",
      interruptCompletedSummary: "中断请求已完成。",
      threadStartedSummary: "会话线程已初始化。",
      emptyMessage: "(空消息)",
      sentImages: (count: number) => `[发送了 ${count} 张图片]`,
    };
  }
  return {
    compactTab: "Compact",
    detailTab: "Detailed",
    detailNote: "Detailed events remain persisted in the local logs directory.",
    compactNote: "Compact mode shows the readable turn timeline only.",
    noDetail: "No debug events yet.",
    noCompact: "No compact timeline events yet.",
    userMessage: "User message",
    richStarted: "Rich started",
    richCompleted: "Rich completed",
    richOutput: "Rich output",
    toolStarted: "Tool started",
    toolCompleted: "Tool completed",
    error: "Error",
    interrupt: "Interrupt",
    threadStarted: "Thread started",
    assistantStartedSummary: "Assistant started processing this turn.",
    assistantCompletedSummary: "Assistant finished this turn.",
    interruptRequestedSummary: "User requested to stop the current turn.",
    interruptCompletedSummary: "Interrupt request completed.",
    threadStartedSummary: "Conversation thread initialized.",
    emptyMessage: "(empty)",
    sentImages: (count: number) => `[Sent ${count} image${count > 1 ? "s" : ""}]`,
  };
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return stringifyValue(value).trim();
}

function parseAgentTextFromContent(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return "";
      }
      const type = asString(record.type);
      if (type === "text") {
        return asString(record.text);
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractStderrMessage(payload: unknown): string {
  const direct = asString(extractEventParam(payload, "message"));
  if (direct) {
    return direct;
  }
  const record = asRecord(payload);
  const message = asRecord(record?.message);
  const params = asRecord(message?.params);
  const nested = asString(params?.message);
  if (nested) {
    return nested;
  }
  return asString(payload);
}

function extractEventItem(payload: unknown): Record<string, unknown> | null {
  const record = asRecord(payload);
  const message = asRecord(record?.message);
  const params = asRecord(message?.params);
  return asRecord(params?.item);
}

function extractEventParam(payload: unknown, key: string): unknown {
  const record = asRecord(payload);
  const message = asRecord(record?.message);
  const params = asRecord(message?.params);
  return params?.[key];
}

function buildToolCompactEntry(
  entry: DebugEntry,
  item: Record<string, unknown>,
  i18n: DebugI18n,
): CompactDebugEntry | null {
  const conversationItem = buildConversationItem(item);
  if (!conversationItem || conversationItem.kind !== "tool") {
    return null;
  }
  const status = typeof conversationItem.status === "string" ? conversationItem.status : "";
  const phaseLabel = entry.label === "item/started" ? "started" : "completed";
  const summary =
    entry.label === "item/started"
      ? `${conversationItem.title}${status ? ` (${status})` : ""}`
      : `${conversationItem.title}${status ? ` (${status})` : ""}`;
  const detail = [conversationItem.detail, conversationItem.output]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join("\n");

  return {
    id: `${entry.id}:${phaseLabel}`,
    timestamp: entry.timestamp,
    source: entry.source,
    label: entry.label,
    category: "tool",
    title: entry.label === "item/started" ? i18n.toolStarted : i18n.toolCompleted,
    summary,
    detail: detail || undefined,
  };
}

function buildCompactEntriesForItemLifecycle(
  entry: DebugEntry,
  i18n: DebugI18n,
): CompactDebugEntry[] {
  const item = extractEventItem(entry.payload);
  if (!item) {
    return [];
  }

  const toolEntry = buildToolCompactEntry(entry, item, i18n);
  if (toolEntry) {
    return [toolEntry];
  }

  const itemType = asString(item.type);
  if (itemType === "agentMessage" && entry.label === "item/completed") {
    const text = asString(item.text) || parseAgentTextFromContent(item.content);
    if (!text) {
      return [];
    }
    return [
      {
        id: `${entry.id}:assistant-final`,
        timestamp: entry.timestamp,
        source: entry.source,
        label: entry.label,
        category: "assistant",
        title: i18n.richOutput,
        summary: text,
      },
    ];
  }

  return [];
}

function buildCompactEntry(
  entry: DebugEntry,
  i18n: DebugI18n,
): CompactDebugEntry | CompactDebugEntry[] | null {
  if (entry.source === "client" && entry.label === "turn/start") {
    const payload = asRecord(entry.payload);
    const text = asString(payload?.text);
    const images = Array.isArray(payload?.images) ? payload.images.length : 0;
    return {
      id: `${entry.id}:user`,
      timestamp: entry.timestamp,
      source: entry.source,
      label: entry.label,
      category: "user",
      title: i18n.userMessage,
      summary: truncateText(
        text || (images > 0 ? i18n.sentImages(images) : i18n.emptyMessage),
        MAX_COMPACT_SUMMARY_LENGTH,
      ),
    };
  }

  if (entry.label === "turn/started") {
    return {
      id: `${entry.id}:ai-start`,
      timestamp: entry.timestamp,
      source: entry.source,
      label: entry.label,
      category: "assistant",
      title: i18n.richStarted,
      summary: i18n.assistantStartedSummary,
    };
  }

  if (entry.label === "turn/completed") {
    return {
      id: `${entry.id}:ai-complete`,
      timestamp: entry.timestamp,
      source: entry.source,
      label: entry.label,
      category: "assistant",
      title: i18n.richCompleted,
      summary: i18n.assistantCompletedSummary,
    };
  }

  if (entry.label === "item/agentMessage/stream") {
    const payload = asRecord(entry.payload);
    const text = asString(payload?.text) || parseAgentTextFromContent(payload?.content);
    if (!text) {
      return null;
    }
    return {
      id: `${entry.id}:assistant-stream`,
      timestamp: entry.timestamp,
      source: entry.source,
      label: entry.label,
      category: "assistant",
      title: i18n.richOutput,
      summary: text,
    };
  }

  if (entry.label === "item/agentMessage/final") {
    const payload = asRecord(entry.payload);
    const text = asString(payload?.text) || parseAgentTextFromContent(payload?.content);
    if (!text) {
      return null;
    }
    return {
      id: `${entry.id}:assistant-final`,
      timestamp: entry.timestamp,
      source: entry.source,
      label: entry.label,
      category: "assistant",
      title: i18n.richOutput,
      summary: text,
    };
  }

  if (entry.label === "item/started" || entry.label === "item/completed") {
    return buildCompactEntriesForItemLifecycle(entry, i18n);
  }

  if (
    entry.source === "error" ||
    entry.source === "stderr" ||
    entry.label.endsWith(" error") ||
    entry.label.includes("stderr")
  ) {
    const payload = extractStderrMessage(entry.payload);
    return {
      id: `${entry.id}:error`,
      timestamp: entry.timestamp,
      source: entry.source,
      label: entry.label,
      category: "error",
      title: i18n.error,
      summary: payload || entry.label,
      detail: payload || undefined,
    };
  }

  if (entry.label === "turn/interrupt" || entry.label === "turn/interrupt response") {
    return {
      id: `${entry.id}:interrupt`,
      timestamp: entry.timestamp,
      source: entry.source,
      label: entry.label,
      category: "system",
      title: i18n.interrupt,
      summary:
        entry.label === "turn/interrupt"
          ? i18n.interruptRequestedSummary
          : i18n.interruptCompletedSummary,
    };
  }

  const method = asString(extractEventParam(entry.payload, "method"));
  if (method === "thread/started") {
    return {
      id: `${entry.id}:thread-started`,
      timestamp: entry.timestamp,
      source: entry.source,
      label: entry.label,
      category: "system",
      title: i18n.threadStarted,
      summary: i18n.threadStartedSummary,
    };
  }

  return null;
}

export function buildCompactDebugEntries(
  entries: DebugEntry[],
  language?: UiLanguage | null,
): CompactDebugEntry[] {
  const i18n = getDebugI18n(language);
  const compactEntries = entries.flatMap((entry) => {
    const compact = buildCompactEntry(entry, i18n);
    if (!compact) {
      return [];
    }
    return Array.isArray(compact) ? compact : [compact];
  });

  const filtered: CompactDebugEntry[] = [];
  for (let index = 0; index < compactEntries.length; index += 1) {
    const entry = compactEntries[index];
    if (entry.title === i18n.richCompleted) {
      const hasNearbyRichOutput = compactEntries.some((candidate, candidateIndex) => {
        if (candidateIndex === index) {
          return false;
        }
        if (candidate.title !== i18n.richOutput) {
          return false;
        }
        return Math.abs(candidate.timestamp - entry.timestamp) <= 5000;
      });
      if (hasNearbyRichOutput) {
        continue;
      }
    }
    filtered.push(entry);
  }

  return filtered;
}

function formatDetailCopy(entries: DebugEntry[]) {
  return entries
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
}

function formatCompactCopy(entries: CompactDebugEntry[]) {
  return entries
    .map((entry) =>
      [
        `${new Date(entry.timestamp).toLocaleTimeString()}  ${entry.title}`,
        entry.summary,
        entry.detail ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function formatDebugEntriesForCopy(
  entries: DebugEntry[],
  mode: DebugViewMode,
  language?: UiLanguage | null,
) {
  if (mode === "compact") {
    return formatCompactCopy(buildCompactDebugEntries(entries, language));
  }
  return formatDetailCopy(entries);
}

export function getDebugPanelLabels(language?: UiLanguage | null) {
  return getDebugI18n(language);
}
