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
        <div className="sidebar-title-group">
          <button
            className="sidebar-title-add"
            onClick={onAddWorkspace}
            data-tauri-drag-region="false"
            aria-label={isZh ? "添加工作区" : "Add workspace"}
            type="button"
          >
            <FolderPlus aria-hidden />
          </button>
          <button
            className="subtitle subtitle-button sidebar-title-button"
            onClick={onSelectHome}
            data-tauri-drag-region="false"
            aria-label={isZh ? "打开首页" : "Open home"}
          >
            {isZh ? "项目" : "Projects"}
          </button>
        </div>
      </div>
      <div className="sidebar-header-actions">
        <button
          className={`ghost sidebar-search-toggle${isSearchOpen ? " is-active" : ""}`}
          onClick={onToggleSearch}
          data-tauri-drag-region="false"
          aria-label={isZh ? "切换搜索" : "Toggle search"}
          aria-pressed={isSearchOpen}
          type="button"
        >
          <Search aria-hidden />
        </button>
      </div>
    </div>
  );
}
