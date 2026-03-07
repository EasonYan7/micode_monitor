import { useEffect, useMemo, useRef, useState } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { openWorkspaceIn } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import type { OpenAppTarget, UiLanguage } from "../../../types";
import {
  DEFAULT_OPEN_APP_ID,
  DEFAULT_OPEN_APP_TARGETS,
  OPEN_APP_STORAGE_KEY,
} from "../constants";
import { GENERIC_APP_ICON, getKnownOpenAppIcon } from "../utils/openAppIcons";
import { getFileManagerName, getRevealInFileManagerLabel } from "../utils/fileManager";

type OpenTarget = {
  id: string;
  label: string;
  icon: string;
  target: OpenAppTarget;
};

type OpenAppMenuProps = {
  path: string;
  openTargets: OpenAppTarget[];
  selectedOpenAppId: string;
  onSelectOpenAppId: (id: string) => void;
  iconById?: Record<string, string>;
  language?: UiLanguage;
};

export function OpenAppMenu({
  path,
  openTargets,
  selectedOpenAppId,
  onSelectOpenAppId,
  iconById = {},
  language = "en",
}: OpenAppMenuProps) {
  const isZh = language === "zh";
  const t = (en: string, zh: string) => (isZh ? zh : en);
  const [openMenuOpen, setOpenMenuOpen] = useState(false);
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  const availableTargets =
    openTargets.length > 0 ? openTargets : DEFAULT_OPEN_APP_TARGETS;
  const openAppId = useMemo(
    () =>
      availableTargets.find((target) => target.id === selectedOpenAppId)?.id,
    [availableTargets, selectedOpenAppId],
  );
  const resolvedOpenAppId =
    openAppId ?? availableTargets[0]?.id ?? DEFAULT_OPEN_APP_ID;

  const resolvedOpenTargets = useMemo<OpenTarget[]>(
    () =>
      availableTargets.map((target) => ({
        id: target.id,
        label: target.label,
        icon:
          getKnownOpenAppIcon(target.id) ??
          iconById[target.id] ??
          GENERIC_APP_ICON,
        target,
      })),
    [availableTargets, iconById],
  );

  const fallbackTarget: OpenTarget = {
    id: DEFAULT_OPEN_APP_ID,
    label: DEFAULT_OPEN_APP_TARGETS[0]?.label ?? t("Open", "打开"),
    icon: getKnownOpenAppIcon(DEFAULT_OPEN_APP_ID) ?? GENERIC_APP_ICON,
    target:
      DEFAULT_OPEN_APP_TARGETS[0] ?? {
        id: DEFAULT_OPEN_APP_ID,
        label: t("Default App", "系统默认应用"),
        kind: "default",
        appName: null,
        command: null,
        args: [],
      },
  };
  const selectedOpenTarget =
    resolvedOpenTargets.find((target) => target.id === resolvedOpenAppId) ??
    resolvedOpenTargets[0] ??
    fallbackTarget;

  const reportOpenError = (error: unknown, target: OpenTarget) => {
    const message = error instanceof Error ? error.message : String(error);
    pushErrorToast({
      title: t("Couldn't open workspace", "无法打开工作区"),
      message,
    });
    console.warn("Failed to open workspace in target app", {
      message,
      path,
      targetId: target.id,
    });
  };

  useEffect(() => {
    if (!openMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const openContains = openMenuRef.current?.contains(target) ?? false;
      if (!openContains) {
        setOpenMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [openMenuOpen]);

  const resolveAppName = (target: OpenTarget) =>
    (target.target.appName ?? "").trim();
  const resolveCommand = (target: OpenTarget) =>
    (target.target.command ?? "").trim();
  const canOpenTarget = (target: OpenTarget) => {
    if (target.target.kind === "default") {
      return true;
    }
    if (target.target.kind === "finder") {
      return true;
    }
    if (target.target.kind === "command") {
      return Boolean(resolveCommand(target));
    }
    return Boolean(resolveAppName(target));
  };

  const openWithTarget = async (target: OpenTarget) => {
    try {
      if (target.target.kind === "default") {
        await openWorkspaceIn(path, {
          appName: null,
          args: target.target.args,
          command: null,
        });
        return;
      }
      if (target.target.kind === "finder") {
        await revealItemInDir(path);
        return;
      }
      if (target.target.kind === "command") {
        const command = resolveCommand(target);
        if (!command) {
          return;
        }
        await openWorkspaceIn(path, {
          command,
          args: target.target.args,
        });
        return;
      }
      const appName = resolveAppName(target);
      if (!appName) {
        return;
      }
      await openWorkspaceIn(path, {
        appName,
        args: target.target.args,
      });
    } catch (error) {
      reportOpenError(error, target);
    }
  };

  const handleOpen = async () => {
    if (!selectedOpenTarget || !canOpenTarget(selectedOpenTarget)) {
      return;
    }
    await openWithTarget(selectedOpenTarget);
  };

  const handleSelectOpenTarget = async (target: OpenTarget) => {
    if (!canOpenTarget(target)) {
      return;
    }
    onSelectOpenAppId(target.id);
    window.localStorage.setItem(OPEN_APP_STORAGE_KEY, target.id);
    setOpenMenuOpen(false);
    await openWithTarget(target);
  };

  const selectedCanOpen = canOpenTarget(selectedOpenTarget);
  const selectedLabel =
    selectedOpenTarget.target.kind === "finder"
      ? getFileManagerName()
      : selectedOpenTarget.target.kind === "default"
        ? t("Default App", "系统默认应用")
        : selectedOpenTarget.label;
  const openLabel = selectedCanOpen
    ? selectedOpenTarget.target.kind === "finder"
      ? getRevealInFileManagerLabel()
      : selectedOpenTarget.target.kind === "default"
        ? t("Open with default app", "用系统默认应用打开")
        : isZh
          ? `在 ${selectedLabel} 中打开`
          : `Open in ${selectedLabel}`
    : selectedOpenTarget.target.kind === "command"
      ? t("Set command in Settings", "请先在设置中填写命令")
      : t("Set app name in Settings", "请先在设置中填写应用名称");

  return (
    <div className="open-app-menu" ref={openMenuRef}>
      <div className="open-app-button">
        <button
          type="button"
          className="ghost main-header-action open-app-action"
          onClick={handleOpen}
          disabled={!selectedCanOpen}
          data-tauri-drag-region="false"
          aria-label={isZh ? `在 ${selectedLabel} 中打开` : `Open in ${selectedLabel}`}
          title={openLabel}
        >
          <span className="open-app-label">
            <img
              className="open-app-icon"
              src={selectedOpenTarget.icon}
              alt=""
              aria-hidden
            />
            {selectedLabel}
          </span>
        </button>
        <button
          type="button"
          className="ghost main-header-action open-app-toggle"
          onClick={() => setOpenMenuOpen((prev) => !prev)}
          data-tauri-drag-region="false"
          aria-haspopup="menu"
          aria-expanded={openMenuOpen}
          aria-label={t("Select app", "选择打开方式")}
          title={t("Select app", "选择打开方式")}
        >
          <ChevronDown size={14} aria-hidden />
        </button>
      </div>
      {openMenuOpen && (
        <div className="open-app-dropdown" role="menu">
          {resolvedOpenTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              className={`open-app-option${
                target.id === resolvedOpenAppId ? " is-active" : ""
              }`}
              onClick={() => handleSelectOpenTarget(target)}
              disabled={!canOpenTarget(target)}
              role="menuitem"
              data-tauri-drag-region="false"
            >
              <img className="open-app-icon" src={target.icon} alt="" aria-hidden />
              {target.target.kind === "finder"
                ? getFileManagerName()
                : target.target.kind === "default"
                  ? t("Default App", "系统默认应用")
                  : target.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
