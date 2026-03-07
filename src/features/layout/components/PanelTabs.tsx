import type { ReactNode } from "react";
import Folder from "lucide-react/dist/esm/icons/folder";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import type { UiLanguage } from "../../../types";

export type PanelTabId = "files" | "prompts";

type PanelTab = {
  id: PanelTabId;
  label: string;
  icon: ReactNode;
};

type PanelTabsProps = {
  active: PanelTabId;
  onSelect: (id: PanelTabId) => void;
  tabs?: PanelTab[];
  language?: UiLanguage;
};

const defaultTabs: PanelTab[] = [
  { id: "files", label: "Files", icon: <Folder aria-hidden /> },
  { id: "prompts", label: "Prompts", icon: <ScrollText aria-hidden /> },
];

export function PanelTabs({
  active,
  onSelect,
  tabs = defaultTabs,
  language = "en",
}: PanelTabsProps) {
  const isZh = language === "zh";
  const localizedTabs = tabs.map((tab) => ({
    ...tab,
    label:
      tab.id === "files"
        ? (isZh ? "文件" : "Files")
        : isZh
          ? "提示词"
          : "Prompts",
  }));

  return (
    <div className="panel-tabs" role="tablist" aria-label={isZh ? "侧边面板" : "Panel"}>
      {localizedTabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(tab.id)}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.label}
            title={tab.label}
          >
            <span className="panel-tab-icon" aria-hidden>
              {tab.icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}
