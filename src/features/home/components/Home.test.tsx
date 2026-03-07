// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

const baseProps = {
  onOpenProject: vi.fn(),
  onAddWorkspace: vi.fn(),
  workspaces: [],
  threadsByWorkspace: {},
  threadStatusById: {},
  latestAgentRuns: [],
  isLoadingLatestAgents: false,
  localUsageSnapshot: null,
  isLoadingLocalUsage: false,
  localUsageError: null,
  onRefreshLocalUsage: vi.fn(),
  usageMetric: "tokens" as const,
  onUsageMetricChange: vi.fn(),
  usageWorkspaceId: null,
  usageWorkspaceOptions: [],
  onUsageWorkspaceChange: vi.fn(),
  onOpenWorkspace: vi.fn(),
  onSelectThread: vi.fn(),
};

describe("Home", () => {
  it("renders latest activity and lets you open a thread", () => {
    const onSelectThread = vi.fn();
    render(
      <Home
        {...baseProps}
        latestAgentRuns={[
          {
            message: "Ship the dashboard refresh",
            timestamp: Date.now(),
            projectName: "Revenue Hub",
            groupName: "Frontend",
            workspaceId: "workspace-1",
            threadId: "thread-1",
            isProcessing: true,
          },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    expect(screen.getByText("Recent activity")).toBeTruthy();
    expect(screen.getByText("Rich", { selector: ".home-title" })).toBeTruthy();
    expect(screen.getByText("Frontend")).toBeTruthy();
    const card = screen.getByRole("button", { name: /ship the dashboard refresh/i });
    fireEvent.click(card);
    expect(onSelectThread).toHaveBeenCalledWith("workspace-1", "thread-1");
    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("shows the empty state when there is no recent activity", () => {
    render(<Home {...baseProps} />);

    expect(screen.getByText("No recent activity yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Start a conversation and this space will surface the latest results and resumable work.",
      ),
    ).toBeTruthy();
  });

  it("renders workspace overview cards and opens a workspace", () => {
    const onOpenWorkspace = vi.fn();
    render(
      <Home
        {...baseProps}
        onOpenWorkspace={onOpenWorkspace}
        workspaces={[
          {
            id: "ws-1",
            name: "Revenue Hub",
            path: "/tmp/revenue",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ]}
        threadsByWorkspace={{
          "ws-1": [{ id: "thread-1", name: "Q1 review", updatedAt: Date.now() }],
        }}
      />,
    );

    expect(screen.getAllByText("Workspace overview").length).toBeGreaterThan(0);
    const overviewButtons = screen.getAllByRole("button", { name: /revenue hub/i });
    fireEvent.click(overviewButtons[overviewButtons.length - 1] as HTMLButtonElement);
    expect(onOpenWorkspace).toHaveBeenCalledWith("ws-1");
  });

  it("renders usage cards in time mode", () => {
    render(
      <Home
        {...baseProps}
        usageMetric="time"
        localUsageSnapshot={{
          updatedAt: Date.now(),
          days: [
            {
              day: "2026-01-20",
              inputTokens: 10,
              cachedInputTokens: 0,
              outputTokens: 5,
              totalTokens: 15,
              agentTimeMs: 120000,
              agentRuns: 2,
            },
          ],
          totals: {
            last7DaysTokens: 15,
            last30DaysTokens: 15,
            averageDailyTokens: 15,
            cacheHitRatePercent: 0,
            peakDay: "2026-01-20",
            peakDayTokens: 15,
          },
          topModels: [],
        }}
      />,
    );

    expect(screen.getAllByText("agent time").length).toBeGreaterThan(0);
    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.getByText("Peak day")).toBeTruthy();
  });
});
