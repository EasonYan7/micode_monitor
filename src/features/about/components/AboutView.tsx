import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

const GITHUB_URL = "https://github.com/EasonYan7/micode_monitor";

export function AboutView() {
  const [version, setVersion] = useState<string | null>(null);

  const handleOpenGitHub = () => {
    void openUrl(GITHUB_URL);
  };

  useEffect(() => {
    let active = true;
    const fetchVersion = async () => {
      try {
        const value = await getVersion();
        if (active) {
          setVersion(value);
        }
      } catch {
        if (active) {
          setVersion(null);
        }
      }
    };

    void fetchVersion();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="about">
      <div className="about-card">
        <div className="about-header">
          <img
            className="about-icon"
            src="/app-icon.png"
            alt="财多多 icon"
          />
          <div>
            <div className="about-title">财多多</div>
            <div className="about-name-en">Rich</div>
          </div>
        </div>
        <div className="about-version">{version ? `Version ${version}` : "Version -"}</div>
        <div className="about-tagline">面向本地项目的智能协作与任务工作台。</div>
        <div className="about-divider" />
        <div className="about-links">
          <button type="button" className="about-link" onClick={handleOpenGitHub}>
            项目主页
          </button>
        </div>
        <div className="about-footer">Built by Eason Yan and contributors</div>
      </div>
    </div>
  );
}
