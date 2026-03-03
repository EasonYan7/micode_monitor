import type { AppSettings, OpenAppTarget } from "../../../types";
import { DEFAULT_OPEN_APP_ID, DEFAULT_OPEN_APP_TARGETS } from "../constants";
import { getFileManagerName } from "./fileManager";

export function normalizeOpenAppTargets(targets: OpenAppTarget[]): OpenAppTarget[] {
  const allowedIds = new Set(DEFAULT_OPEN_APP_TARGETS.map((target) => target.id));
  const byId = targets
    .map((target) => ({
      ...target,
      label: target.label.trim(),
      appName: (target.appName?.trim() ?? "") || null,
      command: (target.command?.trim() ?? "") || null,
      args: Array.isArray(target.args) ? target.args.map((arg) => arg.trim()) : [],
    }))
    .filter((target) => target.label && target.id && allowedIds.has(target.id))
    .reduce<Record<string, OpenAppTarget>>((acc, target) => {
      acc[target.id] = target;
      return acc;
    }, {});

  return DEFAULT_OPEN_APP_TARGETS.map((defaultTarget) => {
    const target = byId[defaultTarget.id] ?? defaultTarget;
    if (target.kind === "finder") {
      return {
        ...target,
        label: getFileManagerName(),
        appName: null,
        command: null,
        args: [],
      };
    }
    if (target.kind === "default") {
      return {
        ...target,
        label: "Default App",
        appName: null,
        command: null,
        args: [],
      };
    }
    if (target.kind === "command") {
      return {
        ...target,
        appName: null,
      };
    }
    return {
      ...target,
      label: defaultTarget.label,
      appName: defaultTarget.appName ?? null,
      command: null,
      args: defaultTarget.args ?? [],
    };
  });
}

export function getOpenAppTargets(settings: AppSettings): OpenAppTarget[] {
  return normalizeOpenAppTargets(settings.openAppTargets ?? []);
}

export function getSelectedOpenAppId(settings: AppSettings): string {
  const targets = getOpenAppTargets(settings);
  const selected =
    settings.selectedOpenAppId ||
    (typeof window === "undefined"
      ? DEFAULT_OPEN_APP_ID
      : window.localStorage.getItem("open-workspace-app") || DEFAULT_OPEN_APP_ID);
  return targets.some((target) => target.id === selected)
    ? selected
    : targets[0]?.id ?? DEFAULT_OPEN_APP_ID;
}
