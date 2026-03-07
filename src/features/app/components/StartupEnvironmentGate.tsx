import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  environmentCheckStartup,
  environmentGetCachedStatus,
  environmentInstallDependency,
  environmentRetryCheck,
  getAppSettings,
} from "../../../services/tauri";
import type {
  AppSettings,
  StartupEnvironmentCheck,
  StartupEnvironmentStatus,
  UiLanguage,
} from "../../../types";

type StartupEnvironmentGateProps = {
  children: ReactNode;
};

type GatePhase =
  | "loading"
  | "checking"
  | "installing"
  | "manual_action_required"
  | "finishing"
  | "ready";

const DEFAULT_LANGUAGE: UiLanguage = "zh";
const AUTO_START_DELAY_MS = 200;
const SETTINGS_BOOT_TIMEOUT_MS = 1500;
const FINISH_DELAY_MS = 900;
const STARTUP_GATE_COMPLETED_KEY = "caiduoduo.startupGateCompleted.v1";
const REQUIRED_CHECKS = [
  { id: "node", label: "Node.js" },
  { id: "micode", label: "MiCode CLI" },
  { id: "appServer", label: "ACP app-server" },
  { id: "python", label: "Python" },
] as const;
const REQUIRED_CHECK_IDS = new Set<string>(REQUIRED_CHECKS.map((check) => check.id));

function hasCompletedStartupGate() {
  try {
    return window.localStorage.getItem(STARTUP_GATE_COMPLETED_KEY) === "1";
  } catch {
    return false;
  }
}

function markStartupGateCompleted() {
  try {
    window.localStorage.setItem(STARTUP_GATE_COMPLETED_KEY, "1");
  } catch {
    // Ignore storage failures and continue unlocking the app.
  }
}

function isCheckReady(check: StartupEnvironmentCheck) {
  return check.status === "ready";
}

