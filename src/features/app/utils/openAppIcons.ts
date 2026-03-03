import finderIcon from "../../../assets/app-icons/finder.png";
import vscodeIcon from "../../../assets/app-icons/vscode.png";

const GENERIC_APP_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'><rect x='4' y='3' width='16' height='18' rx='3' ry='3'/><path d='M9 7h6'/><path d='M9 11h6'/><path d='M9 15h4'/></svg>";

export const GENERIC_APP_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  GENERIC_APP_SVG,
)}`;

export function getKnownOpenAppIcon(id: string): string | null {
  switch (id) {
    case "vscode":
      return vscodeIcon;
    case "finder":
      return finderIcon;
    default:
      return null;
  }
}
