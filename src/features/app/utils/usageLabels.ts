import type { RateLimitSnapshot, ThreadTokenUsage } from "../../../types";
import { formatRelativeTime } from "../../../utils/time";

type UsageLabels = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionValueLabel: string | null;
  weeklyValueLabel: string | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
};

const clampPercent = (value: number) =>
  Math.min(Math.max(Math.round(value), 0), 100);

function formatResetLabel(resetsAt?: number | null) {
  if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) {
    return null;
  }
  const resetMs = resetsAt > 1_000_000_000_000 ? resetsAt : resetsAt * 1000;
  const relative = formatRelativeTime(resetMs).replace(/^in\s+/i, "");
  return `Resets ${relative}`;
}

function formatCreditsLabel(accountRateLimits: RateLimitSnapshot | null) {
  const credits = accountRateLimits?.credits ?? null;
  if (!credits?.hasCredits) {
    return null;
  }
  if (credits.unlimited) {
    return "Credits: Unlimited";
  }
  const balance = credits.balance?.trim() ?? "";
  if (!balance) {
    return null;
  }
  const intValue = Number.parseInt(balance, 10);
  if (Number.isFinite(intValue) && intValue > 0) {
    return `Credits: ${intValue} credits`;
  }
  const floatValue = Number.parseFloat(balance);
  if (Number.isFinite(floatValue) && floatValue > 0) {
    const rounded = Math.round(floatValue);
    return rounded > 0 ? `Credits: ${rounded} credits` : null;
  }
  return null;
}

function formatTokenCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return `${Math.round(value)}`;
}

export function getUsageLabels(
  accountRateLimits: RateLimitSnapshot | null,
  showRemaining: boolean,
  tokenUsage: ThreadTokenUsage | null = null,
): UsageLabels {
  const usagePercent = accountRateLimits?.primary?.usedPercent;
  const globalUsagePercent = accountRateLimits?.secondary?.usedPercent;
  const sessionPercent =
    typeof usagePercent === "number"
      ? showRemaining
        ? 100 - clampPercent(usagePercent)
        : clampPercent(usagePercent)
      : null;
  const weeklyPercent =
    typeof globalUsagePercent === "number"
      ? showRemaining
        ? 100 - clampPercent(globalUsagePercent)
        : clampPercent(globalUsagePercent)
      : null;
  const sessionTokens = tokenUsage?.last?.totalTokens ?? null;
  const totalTokens = tokenUsage?.total?.totalTokens ?? null;
  const sessionValueLabel =
    sessionPercent === null ? formatTokenCount(sessionTokens) : null;
  const weeklyValueLabel = weeklyPercent === null ? null : null;
  const creditsLabel = formatCreditsLabel(accountRateLimits);
  const fallbackCredits =
    creditsLabel ??
    (totalTokens && totalTokens > 0
      ? `Tokens: ${formatTokenCount(totalTokens)}`
      : null);

  return {
    sessionPercent,
    weeklyPercent,
    sessionValueLabel,
    weeklyValueLabel,
    sessionResetLabel: formatResetLabel(accountRateLimits?.primary?.resetsAt),
    weeklyResetLabel: formatResetLabel(accountRateLimits?.secondary?.resetsAt),
    creditsLabel: fallbackCredits,
    showWeekly: Boolean(accountRateLimits?.secondary),
  };
}
