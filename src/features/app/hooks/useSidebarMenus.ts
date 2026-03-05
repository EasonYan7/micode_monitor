import { useCallback, type MouseEvent } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { WorkspaceInfo } from "../../../types";
import { pushErrorToast } from "../../../services/toasts";
import { getFileManagerName, getShowInFileManagerLabel } from "../utils/fileManager";

type SidebarMenuHandlers = {
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  onPinThread: (workspaceId: string, threadId: string) => void;
  onUnpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onClearWorkspaceHistory: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
  language?: "en" | "zh";
};

export function useSidebarMenus({
  onDeleteThread,
  onSyncThread: _onSyncThread,
  onPinThread,
  onUnpinThread,
  isThreadPinned,
  onRenameThread,
  onReloadWorkspaceThreads,
  onDeleteWorkspace,
  onClearWorkspaceHistory,
  onDeleteWorktree,
  language = "en",
}: SidebarMenuHandlers) {
  const t = useCallback(
    (en: string, zh: string) => (language === "zh" ? zh : en),
    [language],
  );

  const showThreadMenu = useCallback(
    async (
      event: MouseEvent,
      workspaceId: string,
      threadId: string,
      canPin: boolean,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const renameItem = await MenuItem.new({
        text: t("Rename", "重命名"),
        action: () => onRenameThread(workspaceId, threadId),
      });
      const deleteConversationItem = await MenuItem.new({
        text: t("Delete Conversation", "删除会话"),
        action: () => onDeleteThread(workspaceId, threadId),
      });
      const copyItem = await MenuItem.new({
        text: t("Copy ID", "复制 ID"),
        action: async () => {
          try {
            await navigator.clipboard.writeText(threadId);
          } catch {
            // Clipboard failures are non-fatal here.
          }
        },
      });
      const items = [renameItem];
      if (canPin) {
        const isPinned = isThreadPinned(workspaceId, threadId);
        items.push(
          await MenuItem.new({
            text: isPinned ? t("Unpin", "取消置顶") : t("Pin", "置顶"),
            action: () => {
              if (isPinned) {
                onUnpinThread(workspaceId, threadId);
              } else {
                onPinThread(workspaceId, threadId);
              }
            },
          }),
        );
      }
      items.push(copyItem, deleteConversationItem);
      const menu = await Menu.new({ items });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [
      isThreadPinned,
      onDeleteThread,
      onPinThread,
      onRenameThread,
      onUnpinThread,
      t,
    ],
  );

  const showWorkspaceMenu = useCallback(
    async (event: MouseEvent, workspaceId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const reloadItem = await MenuItem.new({
        text: "Reload threads",
        action: () => onReloadWorkspaceThreads(workspaceId),
      });
      const deleteItem = await MenuItem.new({
        text: language === "zh" ? "删除项目" : "Delete",
        action: () => onDeleteWorkspace(workspaceId),
      });
      const clearHistoryItem = await MenuItem.new({
        text: language === "zh" ? "清空项目对话记录" : "Clear conversation history",
        action: () => onClearWorkspaceHistory(workspaceId),
      });
      const menu = await Menu.new({ items: [reloadItem, clearHistoryItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [language, onClearWorkspaceHistory, onReloadWorkspaceThreads, onDeleteWorkspace],
  );

  const showWorktreeMenu = useCallback(
    async (event: MouseEvent, worktree: WorkspaceInfo) => {
      event.preventDefault();
      event.stopPropagation();
      const reloadItem = await MenuItem.new({
        text: "Reload threads",
        action: () => onReloadWorkspaceThreads(worktree.id),
      });
      const revealItem = await MenuItem.new({
        text: getShowInFileManagerLabel(),
        action: async () => {
          if (!worktree.path) {
            return;
          }
          try {
            const { revealItemInDir } = await import(
              "@tauri-apps/plugin-opener"
            );
            await revealItemInDir(worktree.path);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            pushErrorToast({
              title: `Couldn't show worktree in ${getFileManagerName()}`,
              message,
            });
            console.warn("Failed to reveal worktree", {
              message,
              workspaceId: worktree.id,
              path: worktree.path,
            });
          }
        },
      });
      const deleteItem = await MenuItem.new({
        text: language === "zh" ? "删除工作树" : "Delete worktree",
        action: () => onDeleteWorktree(worktree.id),
      });
      const clearHistoryItem = await MenuItem.new({
        text: language === "zh" ? "清空对话记录" : "Clear conversation history",
        action: () => onClearWorkspaceHistory(worktree.id),
      });
      const menu = await Menu.new({
        items: [reloadItem, revealItem, clearHistoryItem, deleteItem],
      });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [language, onClearWorkspaceHistory, onReloadWorkspaceThreads, onDeleteWorktree],
  );

  return { showThreadMenu, showWorkspaceMenu, showWorktreeMenu };
}