function firstBlockingCheck(status: StartupEnvironmentStatus | null) {
  return status?.checks.find((check) => check.required && !isCheckReady(check)) ?? null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(fallback);
    }, timeoutMs);

    void promise
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export function StartupEnvironmentGate({
  children,
}: StartupEnvironmentGateProps) {
  const [phase, setPhase] = useState<GatePhase>("loading");
  const [language, setLanguage] = useState<UiLanguage>(DEFAULT_LANGUAGE);
  const [status, setStatus] = useState<StartupEnvironmentStatus | null>(null);
  const [busyDependencyId, setBusyDependencyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const attemptedRef = useRef(new Set<string>());
  const activeRunRef = useRef(0);
  const loadingStartedRef = useRef(false);
  const autoCheckStartedRef = useRef(false);
  const settingsRef = useRef<
    Pick<AppSettings, "agentBin" | "micodeBin" | "agentArgs" | "micodeArgs">
  >({
    agentBin: null,
    micodeBin: null,
    agentArgs: null,
    micodeArgs: null,
  });

  const t = useCallback(
    (en: string, zh: string) => (language === "zh" ? zh : en),
    [language],
  );

  const markStatusNote = useCallback(
    (en: string, zh: string) => {
      const time = new Date().toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      setStatusNote(`${time} ${language === "zh" ? zh : en}`);
    },
    [language],
  );

  const micodeBin = settingsRef.current.agentBin ?? settingsRef.current.micodeBin ?? null;
  const micodeArgs = settingsRef.current.agentArgs ?? settingsRef.current.micodeArgs ?? null;

  const driveFlow = useCallback(
    async (
      nextStatus: StartupEnvironmentStatus,
      mode: "auto" | "manual",
      runId: number,
    ) => {
      if (activeRunRef.current !== runId) {
        return;
      }

      setStatus(nextStatus);
      setActionError(null);

      if (nextStatus.canProceed) {
        markStartupGateCompleted();
        setBusyDependencyId(null);
        setPhase("finishing");
        markStatusNote(
          "All required dependencies are ready. Entering the app.",
          "所有必需依赖已就绪，正在进入应用。",
        );
        window.setTimeout(() => {
          if (activeRunRef.current !== runId) {
            return;
          }
          setPhase("ready");
        }, FINISH_DELAY_MS);
        return;
      }

      const nextCheck = firstBlockingCheck(nextStatus);
      if (
        mode === "auto" &&
        nextCheck?.canAutoInstall &&
        !attemptedRef.current.has(nextCheck.id)
      ) {
        attemptedRef.current.add(nextCheck.id);
        setBusyDependencyId(nextCheck.id);
        setPhase("installing");
        markStatusNote(
          `Installing ${nextCheck.label} and verifying again.`,
          `正在安装 ${nextCheck.label} 并重新验证。`,
        );
        try {
          const installedStatus = await environmentInstallDependency(
            nextCheck.id,
            micodeBin,
            micodeArgs,
          );
          await driveFlow(installedStatus, "auto", runId);
          return;
        } catch (error) {
          if (activeRunRef.current !== runId) {
            return;
          }
          setActionError(error instanceof Error ? error.message : String(error));
          setPhase("manual_action_required");
          markStatusNote(
            `${nextCheck.label} still needs manual action.`,
            `${nextCheck.label} 仍需要手动处理。`,
          );
          return;
        }
      }

      setBusyDependencyId(null);
      if (nextCheck) {
        markStatusNote(
          `Stopped at ${nextCheck.label}. Review the details below.`,
          `当前停在 ${nextCheck.label}，请查看下方详情。`,
        );
      }
      setPhase("manual_action_required");
    },
    [markStatusNote, micodeArgs, micodeBin],
  );

  const runStartupCheck = useCallback(
    async (mode: "auto" | "manual") => {
      const runId = Date.now();
      activeRunRef.current = runId;
      autoCheckStartedRef.current = true;
      if (mode === "manual") {
        attemptedRef.current = new Set();
      }
      setBusyDependencyId(null);
      setActionError(null);
      setPhase("checking");
      markStatusNote(
        "Starting dependency checks automatically.",
        "正在自动开始依赖检查。",
      );

      try {
        const nextStatus =
          mode === "manual"
            ? await environmentRetryCheck(micodeBin, micodeArgs)
            : await environmentCheckStartup(micodeBin, micodeArgs);
        await driveFlow(nextStatus, mode, runId);
      } catch (error) {
        if (activeRunRef.current !== runId) {
          return;
        }
        setActionError(error instanceof Error ? error.message : String(error));
        setPhase("manual_action_required");
        markStatusNote(
          "Dependency check failed before completion.",
          "依赖检查在完成前失败了。",
        );
      }
    },
    [driveFlow, markStatusNote, micodeArgs, micodeBin],
  );

  const handleRetry = useCallback(() => {
    autoCheckStartedRef.current = false;
    void runStartupCheck("manual");
  }, [runStartupCheck]);

  const handleInstall = useCallback(
    async (dependencyId: string) => {
      const runId = Date.now();
      activeRunRef.current = runId;
      autoCheckStartedRef.current = true;
      setBusyDependencyId(dependencyId);
      setActionError(null);
      setPhase("installing");
      markStatusNote(
        `Installing ${dependencyId} from the action button.`,
        `正在通过操作按钮安装 ${dependencyId}。`,
      );

      try {
        const nextStatus = await environmentInstallDependency(
          dependencyId,
          micodeBin,
          micodeArgs,
        );
        attemptedRef.current.add(dependencyId);
        await driveFlow(nextStatus, "manual", runId);
      } catch (error) {
        if (activeRunRef.current !== runId) {
          return;
        }
        setActionError(error instanceof Error ? error.message : String(error));
        setPhase("manual_action_required");
        markStatusNote("Install action failed.", "安装动作失败了。");
      }
    },
    [driveFlow, markStatusNote, micodeArgs, micodeBin],
  );

  useEffect(() => {
    if (loadingStartedRef.current) {
      return;
    }
    loadingStartedRef.current = true;
    let canceled = false;

    const autoStartTimer = window.setTimeout(() => {
      if (canceled || autoCheckStartedRef.current) {
        return;
      }
      void runStartupCheck("auto");
    }, AUTO_START_DELAY_MS);

    void (async () => {
      const [appSettings, cachedStatus] = await Promise.all([
        withTimeout(getAppSettings(), SETTINGS_BOOT_TIMEOUT_MS, null),
        withTimeout(environmentGetCachedStatus(), SETTINGS_BOOT_TIMEOUT_MS, null),
      ]);

      if (canceled) {
        return;
      }

      const nextLanguage =
        appSettings?.language === "en" || appSettings?.language === "zh"
          ? appSettings.language
          : DEFAULT_LANGUAGE;
      setLanguage(nextLanguage);
      settingsRef.current = {
        agentBin: appSettings?.agentBin ?? appSettings?.micodeBin ?? null,
        micodeBin: appSettings?.micodeBin ?? appSettings?.agentBin ?? null,
        agentArgs: appSettings?.agentArgs ?? appSettings?.micodeArgs ?? null,
        micodeArgs: appSettings?.micodeArgs ?? appSettings?.agentArgs ?? null,
      };

      if (cachedStatus) {
        setStatus(cachedStatus);
      }

      if (hasCompletedStartupGate() || cachedStatus?.canProceed) {
        if (cachedStatus?.canProceed) {
          markStartupGateCompleted();
        }
        setPhase("ready");
        return;
      }

      if (!autoCheckStartedRef.current) {
        void runStartupCheck("auto");
      }
    })();

    return () => {
      canceled = true;
      window.clearTimeout(autoStartTimer);
      activeRunRef.current += 1;
    };
  }, [runStartupCheck]);

  const blockingCheck = useMemo(() => firstBlockingCheck(status), [status]);
  const displayChecks = useMemo(() => {
    const checkMap = new Map((status?.checks ?? []).map((check) => [check.id, check]));
    const requiredChecks = REQUIRED_CHECKS.map(({ id, label }) => {
      const existing = checkMap.get(id);
      if (existing) {
        return existing;
      }
      return {
        id,
        label,
        required: true,
        status:
          phase === "loading"
            ? "pending"
            : phase === "checking"
              ? "checking"
              : id === busyDependencyId
                ? "installing"
                : "pending",
        detectedVersion: null,
        summary:
          phase === "loading"
            ? t("Waiting to start checks.", "等待开始检查。")
            : t("Waiting for this step.", "等待执行到这一步。"),
        technicalDetails: null,
        recommendedAction: null,
        canAutoInstall: false,
      } satisfies StartupEnvironmentCheck;
    });
    const additionalChecks = (status?.checks ?? []).filter(
      (check) => !REQUIRED_CHECK_IDS.has(check.id),
    );
    return [...requiredChecks, ...additionalChecks];
  }, [busyDependencyId, phase, status?.checks, t]);

  const completedChecks = displayChecks.filter((check) => isCheckReady(check)).length;
  const progressPercent = useMemo(() => {
    if (phase === "ready" || phase === "finishing") {
      return 100;
    }
    if (phase === "loading") {
      return 8;
    }
    const base = Math.round((completedChecks / REQUIRED_CHECKS.length) * 100);
    if (phase === "checking") {
      return Math.max(base, 24);
    }
    if (phase === "installing") {
      return Math.min(Math.max(base + 12, 38), 92);
    }
    return Math.max(base, 24);
  }, [completedChecks, phase]);

  const currentStageLabel = useMemo(() => {
    if (phase === "loading") {
      return t("Reading app settings", "正在读取应用设置");
    }
    if (phase === "checking") {
      return blockingCheck
        ? t(`Checking ${blockingCheck.label}`, `正在检查 ${blockingCheck.label}`)
        : t("Checking required dependencies", "正在检查必需依赖");
    }
    if (phase === "installing") {
      const installingCheck = displayChecks.find((check) => check.id === busyDependencyId);
      return installingCheck
        ? t(
            `Installing ${installingCheck.label} and verifying again`,
            `正在安装 ${installingCheck.label} 并重新验证`,
          )
        : t("Installing dependency", "正在安装依赖");
    }
    if (phase === "manual_action_required") {
      return t(
        "Stopped at a dependency that still needs action",
        "当前停在仍需处理的依赖节点",
      );
    }
    if (phase === "finishing") {
      return t("Checks finished. Unlocking the app", "检查完成，正在解锁应用");
    }
    return t("Environment is ready", "环境已就绪");
  }, [blockingCheck, busyDependencyId, displayChecks, phase, t]);

  const stageSteps = [
    {
      id: "loading",
      label: t("Read settings", "读取设置"),
      active: phase === "loading",
      done: phase !== "loading",
    },
    {
      id: "checking",
      label: t("Check dependencies", "检查依赖"),
      active: phase === "checking",
      done:
        phase === "installing" ||
        phase === "manual_action_required" ||
        phase === "finishing" ||
        phase === "ready",
    },
    {
      id: "installing",
      label: t("Install and verify", "安装并复检"),
      active: phase === "installing",
      done: phase === "finishing" || phase === "ready",
    },
    {
      id: "ready",
      label: t("Unlock app", "解锁应用"),
      active:
        phase === "manual_action_required" || phase === "finishing" || phase === "ready",
      done: phase === "finishing" || phase === "ready",
    },
  ];

  const isBlocked = phase !== "ready";

  return (
    <>
      <div
        className={
          isBlocked
            ? "startup-gate-app startup-gate-app-blocked"
            : "startup-gate-app startup-gate-app-ready"
        }
        aria-hidden={isBlocked}
      >
        {children}
      </div>
      {isBlocked ? (
        <div className="startup-gate-shell">
          <div className="startup-gate-backdrop" />
          <div className="startup-gate-panel" role="dialog" aria-modal="true">
            <div className="startup-gate-eyebrow">
              {t("Startup Environment Check", "启动环境检查")}
            </div>
            <h1 className="startup-gate-title">
              {t(
                "Rich is preparing the runtime for 财多多.",
                "财多多正在准备运行环境。",
              )}
            </h1>
            <p className="startup-gate-copy">
              {t(
                "The app checks Node.js, MiCode CLI, ACP app-server, and Python up front so your workspace can start in a ready state.",
                "应用会先检查 Node.js、MiCode CLI、ACP app-server 和 Python，这样工作区在进入页面时就能尽量处于可用状态。",
              )}
            </p>

            <div className="startup-gate-progress-block">
              <div className="startup-gate-progress-head">
                <div>
                  <div className="startup-gate-progress-label">
                    {t("Current stage", "当前阶段")}
                  </div>
                  <div className="startup-gate-progress-stage">{currentStageLabel}</div>
                </div>
                <div className="startup-gate-progress-metric">
                  {completedChecks}/{REQUIRED_CHECKS.length}
                  <span>{t(" completed", " 项已完成")}</span>
                </div>
              </div>
              <div className="startup-gate-progress-track" aria-hidden>
                <div
                  className="startup-gate-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="startup-gate-progress-subcopy">
                {t(`Progress ${progressPercent}%`, `总进度 ${progressPercent}%`)}
              </div>
              {statusNote ? <div className="startup-gate-live-note">{statusNote}</div> : null}
              <div className="startup-gate-stage-steps">
                {stageSteps.map((step) => (
                  <div
                    key={step.id}
                    className={`startup-gate-stage-step ${
                      step.done ? "done" : step.active ? "active" : ""
                    }`}
                  >
                    <span className="startup-gate-stage-dot" />
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="startup-gate-status">
              <div className={`startup-gate-badge startup-gate-badge-${phase}`}>
                {phase === "loading" && t("Loading settings", "读取设置中")}
                {phase === "checking" && t("Checking environment", "检查环境中")}
                {phase === "installing" &&
                  (busyDependencyId
                    ? t(`Installing ${busyDependencyId}`, `正在安装 ${busyDependencyId}`)
                    : t("Installing dependency", "正在安装依赖"))}
                {phase === "manual_action_required" &&
                  t("Manual action required", "需要手动处理")}
                {phase === "finishing" && t("Checks complete", "检查完成")}
              </div>
              {blockingCheck ? (
                <div className="startup-gate-focus">
                  <strong>{blockingCheck.label}</strong>
                  <span>{blockingCheck.summary}</span>
                </div>
              ) : null}
            </div>

            <div className="startup-gate-checks">
              {displayChecks.map((check, index) => {
                const failed = !isCheckReady(check);
                const isInstalling = phase === "installing" && busyDependencyId === check.id;
                const isChecking =
                  phase === "checking" &&
                  !isCheckReady(check) &&
                  (blockingCheck?.id === check.id ||
                    (!blockingCheck && index === completedChecks));
                const stateLabel = isCheckReady(check)
                  ? t("Ready", "正常")
                  : isInstalling
                    ? t("Installing", "安装中")
                    : isChecking
                      ? t("Checking", "检查中")
                      : failed
                        ? t("Blocked", "未就绪")
                        : t("Pending", "等待中");
                return (
                  <div
                    key={check.id}
                    className={`startup-gate-check ${
                      isCheckReady(check)
                        ? "ready"
                        : isInstalling
                          ? "installing"
                          : isChecking
                            ? "checking"
                            : failed
                              ? "failed"
                              : ""
                    }`}
                  >
                    <div className="startup-gate-check-head">
                      <div className="startup-gate-check-title">
                        <span className="startup-gate-check-label">{check.label}</span>
                        {!check.required ? (
                          <span className="startup-gate-check-kind">
                            {t("Optional", "开发提示")}
                          </span>
                        ) : null}
                      </div>
                      <span className="startup-gate-check-state">{stateLabel}</span>
                    </div>
                    <div className="startup-gate-check-summary">{check.summary}</div>
                    {check.detectedVersion ? (
                      <div className="startup-gate-check-version">
                        {t("Version", "版本")} {check.detectedVersion}
                      </div>
                    ) : null}
                    {check.recommendedAction && failed ? (
                      <div className="startup-gate-check-action">
                        {check.recommendedAction}
                      </div>
                    ) : null}
                    {check.technicalDetails && failed ? (
                      <details className="startup-gate-details">
                        <summary>{t("Technical details", "技术详情")}</summary>
                        <pre>{check.technicalDetails}</pre>
                      </details>
                    ) : null}
                    {phase === "manual_action_required" && failed && check.canAutoInstall ? (
                      <button
                        type="button"
                        className="startup-gate-button secondary"
                        onClick={() => {
                          void handleInstall(check.id);
                        }}
                      >
                        {t("Install now", "立即安装")}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {actionError ? <div className="startup-gate-error">{actionError}</div> : null}

            <div className="startup-gate-actions">
              <button
                type="button"
                className="startup-gate-button"
                onClick={handleRetry}
                disabled={phase === "checking" || phase === "installing" || phase === "finishing"}
              >
                {phase === "loading"
                  ? t("Start check", "开始检查")
                  : phase === "checking"
                    ? t("Checking...", "检查中...")
                    : phase === "installing"
                      ? t("Installing...", "安装中...")
                      : phase === "finishing"
                        ? t("Entering app...", "正在进入应用...")
                        : t("Retry check", "重新检查")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
