import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const sourceDir = join(
  projectRoot,
  "node_modules",
  "vscode-material-icons",
  "generated",
  "icons",
);
const targetDir = join(projectRoot, "public", "assets", "material-icons");

if (!existsSync(sourceDir)) {
  console.warn("[sync:material-icons] source icons directory not found:", sourceDir);
  process.exit(0);
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function copyWithPowerShell(source, target) {
  const command = [
    `$source = ${psQuote(source)}`,
    `$target = ${psQuote(target)}`,
    "$targetParent = Split-Path -Parent $target",
    "New-Item -ItemType Directory -Force -Path $targetParent | Out-Null",
    "if (Test-Path $target) { Remove-Item -Recurse -Force $target }",
    "Copy-Item -Recurse -Force -Path $source -Destination $target",
  ].join("; ");

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { stdio: "inherit" },
  );

  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`PowerShell copy failed with exit code ${result.status ?? 1}.`);
  }
}

mkdirSync(dirname(targetDir), { recursive: true });

if (process.platform === "win32") {
  try {
    copyWithPowerShell(sourceDir, targetDir);
  } catch (error) {
    console.warn("[sync:material-icons] PowerShell copy failed, falling back to fs.cpSync.");
    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true });
  }
} else {
  rmSync(targetDir, { recursive: true, force: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}

console.log("[sync:material-icons] synced icons to", targetDir);
