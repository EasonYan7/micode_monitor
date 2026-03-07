/** @vitest-environment jsdom */
import type { MouseEvent as ReactMouseEvent } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceInfo } from "../../../types";
import { useSidebarMenus } from "./useSidebarMenus";
import { getShowInFileManagerLabel } from "../utils/fileManager";

const menuNew = vi.hoisted(() =>
  vi.fn(async ({ items }) => ({ popup: vi.fn(), items })),
);
const menuItemNew = vi.hoisted(() => vi.fn(async (options) => options));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: menuNew },
  MenuItem: { new: menuItemNew },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ scaleFactor: () => 1 }),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class LogicalPosition {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
}));

const revealItemInDir = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: (...args: unknown[]) => revealItemInDir(...args),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

describe("useSidebarMenus", () => {
  it("localizes thread menu in zh and omits archive/sync entries", async () => {
    const { result } = renderHook(() =>
      useSidebarMenus({
        onDeleteThread: vi.fn(),
        onSyncThread: vi.fn(),
        onPinThread: vi.fn(),
        onUnpinThread: vi.fn(),
        isThreadPinned: vi.fn(() => false),
        onRenameThread: vi.fn(),
        onReloadWorkspaceThreads: vi.fn(),
        onDeleteWorkspace: vi.fn(),
        onClearWorkspaceHistory: vi.fn(),
        onDeleteWorktree: vi.fn(),
        language: "zh",
      }),
    );

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as ReactMouseEvent;

    await result.current.showThreadMenu(event, "ws-1", "thread-1", true);

    const menuArgs = menuNew.mock.calls[menuNew.mock.calls.length - 1]?.[0];
    const labels = menuArgs.items.map((item: { text: string }) => item.text);

    expect(labels).toContain("重命名");
    expect(labels).toContain("置顶");
    expect(labels).toContain("复制 ID");
    expect(labels).toContain("删除会话");
    expect(labels).not.toContain("归档");
    expect(labels).not.toContain("Sync from server");
  });

  it("adds a show in finder option for worktrees", async () => {
    const onDeleteThread = vi.fn();
    const onSyncThread = vi.fn();
    const onPinThread = vi.fn();
    const onUnpinThread = vi.fn();
    const isThreadPinned = vi.fn(() => false);
    const onRenameThread = vi.fn();
    const onReloadWorkspaceThreads = vi.fn();
    const onDeleteWorkspace = vi.fn();
    const onClearWorkspaceHistory = vi.fn();
    const onDeleteWorktree = vi.fn();

    const { result } = renderHook(() =>
      useSidebarMenus({
        onDeleteThread,
        onSyncThread,
        onPinThread,
        onUnpinThread,
        isThreadPinned,
        onRenameThread,
        onReloadWorkspaceThreads,
        onDeleteWorkspace,
        onClearWorkspaceHistory,
        onDeleteWorktree,
      }),
    );

    const worktree: WorkspaceInfo = {
      id: "worktree-1",
      name: "feature/test",
      path: "/tmp/worktree-1",
      kind: "worktree",
      connected: true,
      settings: {
        sidebarCollapsed: false,
        worktreeSetupScript: "",
      },
      worktree: { branch: "feature/test" },
    };

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 12,
      clientY: 34,
    } as unknown as ReactMouseEvent;

    await result.current.showWorktreeMenu(event, worktree);

    const menuArgs = menuNew.mock.calls[menuNew.mock.calls.length - 1]?.[0];
    const revealItem = menuArgs.items.find(
      (item: { text: string }) => item.text === getShowInFileManagerLabel(),
    );

    expect(revealItem).toBeDefined();
    await revealItem.action();
    expect(revealItemInDir).toHaveBeenCalledWith("/tmp/worktree-1");
  });
});
