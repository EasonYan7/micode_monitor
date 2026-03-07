import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import type {
  LocalUsageSnapshot,
  ThreadSummary,
  UiLanguage,
  WorkspaceInfo,
} from "../../../types";
import { formatRelativeTime } from "../../../utils/time";

type LatestAgentRun = {
  message: string;
  timestamp: number;
  projectName: string;
  groupName?: string | null;
  workspaceId: string;
  threadId: string;
  isProcessing: boolean;
};

type UsageMetric = "tokens" | "time";

type UsageWorkspaceOption = {
  id: string;
  label: string;
};

type ThreadStatus = {
  isProcessing: boolean;
  hasUnread: boolean;
  isReviewing: boolean;
};

type HomeProps = {
  onOpenProject: () => void;
  onAddWorkspace: () => void;
  workspaces: WorkspaceInfo[];
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadStatusById: Record<string, ThreadStatus>;
  latestAgentRuns: LatestAgentRun[];
  isLoadingLatestAgents: boolean;
  localUsageSnapshot: LocalUsageSnapshot | null;
  isLoadingLocalUsage: boolean;
  localUsageError: string | null;
  onRefreshLocalUsage: () => void;
  usageMetric: UsageMetric;
  onUsageMetricChange: (metric: UsageMetric) => void;
  usageWorkspaceId: string | null;
  usageWorkspaceOptions: UsageWorkspaceOption[];
  onUsageWorkspaceChange: (workspaceId: string | null) => void;
  onOpenWorkspace: (workspaceId: string) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  language?: UiLanguage;
};

