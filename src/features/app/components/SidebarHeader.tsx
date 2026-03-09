import FolderPlus from "lucide-react/dist/esm/icons/folder-plus";
import Search from "lucide-react/dist/esm/icons/search";
import type { UiLanguage } from "../../../types";

type SidebarHeaderProps = {
  onSelectHome: () => void;
  onAddWorkspace: () => void;
  onToggleSearch: () => void;
  isSearchOpen: boolean;
  language?: UiLanguage;
};

export function SidebarHeader({
  onSelectHome,
  onAddWorkspace,
  onToggleSearch,
  isSearchOpen,
  language = "en",
}: SidebarHeaderProps) {
  const isZh = language === "zh";

  return (
    <div className="sidebar-header">
      <div className="sidebar-header-title">
        <button
          className="sidebar-brand"
          onClick={onSelectHome}
          data-tauri-drag-region="false"
          aria-label={isZh ? "打开财多多首页" : "Open Rich home"}
          title={isZh ? "财多多" : "Rich"}
          type="button"
        >
          <img className="sidebar-brand-logo" src="/app-icon.png" alt="" aria-hidden />
          <span className="sidebar-brand-name">{isZh ? "财多多" : "Rich"}</span>
        </button>
      </div>
      <div className="sidebar-header-actions">
        <button
          className="sidebar-header-add"
          onClick={onAddWorkspace}
          data-tauri-drag-region="false"
          aria-label={isZh ? "添加工作区" : "Add workspace"}
          title={isZh ? "添加工作区" : "Add workspace"}
          type="button"
        >
          <FolderPlus aria-hidden />
        </button>
        <button
          className={`ghost sidebar-search-toggle${isSearchOpen ? " is-active" : ""}`}
          onClick={onToggleSearch}
          data-tauri-drag-region="false"
          aria-label={isZh ? "切换搜索" : "Toggle search"}
          aria-pressed={isSearchOpen}
          title={isZh ? "搜索" : "Search"}
          type="button"
        >
          <Search aria-hidden />
        </button>
      </div>
    </div>
  );
}
