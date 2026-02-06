import { readGlobalMiCodeConfigToml, writeGlobalMiCodeConfigToml } from "../../../services/tauri";
import { useFileEditor } from "../../shared/hooks/useFileEditor";

export function useGlobalMiCodeConfigToml() {
  return useFileEditor({
    key: "global-config",
    read: readGlobalMiCodeConfigToml,
    write: writeGlobalMiCodeConfigToml,
    readErrorTitle: "Couldn’t load global config.toml",
    writeErrorTitle: "Couldn’t save global config.toml",
  });
}