export function Home({
  onOpenProject,
  onAddWorkspace,
  workspaces,
  threadsByWorkspace,
  threadStatusById,
  latestAgentRuns,
  isLoadingLatestAgents,
  localUsageSnapshot,
  isLoadingLocalUsage,
  localUsageError,
  onRefreshLocalUsage,
  usageMetric,
  onUsageMetricChange,
  usageWorkspaceId,
  usageWorkspaceOptions,
  onUsageWorkspaceChange,
  onOpenWorkspace,
  onSelectThread,
  language = "en",
}: HomeProps) {
  const isZh = language === "zh";

  const formatCompactNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return "--";
    }
    if (value >= 1_000_000_000) {
      const scaled = value / 1_000_000_000;
      return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}b`;
    }
    if (value >= 1_000_000) {
      const scaled = value / 1_000_000;
      return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}m`;
    }
    if (value >= 1_000) {
      const scaled = value / 1_000;
      return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}k`;
    }
    return String(value);
  };

  const formatCount = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return "--";
    }
    return new Intl.NumberFormat().format(value);
  };

  const formatDuration = (valueMs: number | null | undefined) => {
    if (valueMs === null || valueMs === undefined) {
      return "--";
    }
    const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (totalMinutes > 0) {
      return `${totalMinutes}m`;
    }
    return `${totalSeconds}s`;
  };

  const formatDurationCompact = (valueMs: number | null | undefined) => {
    if (valueMs === null || valueMs === undefined) {
      return "--";
    }
    const totalMinutes = Math.max(0, Math.round(valueMs / 60000));
    if (totalMinutes >= 60) {
      const hours = totalMinutes / 60;
      return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
    }
    if (totalMinutes > 0) {
      return `${totalMinutes}m`;
    }
    const seconds = Math.max(0, Math.round(valueMs / 1000));
    return `${seconds}s`;
  };

  const formatDayLabel = (value: string | null | undefined) => {
    if (!value) {
      return "--";
    }
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
      return value;
    }
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  };

  const workspaceCards = workspaces
    .map((workspace) => {
      const threads = threadsByWorkspace[workspace.id] ?? [];
      const processingCount = threads.filter(
        (thread) => threadStatusById[thread.id]?.isProcessing,
      ).length;
      const unreadCount = threads.filter(
        (thread) => threadStatusById[thread.id]?.hasUnread,
      ).length;
      const reviewingCount = threads.filter(
        (thread) => threadStatusById[thread.id]?.isReviewing,
      ).length;
      const latestUpdatedAt = threads.reduce<number | null>((latest, thread) => {
        if (!thread.updatedAt) {
          return latest;
        }
        return latest === null || thread.updatedAt > latest ? thread.updatedAt : latest;
      }, null);

      return {
        id: workspace.id,
        name: workspace.name,
        connected: workspace.connected,
        kind: workspace.kind ?? "main",
        threadCount: threads.length,
        processingCount,
        unreadCount,
        reviewingCount,
        latestUpdatedAt,
      };
    })
    .sort((a, b) => (b.latestUpdatedAt ?? 0) - (a.latestUpdatedAt ?? 0))
    .slice(0, 6);

  const totalThreads = workspaceCards.reduce(
    (sum, workspace) => sum + workspace.threadCount,
    0,
  );
  const runningNowCount = workspaceCards.reduce(
    (sum, workspace) => sum + workspace.processingCount,
    0,
  );
  const unreadNowCount = workspaceCards.reduce(
    (sum, workspace) => sum + workspace.unreadCount,
    0,
  );
  const activeWorkspace = workspaceCards[0] ?? null;
  const recommendation = activeWorkspace
    ? isZh
      ? `先继续 ${activeWorkspace.name}，这里最近有 ${activeWorkspace.threadCount} 个会话。`
      : `Resume ${activeWorkspace.name} first. It has ${activeWorkspace.threadCount} recent conversations.`
    : isZh
      ? "先添加一个项目，财多多会把最近进展和工作入口整理给你。"
      : "Add your first project and Rich will organize recent progress and next actions for you.";

  const usageTotals = localUsageSnapshot?.totals ?? null;
  const usageDays = localUsageSnapshot?.days ?? [];
  const last7Days = usageDays.slice(-7);
  const last7AgentMs = last7Days.reduce(
    (total, day) => total + (day.agentTimeMs ?? 0),
    0,
  );
  const last30AgentMs = usageDays.reduce(
    (total, day) => total + (day.agentTimeMs ?? 0),
    0,
  );
  const averageDailyAgentMs =
    last7Days.length > 0 ? Math.round(last7AgentMs / last7Days.length) : 0;
  const last7AgentRuns = last7Days.reduce(
    (total, day) => total + (day.agentRuns ?? 0),
    0,
  );
  const peakAgentDay = usageDays.reduce<
    | { day: string; agentTimeMs: number }
    | null
  >((best, day) => {
    const value = day.agentTimeMs ?? 0;
    if (value <= 0) {
      return best;
    }
    if (!best || value > best.agentTimeMs) {
      return { day: day.day, agentTimeMs: value };
    }
    return best;
  }, null);
  const peakAgentDayLabel = peakAgentDay?.day ?? null;
  const peakAgentTimeMs = peakAgentDay?.agentTimeMs ?? 0;
  const maxUsageValue = Math.max(
    1,
    ...last7Days.map((day) =>
      usageMetric === "tokens" ? day.totalTokens : day.agentTimeMs ?? 0,
    ),
  );
  const updatedLabel = localUsageSnapshot
    ? `Updated ${formatRelativeTime(localUsageSnapshot.updatedAt, language)}`
    : null;
  const showUsageSkeleton = isLoadingLocalUsage && !localUsageSnapshot;
  const showUsageEmpty = !isLoadingLocalUsage && !localUsageSnapshot;
  const tokenLabel = "tokens";
  const latestAgentsLabel = isZh ? "最近动态" : "Recent activity";
  const overviewLabel = isZh ? "工作区总览" : "Workspace overview";
  const noActivityTitle = isZh ? "还没有最近动态" : "No recent activity yet";
  const noActivitySubtitle = isZh
    ? "开始一个对话后，这里会显示最新结果和可继续的工作。"
    : "Start a conversation and this space will surface the latest results and resumable work.";
  const topModelsLabel = isZh ? "热门模型" : "Top models";
  const noModelsLabel = isZh ? "暂时还没有模型数据" : "No model data yet";

  return (
    <div className="home-scroll">
      <div className="home">
        <section className="home-hero">
          <div className="home-brand-row">
            <span className="home-brand-pill">Amy Wealth Desk</span>
            <span className="home-brand-persona">
              {isZh ? "财多多 / Rich" : "Caiduoduo / Rich"}
            </span>
          </div>
          <div className="home-title">{isZh ? "财多多" : "Rich"}</div>
          <div className="home-subtitle">
            {isZh
              ? "面向本地项目的智能协作与任务工作台。"
              : "A friendlier workspace for local project collaboration and task orchestration."}
          </div>
          <div className="home-hero-copy">
            {isZh
              ? "先看清项目、最近进展和下一步，再进入具体工作区，不会一打开就被技术面板淹没。"
              : "Start from projects, recent momentum, and next steps, then drop into the workspace when you are ready."}
          </div>
          <div className="home-actions">
            <button
              className="home-button primary"
              onClick={onOpenProject}
              data-tauri-drag-region="false"
            >
              <span className="home-icon" aria-hidden>
                +
              </span>
              {isZh ? "打开项目" : "Open project"}
            </button>
            <button
              className="home-button secondary"
              onClick={onAddWorkspace}
              data-tauri-drag-region="false"
            >
              <span className="home-icon" aria-hidden>
                ·
              </span>
              {isZh ? "添加工作区" : "Add workspace"}
            </button>
          </div>
          <div className="home-recommendation">
            <div className="home-recommendation-label">
              {isZh ? "今日建议动作" : "Suggested next action"}
            </div>
            <div className="home-recommendation-copy">{recommendation}</div>
            <div className="home-recommendation-metrics">
              <span>{isZh ? `工作区 ${workspaces.length}` : `${workspaces.length} workspaces`}</span>
              <span>{isZh ? `会话 ${totalThreads}` : `${totalThreads} conversations`}</span>
              <span>{isZh ? `进行中 ${runningNowCount}` : `${runningNowCount} running`}</span>
              <span>{isZh ? `待查看 ${unreadNowCount}` : `${unreadNowCount} unread`}</span>
            </div>
          </div>
        </section>

        <section className="home-overview">
          <div className="home-latest-header">
            <div className="home-latest-label">{overviewLabel}</div>
            <div className="home-section-meta">
              {isZh ? "先看项目，再进入细节。" : "Review projects before diving into details."}
            </div>
          </div>
          {workspaceCards.length > 0 ? (
            <div className="home-overview-grid">
              {workspaceCards.map((workspace) => (
                <button
                  className="home-overview-card"
                  key={workspace.id}
                  onClick={() => onOpenWorkspace(workspace.id)}
                  type="button"
                >
                  <div className="home-overview-card-header">
                    <div>
                      <div className="home-overview-title">{workspace.name}</div>
                      <div className="home-overview-meta">
                        <span
                          className={`home-overview-status ${
                            workspace.connected ? "connected" : "disconnected"
                          }`}
                        >
                          {workspace.connected
                            ? isZh
                              ? "已连接"
                              : "Connected"
                            : isZh
                              ? "待连接"
                              : "Needs connection"}
                        </span>
                        <span className="home-overview-kind">
                          {workspace.kind === "worktree"
                            ? isZh
                              ? "工作树"
                              : "Worktree"
                            : isZh
                              ? "主工作区"
                              : "Primary"}
                        </span>
                      </div>
                    </div>
                    <div className="home-overview-updated">
                      {workspace.latestUpdatedAt
                        ? formatRelativeTime(workspace.latestUpdatedAt, language)
                        : isZh
                          ? "暂无活动"
                          : "No activity"}
                    </div>
                  </div>
                  <div className="home-overview-stats">
                    <div>
                      <span className="home-overview-stat-value">{workspace.threadCount}</span>
                      <span className="home-overview-stat-label">
                        {isZh ? "会话" : "Conversations"}
                      </span>
                    </div>
                    <div>
                      <span className="home-overview-stat-value">{workspace.processingCount}</span>
                      <span className="home-overview-stat-label">
                        {isZh ? "进行中" : "Running"}
                      </span>
                    </div>
                    <div>
                      <span className="home-overview-stat-value">{workspace.unreadCount}</span>
                      <span className="home-overview-stat-label">
                        {isZh ? "待查看" : "Unread"}
                      </span>
                    </div>
                    <div>
                      <span className="home-overview-stat-value">{workspace.reviewingCount}</span>
                      <span className="home-overview-stat-label">Review</span>
                    </div>
                  </div>
                  <div className="home-overview-footer">
                    {workspace.reviewingCount > 0
                      ? isZh
                        ? `${workspace.reviewingCount} 个会话正在 Review`
                        : `${workspace.reviewingCount} conversations in review`
                      : isZh
                        ? "点击进入工作区"
                        : "Open workspace"}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="home-overview-empty">
              <div className="home-latest-empty-title">
                {isZh ? "先把第一个项目接进来" : "Bring in your first project"}
              </div>
              <div className="home-latest-empty-subtitle">
                {isZh
                  ? "财多多会在这里整理项目入口、会话密度和最近节奏。"
                  : "Rich will organize project entry points, conversation density, and recent rhythm here."}
              </div>
            </div>
          )}
        </section>

        <section className="home-latest">
          <div className="home-latest-header">
            <div className="home-latest-label">{latestAgentsLabel}</div>
            <div className="home-section-meta">
              {isZh ? "优先展示最近值得继续的工作。" : "Recent momentum, designed for quick resumption."}
            </div>
          </div>
          {latestAgentRuns.length > 0 ? (
            <div className="home-latest-grid home-latest-timeline">
              {latestAgentRuns.map((run) => (
                <button
                  className="home-latest-card home-latest-card-button"
                  key={run.threadId}
                  onClick={() => onSelectThread(run.workspaceId, run.threadId)}
                  type="button"
                >
                  <div className="home-latest-card-header">
                    <div className="home-latest-project">
                      <span className="home-latest-project-name">{run.projectName}</span>
                      {run.groupName && (
                        <span className="home-latest-group">{run.groupName}</span>
                      )}
                    </div>
                    <div className="home-latest-time">
                      {formatRelativeTime(run.timestamp, language)}
                    </div>
                  </div>
                  <div className="home-latest-message">
                    {run.message.trim() || (isZh ? "智能体已回复。" : "Agent replied.")}
                  </div>
                  <div className="home-latest-footer">
                    <span className="home-latest-resume">
                      {isZh ? "继续这项工作" : "Resume this work"}
                    </span>
                    {run.isProcessing && (
                      <div className="home-latest-status">{isZh ? "进行中" : "Running"}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : isLoadingLatestAgents ? (
            <div className="home-latest-grid home-latest-grid-loading" aria-label="Loading agents">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="home-latest-card home-latest-card-skeleton" key={index}>
                  <div className="home-latest-card-header">
                    <span className="home-latest-skeleton home-latest-skeleton-title" />
                    <span className="home-latest-skeleton home-latest-skeleton-time" />
                  </div>
                  <span className="home-latest-skeleton home-latest-skeleton-line" />
                  <span className="home-latest-skeleton home-latest-skeleton-line short" />
                </div>
              ))}
            </div>
          ) : (
            <div className="home-latest-empty">
              <div className="home-latest-empty-title">{noActivityTitle}</div>
              <div className="home-latest-empty-subtitle">{noActivitySubtitle}</div>
            </div>
          )}
        </section>

        <section className="home-usage">
          <div className="home-section-header">
            <div>
              <div className="home-section-title">
                {isZh ? "趋势洞察" : "Trend insight"}
              </div>
              <div className="home-usage-intro">
                {isZh
                  ? "把使用量放在辅助位，帮助你判断节奏和成本。"
                  : "Usage stays secondary here so your next action remains clear."}
              </div>
            </div>
            <div className="home-section-meta-row">
              {updatedLabel && <div className="home-section-meta">{updatedLabel}</div>}
              <button
                type="button"
                className={
                  isLoadingLocalUsage
                    ? "home-usage-refresh is-loading"
                    : "home-usage-refresh"
                }
                onClick={onRefreshLocalUsage}
                disabled={isLoadingLocalUsage}
                aria-label="Refresh usage"
                title="Refresh usage"
              >
                <RefreshCw
                  className={
                    isLoadingLocalUsage
                      ? "home-usage-refresh-icon spinning"
                      : "home-usage-refresh-icon"
                  }
                  aria-hidden
                />
              </button>
            </div>
          </div>
          <div className="home-usage-controls">
            <div className="home-usage-control-group">
              <span className="home-usage-control-label">Workspace</span>
              <div className="home-usage-select-wrap">
                <select
                  className="home-usage-select"
                  value={usageWorkspaceId ?? ""}
                  onChange={(event) =>
                    onUsageWorkspaceChange(event.target.value || null)
                  }
                  disabled={usageWorkspaceOptions.length === 0}
                >
                  <option value="">{isZh ? "全部工作区" : "All workspaces"}</option>
                  {usageWorkspaceOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="home-usage-control-group">
              <span className="home-usage-control-label">{isZh ? "视图" : "View"}</span>
              <div className="home-usage-toggle" role="group" aria-label="Usage view">
                <button
                  type="button"
                  className={
                    usageMetric === "tokens"
                      ? "home-usage-toggle-button is-active"
                      : "home-usage-toggle-button"
                  }
                  onClick={() => onUsageMetricChange("tokens")}
                  aria-pressed={usageMetric === "tokens"}
                >
                  Tokens
                </button>
                <button
                  type="button"
                  className={
                    usageMetric === "time"
                      ? "home-usage-toggle-button is-active"
                      : "home-usage-toggle-button"
                  }
                  onClick={() => onUsageMetricChange("time")}
                  aria-pressed={usageMetric === "time"}
                >
                  {isZh ? "时长" : "Time"}
                </button>
              </div>
            </div>
          </div>
          {showUsageSkeleton ? (
            <div className="home-usage-skeleton">
              <div className="home-usage-grid">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="home-usage-card" key={index}>
                    <span className="home-latest-skeleton home-usage-skeleton-label" />
                    <span className="home-latest-skeleton home-usage-skeleton-value" />
                  </div>
                ))}
              </div>
              <div className="home-usage-chart-card">
                <span className="home-latest-skeleton home-usage-skeleton-chart" />
              </div>
            </div>
          ) : showUsageEmpty ? (
            <div className="home-usage-empty">
              <div className="home-usage-empty-title">
                {isZh ? "暂时还没有使用数据" : "No usage data yet"}
              </div>
              <div className="home-usage-empty-subtitle">
                {isZh
                  ? "开始一次智能体会话后，这里会积累本地使用趋势。"
                  : "Run an agent session to start tracking local usage."}
              </div>
              {localUsageError && (
                <div className="home-usage-error">{localUsageError}</div>
              )}
            </div>
          ) : (
            <>
              <div className="home-usage-grid">
                {usageMetric === "tokens" ? (
                  <>
                    <div className="home-usage-card">
                      <div className="home-usage-label">
                        {isZh ? "最近 7 天" : "Last 7 days"}
                      </div>
                      <div className="home-usage-value">
                        <span className="home-usage-number">
                          {formatCompactNumber(usageTotals?.last7DaysTokens)}
                        </span>
                        <span className="home-usage-suffix">{tokenLabel}</span>
                      </div>
                      <div className="home-usage-caption">
                        {isZh ? "日均" : "Avg"}{" "}
                        {formatCompactNumber(usageTotals?.averageDailyTokens)} / {isZh ? "天" : "day"}
                      </div>
                    </div>
                    <div className="home-usage-card">
                      <div className="home-usage-label">
                        {isZh ? "最近 30 天" : "Last 30 days"}
                      </div>
                      <div className="home-usage-value">
                        <span className="home-usage-number">
                          {formatCompactNumber(usageTotals?.last30DaysTokens)}
                        </span>
                        <span className="home-usage-suffix">{tokenLabel}</span>
                      </div>
                      <div className="home-usage-caption">
                        {isZh ? "总量" : "Total"} {formatCount(usageTotals?.last30DaysTokens)}
                      </div>
                    </div>
                    <div className="home-usage-card">
                      <div className="home-usage-label">
                        {isZh ? "缓存命中率" : "Cache hit rate"}
                      </div>
                      <div className="home-usage-value">
                        <span className="home-usage-number">
                          {usageTotals
                            ? `${usageTotals.cacheHitRatePercent.toFixed(1)}%`
                            : "--"}
                        </span>
                      </div>
                      <div className="home-usage-caption">
                        {isZh ? "最近 7 天" : "Last 7 days"}
                      </div>
                    </div>
                    <div className="home-usage-card">
                      <div className="home-usage-label">{isZh ? "峰值日" : "Peak day"}</div>
                      <div className="home-usage-value">
                        <span className="home-usage-number">
                          {formatDayLabel(usageTotals?.peakDay)}
                        </span>
                      </div>
                      <div className="home-usage-caption">
                        {formatCompactNumber(usageTotals?.peakDayTokens)} {tokenLabel}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="home-usage-card">
                      <div className="home-usage-label">
                        {isZh ? "最近 7 天" : "Last 7 days"}
                      </div>
                      <div className="home-usage-value">
                        <span className="home-usage-number">
                          {formatDurationCompact(last7AgentMs)}
                        </span>
                        <span className="home-usage-suffix">
                          {isZh ? "智能体时长" : "agent time"}
                        </span>
                      </div>
                      <div className="home-usage-caption">
                        {isZh ? "日均" : "Avg"} {formatDurationCompact(averageDailyAgentMs)} / {isZh ? "天" : "day"}
                      </div>
                    </div>
                    <div className="home-usage-card">
                      <div className="home-usage-label">
                        {isZh ? "最近 30 天" : "Last 30 days"}
                      </div>
                      <div className="home-usage-value">
                        <span className="home-usage-number">
                          {formatDurationCompact(last30AgentMs)}
                        </span>
                        <span className="home-usage-suffix">
                          {isZh ? "智能体时长" : "agent time"}
                        </span>
                      </div>
                      <div className="home-usage-caption">
                        {isZh ? "总计" : "Total"} {formatDuration(last30AgentMs)}
                      </div>
                    </div>
                    <div className="home-usage-card">
                      <div className="home-usage-label">{isZh ? "运行次数" : "Runs"}</div>
                      <div className="home-usage-value">
                        <span className="home-usage-number">
                          {formatCount(last7AgentRuns)}
                        </span>
                        <span className="home-usage-suffix">
                          {isZh ? "次" : "runs"}
                        </span>
                      </div>
                      <div className="home-usage-caption">
                        {isZh ? "最近 7 天" : "Last 7 days"}
                      </div>
                    </div>
                    <div className="home-usage-card">
                      <div className="home-usage-label">{isZh ? "峰值日" : "Peak day"}</div>
                      <div className="home-usage-value">
                        <span className="home-usage-number">
                          {formatDayLabel(peakAgentDayLabel)}
                        </span>
                      </div>
                      <div className="home-usage-caption">
                        {formatDurationCompact(peakAgentTimeMs)} {isZh ? "智能体时长" : "agent time"}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="home-usage-chart-card">
                <div className="home-usage-chart">
                  {last7Days.map((day) => {
                    const value =
                      usageMetric === "tokens" ? day.totalTokens : day.agentTimeMs ?? 0;
                    const height = Math.max(6, Math.round((value / maxUsageValue) * 100));
                    const tooltip =
                      usageMetric === "tokens"
                        ? `${formatDayLabel(day.day)} · ${formatCount(day.totalTokens)} ${tokenLabel}`
                        : `${formatDayLabel(day.day)} · ${formatDuration(day.agentTimeMs ?? 0)} ${
                            isZh ? "智能体时长" : "agent time"
                          }`;
                    return (
                      <div
                        className="home-usage-bar"
                        key={day.day}
                        data-value={tooltip}
                      >
                        <span
                          className="home-usage-bar-fill"
                          style={{ height: `${height}%` }}
                        />
                        <span className="home-usage-bar-label">
                          {formatDayLabel(day.day)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="home-usage-models">
                <div className="home-usage-models-label">
                  {topModelsLabel}
                  {usageMetric === "time" && (
                    <span className="home-usage-models-hint">Tokens</span>
                  )}
                </div>
                <div className="home-usage-models-list">
                  {localUsageSnapshot?.topModels?.length ? (
                    localUsageSnapshot.topModels.map((model) => (
                      <span
                        className="home-usage-model-chip"
                        key={model.model}
                        title={`${model.model}: ${formatCount(model.tokens)} ${tokenLabel}`}
                      >
                        {model.model}
                        <span className="home-usage-model-share">
                          {model.sharePercent.toFixed(1)}%
                        </span>
                      </span>
                    ))
                  ) : (
                    <span className="home-usage-model-empty">{noModelsLabel}</span>
                  )}
                </div>
                {localUsageError && (
                  <div className="home-usage-error">{localUsageError}</div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
