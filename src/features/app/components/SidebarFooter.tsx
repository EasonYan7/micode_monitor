import type { UiLanguage } from "../../../types";

type SidebarFooterProps = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionValueLabel: string | null;
  weeklyValueLabel: string | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
  language?: UiLanguage;
};

export function SidebarFooter({
  sessionPercent,
  weeklyPercent,
  sessionValueLabel,
  weeklyValueLabel,
  sessionResetLabel,
  weeklyResetLabel,
  creditsLabel,
  showWeekly,
  language = "en",
}: SidebarFooterProps) {
  const isZh = language === "zh";
  const sessionTitle = isZh ? "\u4f1a\u8bdd\u7528\u91cf\u8bb0\u5f55" : "Session usage";
  const weeklyTitle = isZh ? "\u6bcf\u5468\u7528\u91cf" : "Weekly";
  const normalizedSessionValue = sessionValueLabel?.trim().toLowerCase() ?? null;
  const normalizedCreditsValue = creditsLabel?.trim().toLowerCase() ?? null;
  const footerMetaLabel =
    normalizedSessionValue &&
    normalizedCreditsValue &&
    normalizedCreditsValue.includes(normalizedSessionValue)
      ? null
      : creditsLabel;

  return (
    <div className="sidebar-footer">
      <div className="usage-bars">
        <div className="usage-block">
          <div className="usage-label">
            <span className="usage-title">
              <span>{sessionTitle}</span>
              {sessionResetLabel && (
                <span className="usage-reset">· {sessionResetLabel}</span>
              )}
            </span>
            <span className="usage-value">
              {sessionPercent === null
                ? sessionValueLabel ?? "--"
                : `${sessionPercent}%`}
            </span>
          </div>
          <div className="usage-bar">
            <span
              className="usage-bar-fill"
              style={{ width: `${sessionPercent ?? 0}%` }}
            />
          </div>
        </div>
        {showWeekly && (
          <div className="usage-block">
            <div className="usage-label">
              <span className="usage-title">
                <span>{weeklyTitle}</span>
                {weeklyResetLabel && (
                  <span className="usage-reset">· {weeklyResetLabel}</span>
                )}
              </span>
              <span className="usage-value">
                {weeklyPercent === null
                  ? weeklyValueLabel ?? "--"
                  : `${weeklyPercent}%`}
              </span>
            </div>
            <div className="usage-bar">
              <span
                className="usage-bar-fill"
                style={{ width: `${weeklyPercent ?? 0}%` }}
              />
            </div>
          </div>
        )}
      </div>
      {footerMetaLabel && <div className="usage-meta">{footerMetaLabel}</div>}
    </div>
  );
}
