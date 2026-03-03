type CommandInfo = {
  tokens: string[];
  preview: string;
};

type ApprovalToolKind = "fetch" | "read" | "write" | "execute" | "other";

const COMMAND_KEYS = [
  "argv",
  "args",
  "command",
  "cmd",
  "exec",
  "shellCommand",
  "script",
  "proposedExecPolicyAmendment",
  "proposed_exec_policy_amendment",
];

export function getApprovalCommandInfo(
  params: Record<string, unknown>,
): CommandInfo | null {
  const toolKind = extractApprovalToolKind(params);
  const tokens = extractTokens(params);
  if ((!tokens || tokens.length === 0) && toolKind === "other") {
    return null;
  }
  const normalized = normalizeCommandTokens(tokens ?? [], toolKind);
  if (!normalized.length) {
    return null;
  }
  const previewSource =
    normalized.length === 1 && normalized[0] !== "execute"
      ? normalized
      : (tokens ?? []);
  const preview = previewSource
    .map((token) => (token.includes(" ") ? JSON.stringify(token) : token))
    .join(" ");
  return { tokens: normalized, preview };
}

function extractApprovalToolKind(params: Record<string, unknown>): ApprovalToolKind {
  const rawKind =
    extractNestedString(params, ["raw", "toolCall", "kind"]) ||
    extractNestedString(params, ["toolCall", "kind"]) ||
    extractNestedString(params, ["kind"]);
  const normalized = rawKind.trim().toLowerCase();
  if (normalized === "fetch") return "fetch";
  if (normalized === "read") return "read";
  if (normalized === "write" || normalized === "editing" || normalized === "edit") {
    return "write";
  }
  if (
    normalized === "execute" ||
    normalized === "run" ||
    normalized === "commandexecution" ||
    normalized === "command_execution"
  ) {
    return "execute";
  }
  return "other";
}

function extractNestedString(value: unknown, path: string[]): string {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : "";
}

function extractTokens(value: unknown): string[] | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === "string")) {
      return value.map((entry) => entry.trim()).filter(Boolean);
    }
    return null;
  }
  if (typeof value === "string") {
    const tokens = splitCommandLine(value);
    return tokens.length ? tokens : null;
  }
  if (typeof value !== "object") {
    return null;
  }

  const objectValue = value as Record<string, unknown>;
  for (const key of COMMAND_KEYS) {
    const tokens = extractTokens(objectValue[key]);
    if (tokens?.length) {
      return tokens;
    }
  }

  for (const [key, nested] of Object.entries(objectValue)) {
    const normalized = key.toLowerCase();
    if (normalized.includes("execpolicy") || normalized.includes("exec_policy")) {
      const tokens = extractTokens(nested);
      if (tokens?.length) {
        return tokens;
      }
    }
  }

  return null;
}

function splitCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function stripTrailingAnnotation(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/^(.*)\s+\(([^()]*)\)\s*$/s);
  if (!match) {
    return trimmed;
  }
  const annotation = (match[2] ?? "").trim();
  if (annotation.length < 12) {
    return trimmed;
  }
  const lower = annotation.toLowerCase();
  if (
    /\b(test|verify|install|required|script|sample|capturing|check|ensure)\b/.test(lower) ||
    /[.!?]$/.test(annotation)
  ) {
    return (match[1] ?? "").trim();
  }
  return trimmed;
}

function isRedirectionToken(token: string): boolean {
  const value = token.trim();
  if (!value) {
    return false;
  }
  if (value === "2>&1" || value === "1>&2") {
    return true;
  }
  return /^\d?>>/.test(value) || /^\d?<</.test(value) || /^(?:>&|<|>)\d+$/.test(value);
}

export function normalizeCommandTokens(
  tokens: string[],
  toolKind: ApprovalToolKind = "other",
): string[] {
  if (toolKind === "fetch" || toolKind === "read" || toolKind === "write") {
    return [toolKind];
  }

  let normalized = tokens.map((token) => token.trim()).filter(Boolean);
  if (normalized.length === 1 && /\s/.test(normalized[0])) {
    const stripped = stripTrailingAnnotation(normalized[0]);
    const split = splitCommandLine(stripped);
    if (split.length > 0) {
      normalized = split;
    }
  }

  while (normalized.length > 0 && isRedirectionToken(normalized[normalized.length - 1])) {
    normalized.pop();
  }
  return normalized;
}

export function matchesCommandPrefix(
  command: string[],
  allowlist: string[][],
): boolean {
  const normalized = normalizeCommandTokens(command);
  if (!normalized.length) {
    return false;
  }
  return allowlist.some((prefix) => {
    if (!prefix.length || prefix.length > normalized.length) {
      return false;
    }
    for (let i = 0; i < prefix.length; i += 1) {
      if (prefix[i] !== normalized[i]) {
        return false;
      }
    }
    return true;
  });
}
