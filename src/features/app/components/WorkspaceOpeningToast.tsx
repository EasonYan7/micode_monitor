type WorkspaceOpeningToastProps = {
  visible: boolean;
  language?: "en" | "zh";
};

export function WorkspaceOpeningToast({
  visible,
  language = "en",
}: WorkspaceOpeningToastProps) {
  if (!visible) {
    return null;
  }

  const isZh = language === "zh";

  return (
    <div className="update-toasts workspace-opening-toasts" role="region" aria-live="polite">
      <div className="update-toast workspace-opening-toast" role="status">
        <div className="update-toast-header">
          <div className="update-toast-title">
            {isZh ? "正在打开工作区" : "Opening workspace"}
          </div>
        </div>
        <div className="update-toast-body workspace-opening-toast-body">
          {isZh
            ? "正在努力打开目录并同步历史记录，请稍候。"
            : "Opening the folder and syncing history. Please wait."}
        </div>
        <div className="workspace-opening-toast-progress" aria-hidden>
          <span className="workspace-opening-toast-progress-fill" />
        </div>
      </div>
    </div>
  );
}
