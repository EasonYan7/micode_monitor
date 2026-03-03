import type { OpenAppTarget } from "../../types";

export const OPEN_APP_STORAGE_KEY = "open-workspace-app";
export const DEFAULT_OPEN_APP_ID = "system";

export type OpenAppId = string;

export const DEFAULT_OPEN_APP_TARGETS: OpenAppTarget[] = [
  {
    id: "system",
    label: "Default App",
    kind: "default",
    args: [],
  },
  {
    id: "vscode",
    label: "VS Code",
    kind: "app",
    appName: "Visual Studio Code",
    args: [],
  },
  {
    id: "finder",
    label: "Finder",
    kind: "finder",
    args: [],
  },
];
