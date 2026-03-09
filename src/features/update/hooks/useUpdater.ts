import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { getUpdaterContext } from "../../../services/tauri";
import type { DebugEntry, UpdaterContext } from "../../../types";

const RELEASES_URL = "https://github.com/EasonYan7/micode_monitor/releases/latest";

type UpdateStage =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "latest"
  | "error";

type UpdateProgress = {
  totalBytes?: number;
  downloadedBytes: number;
};

export type UpdateState = {
  stage: UpdateStage;
  version?: string;
  progress?: UpdateProgress;
  error?: string;
  updaterContext?: UpdaterContext | null;
};

type UseUpdaterOptions = {
  enabled?: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

export function useUpdater({ enabled = true, onDebug }: UseUpdaterOptions) {
  const [state, setState] = useState<UpdateState>({ stage: "idle" });
  const updateRef = useRef<Update | null>(null);
  const updaterContextRef = useRef<UpdaterContext | null>(null);
  const latestTimeoutRef = useRef<number | null>(null);
  const latestToastDurationMs = 2000;

  const reportUpdaterError = useCallback(
    (error: unknown) => {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      onDebug?.({
        id: `${Date.now()}-client-updater-error`,
        timestamp: Date.now(),
        source: "error",
        label: "updater/error",
        payload: message,
      });
      return message;
    },
    [onDebug],
  );

  const buildManualInstallMessage = useCallback((context: UpdaterContext) => {
    const modeLabel =
      context.launchMode === "development" ? "development build" : "standalone EXE";
    return `Auto-update only replaces the installed app. You're currently running a ${modeLabel} at ${context.executablePath}. Install or reopen the app from the setup-based location, then update from there.`;
  }, []);

  const loadUpdaterContext = useCallback(async () => {
    if (!isTauri()) {
      updaterContextRef.current = null;
      return null;
    }
    try {
      const context = await getUpdaterContext();
      updaterContextRef.current = context;
      return context;
    } catch (error) {
      reportUpdaterError(error);
      updaterContextRef.current = null;
      return null;
    }
  }, [reportUpdaterError]);

  const clearLatestTimeout = useCallback(() => {
    if (latestTimeoutRef.current !== null) {
      window.clearTimeout(latestTimeoutRef.current);
      latestTimeoutRef.current = null;
    }
  }, []);

  const resetToIdle = useCallback(async () => {
    clearLatestTimeout();
    const update = updateRef.current;
    updateRef.current = null;
    setState({ stage: "idle" });
    await update?.close();
  }, [clearLatestTimeout]);

  const checkForUpdates = useCallback(async (options?: { announceNoUpdate?: boolean; showError?: boolean }) => {
    let update: Awaited<ReturnType<typeof check>> | null = null;
    const showError =
      options?.showError ?? options?.announceNoUpdate ?? false;
    const previousUpdate = updateRef.current;
    updateRef.current = null;
    try {
      await previousUpdate?.close();
      clearLatestTimeout();
      setState({ stage: "checking" });
      update = await check();
      if (!update) {
        if (options?.announceNoUpdate) {
          setState({ stage: "latest" });
          latestTimeoutRef.current = window.setTimeout(() => {
            latestTimeoutRef.current = null;
            setState({ stage: "idle" });
          }, latestToastDurationMs);
        } else {
          setState({ stage: "idle" });
        }
        return;
      }

      const updaterContext = await loadUpdaterContext();
      updateRef.current = update;
      setState({
        stage: "available",
        version: update.version,
        updaterContext,
      });
    } catch (error) {
      const message = reportUpdaterError(error);
      if (showError) {
        setState({ stage: "error", error: message });
      } else {
        setState({ stage: "idle" });
      }
    } finally {
      if (!updateRef.current) {
        await update?.close();
      }
    }
  }, [clearLatestTimeout, loadUpdaterContext, reportUpdaterError]);

  const startUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) {
      await checkForUpdates({ showError: true });
      return;
    }

    const updaterContext = updaterContextRef.current ?? (await loadUpdaterContext());
    if (updaterContext && !updaterContext.isManagedInstall) {
      setState((prev) => ({
        ...prev,
        stage: "error",
        version: prev.version ?? update.version,
        updaterContext,
        error: buildManualInstallMessage(updaterContext),
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      stage: "downloading",
      progress: { totalBytes: undefined, downloadedBytes: 0 },
      error: undefined,
    }));

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setState((prev) => ({
            ...prev,
            progress: {
              totalBytes: event.data.contentLength,
              downloadedBytes: 0,
            },
          }));
          return;
        }

        if (event.event === "Progress") {
          setState((prev) => ({
            ...prev,
            progress: {
              totalBytes: prev.progress?.totalBytes,
              downloadedBytes:
                (prev.progress?.downloadedBytes ?? 0) + event.data.chunkLength,
            },
          }));
          return;
        }

        if (event.event === "Finished") {
          setState((prev) => ({
            ...prev,
            stage: "installing",
          }));
        }
      });

      setState((prev) => ({
        ...prev,
        stage: "restarting",
      }));
      await relaunch();
    } catch (error) {
      const message = reportUpdaterError(error);
      setState((prev) => ({
        ...prev,
        stage: "error",
        error: message,
      }));
    }
  }, [buildManualInstallMessage, checkForUpdates, loadUpdaterContext, reportUpdaterError]);

  const openLatestReleasePage = useCallback(async () => {
    await openUrl(RELEASES_URL);
  }, []);

  useEffect(() => {
    if (!enabled || import.meta.env.DEV || !isTauri()) {
      return;
    }
    void checkForUpdates();
  }, [checkForUpdates, enabled]);

  useEffect(() => {
    return () => {
      clearLatestTimeout();
    };
  }, [clearLatestTimeout]);

  return {
    state,
    startUpdate,
    checkForUpdates,
    dismiss: resetToIdle,
    openLatestReleasePage,
  };
}
