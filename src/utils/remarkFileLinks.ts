const FILE_LINK_PROTOCOL = "micode-file:";
const FILE_LINE_SUFFIX_PATTERN = "(?::\\d+(?::\\d+)?)?";
const FILE_NAME_EXTENSION_PATTERN =
  "(?:pdf|docx?|xlsx?|csv|txt|md|json|ya?ml|png|jpe?g|gif|webp|zip|tgz|tar\\.gz)";

const FILE_PATH_PATTERN =
  new RegExp(
    `(\\/[^\\s\\\`"'<>]+|~\\/[^\\s\\\`"'<>]+|\\.{1,2}\\/[^\\s\\\`"'<>]+|[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)+)${FILE_LINE_SUFFIX_PATTERN}`,
    "g",
  );
const FILE_NAME_PATTERN = new RegExp(
  `[\\p{L}\\p{N}_\\-()\\[\\]{}]+(?:\\.[\\p{L}\\p{N}_\\-()\\[\\]{}]+)*\\.${FILE_NAME_EXTENSION_PATTERN}${FILE_LINE_SUFFIX_PATTERN}`,
  "gu",
);
const FILE_REFERENCE_MATCH = new RegExp(
  `^(?:${FILE_PATH_PATTERN.source}|${FILE_NAME_PATTERN.source})$`,
  "u",
);

const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", ")", "]", "}"]);
const RELATIVE_ALLOWED_PREFIXES = [
  "src/",
  "app/",
  "lib/",
  "tests/",
  "test/",
  "packages/",
  "apps/",
  "docs/",
  "scripts/",
];

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

function isPathCandidate(
  value: string,
  leadingContext: string,
  previousChar: string,
) {
  if (!value.includes("/")) {
    return false;
  }
  if (value.startsWith("//")) {
    return false;
  }
  if (leadingContext.endsWith("://")) {
    return false;
  }
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    if (value.startsWith("/") && previousChar && /[A-Za-z0-9.]/.test(previousChar)) {
      return false;
    }
    return true;
  }
  if (value.startsWith("~/")) {
    return true;
  }
  const lastSegment = value.split("/").pop() ?? "";
  if (lastSegment.includes(".")) {
    return true;
  }
  return RELATIVE_ALLOWED_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isFileNameCandidate(
  value: string,
  leadingContext: string,
  previousChar: string,
  nextChar: string,
) {
  if (!value || value.includes("/") || value.includes("\\")) {
    return false;
  }
  if (leadingContext.endsWith("://")) {
    return false;
  }
  if (previousChar && /[@A-Za-z0-9_.-]/.test(previousChar)) {
    return false;
  }
  if (nextChar && /[A-Za-z0-9_.-]/.test(nextChar)) {
    return false;
  }
  return /\.(pdf|docx?|xlsx?|csv|txt|md|json|ya?ml|png|jpe?g|gif|webp|zip|tgz|tar\.gz)(?::\d+(?::\d+)?)?$/i.test(
    value,
  );
}

function splitTrailingPunctuation(value: string) {
  let end = value.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(value[end - 1])) {
    end -= 1;
  }
  return {
    path: value.slice(0, end),
    trailing: value.slice(end),
  };
}

export function toFileLink(path: string) {
  return `${FILE_LINK_PROTOCOL}${encodeURIComponent(path)}`;
}

function linkifyText(value: string) {
  FILE_PATH_PATTERN.lastIndex = 0;
  FILE_NAME_PATTERN.lastIndex = 0;
  const nodes: MarkdownNode[] = [];
  let lastIndex = 0;
  let hasLink = false;
  const matches: Array<{ index: number; raw: string }> = [];

  for (const match of value.matchAll(FILE_PATH_PATTERN)) {
    matches.push({
      index: match.index ?? 0,
      raw: match[0],
    });
  }
  for (const match of value.matchAll(FILE_NAME_PATTERN)) {
    matches.push({
      index: match.index ?? 0,
      raw: match[0],
    });
  }
  matches.sort((a, b) => a.index - b.index || b.raw.length - a.raw.length);
  const deduped: Array<{ index: number; raw: string }> = [];
  for (const current of matches) {
    const overlaps = deduped.some((existing) => {
      const existingEnd = existing.index + existing.raw.length;
      const currentEnd = current.index + current.raw.length;
      return current.index < existingEnd && existing.index < currentEnd;
    });
    if (!overlaps) {
      deduped.push(current);
    }
  }

  for (const entry of deduped) {
    const matchIndex = entry.index;
    const raw = entry.raw;
    if (matchIndex < lastIndex) {
      continue;
    }
    if (matchIndex > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, matchIndex) });
    }
    const leadingContext = value.slice(Math.max(0, matchIndex - 3), matchIndex);
    const previousChar = matchIndex > 0 ? value[matchIndex - 1] : "";
    const nextCharIndex = matchIndex + raw.length;
    const nextChar = nextCharIndex < value.length ? value[nextCharIndex] : "";
    const { path, trailing } = splitTrailingPunctuation(raw);
    const canLink =
      path &&
      (isPathCandidate(path, leadingContext, previousChar) ||
        isFileNameCandidate(path, leadingContext, previousChar, nextChar));
    if (canLink) {
      nodes.push({
        type: "link",
        url: toFileLink(path),
        children: [{ type: "text", value: path }],
      });
      if (trailing) {
        nodes.push({ type: "text", value: trailing });
      }
      hasLink = true;
    } else {
      nodes.push({ type: "text", value: raw });
    }

    lastIndex = matchIndex + raw.length;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }

  return hasLink ? nodes : null;
}

function isSkippableParent(parentType?: string) {
  return parentType === "link" || parentType === "inlineCode" || parentType === "code";
}

function walk(node: MarkdownNode, parentType?: string) {
  if (!node.children) {
    return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (
      child.type === "text" &&
      typeof child.value === "string" &&
      !isSkippableParent(parentType)
    ) {
      const nextNodes = linkifyText(child.value);
      if (nextNodes) {
        node.children.splice(index, 1, ...nextNodes);
        index += nextNodes.length - 1;
        continue;
      }
    }
    walk(child, child.type);
  }
}

export function remarkFileLinks() {
  return (tree: MarkdownNode) => {
    walk(tree);
  };
}

export function isLinkableFilePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (!FILE_REFERENCE_MATCH.test(trimmed)) {
    return false;
  }
  return isPathCandidate(trimmed, "", "") || isFileNameCandidate(trimmed, "", "", "");
}

export function isFileLinkUrl(url: string) {
  return url.startsWith(FILE_LINK_PROTOCOL);
}

export function decodeFileLink(url: string) {
  return decodeURIComponent(url.slice(FILE_LINK_PROTOCOL.length));
}
