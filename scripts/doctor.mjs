import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const strict = process.argv.includes("--strict");
const install = process.argv.includes("--install");
const skipMicode = ["1", "true", "yes"].includes(
  (process.env.MICODE_DOCTOR_SKIP_MICODE ?? "").toLowerCase(),
);

function hasCommand(command) {
  const checker = process.platform === "win32" ? "where" : "command";
  const checkerArgs = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(checker, checkerArgs, { stdio: "ignore" });
  return result.status === 0;
}

function findWindowsLinker() {
  if (process.platform !== "win32") {
    return null;
  }
  if (hasCommand("link")) {
    return "PATH";
  }

  const roots = [
    "C:\\Program Files\\Microsoft Visual Studio\\2022",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022",
  ];
  const editions = ["BuildTools", "Community", "Professional", "Enterprise"];

  for (const root of roots) {
    for (const edition of editions) {
      const binRoot = path.join(root, edition, "VC", "Tools", "MSVC");
      if (!existsSync(binRoot)) {
        continue;
      }
      const entries = spawnSync("powershell", [
        "-NoProfile",
        "-Command",
        `Get-ChildItem -Path '${binRoot.replace(/'/g, "''")}' -Directory | Sort-Object Name -Descending | Select-Object -ExpandProperty FullName`,
      ], { encoding: "utf8" });
      if (entries.status !== 0) {
        continue;
      }
      const versions = entries.stdout
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
      for (const versionDir of versions) {
        const linkerPath = path.join(versionDir, "bin", "Hostx64", "x64", "link.exe");
        if (existsSync(linkerPath)) {
          return linkerPath;
        }
      }
    }
  }

  return null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false, ...options });
  return result.status === 0;
}

const missing = [];
if (!hasCommand("node")) missing.push("node");
if (!hasCommand("npm")) missing.push("npm");
if (!hasCommand("rustc")) missing.push("rustc");
if (!hasCommand("cargo")) missing.push("cargo");
if (!hasCommand("cmake")) missing.push("cmake");
if (!hasCommand("git")) missing.push("git");
if (!hasCommand("python") && !(process.platform === "win32" && hasCommand("py"))) missing.push("python");
if (!skipMicode && !hasCommand("micode")) missing.push("micode");
const windowsLinkerPath = findWindowsLinker();
if (process.platform === "win32" && !windowsLinkerPath) missing.push("link");

const requiredTools = ["node", "npm", "rustc", "cargo", "cmake", "git", "python"];
if (!skipMicode) {
  requiredTools.push("micode");
}
if (process.platform === "win32") {
  requiredTools.push("link");
}

if (missing.length === 0) {
  console.log("Doctor: OK");
  if (process.platform === "win32" && windowsLinkerPath && windowsLinkerPath !== "PATH") {
    console.log(`Doctor: found Visual Studio linker outside PATH: ${windowsLinkerPath}`);
    console.log("Doctor: tauri:dev:win will activate the Visual Studio build environment automatically.");
  }
  process.exit(0);
}

console.log(`Doctor: missing dependencies: ${missing.join(" ")}`);
console.log(`Required: ${requiredTools.join(" ")}`);
if (skipMicode) {
  console.log("Doctor: MICODE_DOCTOR_SKIP_MICODE=1, skipping micode check.");
}

if (install) {
  if (process.platform === "win32") {
    const installer = hasCommand("winget") ? "winget" : (hasCommand("choco") ? "choco" : "");
    if (!installer) {
      console.log("Auto-install failed: neither winget nor choco is available.");
      console.log("Install winget: https://aka.ms/getwinget");
      console.log("Install choco: https://chocolatey.org/install");
      process.exit(1);
    }
    const installMap = [
      ["node", installer === "winget" ? ["winget", ["install", "--id", "OpenJS.NodeJS", "-e"]] : ["choco", ["install", "-y", "nodejs"]]],
      ["npm", installer === "winget" ? ["winget", ["install", "--id", "OpenJS.NodeJS", "-e"]] : ["choco", ["install", "-y", "nodejs"]]],
      ["rustc", installer === "winget" ? ["winget", ["install", "--id", "Rustlang.Rustup", "-e"]] : ["choco", ["install", "-y", "rustup.install"]]],
      ["cargo", installer === "winget" ? ["winget", ["install", "--id", "Rustlang.Rustup", "-e"]] : ["choco", ["install", "-y", "rustup.install"]]],
      ["cmake", installer === "winget" ? ["winget", ["install", "--id", "Kitware.CMake", "-e"]] : ["choco", ["install", "-y", "cmake"]]],
      ["git", installer === "winget" ? ["winget", ["install", "--id", "Git.Git", "-e"]] : ["choco", ["install", "-y", "git"]]],
      ["python", installer === "winget" ? ["winget", ["install", "--id", "Python.Python.3.12", "-e"]] : ["choco", ["install", "-y", "python"]]],
      ["link", installer === "winget"
        ? ["winget", ["install", "--id", "Microsoft.VisualStudio.2022.BuildTools", "-e", "--override", "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"]]
        : ["choco", ["install", "-y", "visualstudio2022buildtools", "--package-parameters", "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart"]]],
    ];
    const planned = new Set();
    for (const [cmd, [installer, args]] of installMap) {
      if (missing.includes(cmd)) {
        const key = `${installer} ${args.join(" ")}`;
        if (planned.has(key)) continue;
        planned.add(key);
        console.log(`Installing ${cmd} via ${installer}...`);
        if (!run(installer, args)) {
          console.log(`Install failed for ${cmd}. Please run manually.`);
          process.exit(1);
        }
      }
    }
    if (!skipMicode && missing.includes("micode")) {
      console.log("Installing micode...");
      if (!run("powershell", ["-ExecutionPolicy", "Bypass", "-Command", "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"])) {
        console.log("Install failed for micode. Please run manually.");
        process.exit(1);
      }
    }
    process.exit(0);
  }

  if (process.platform === "darwin") {
    console.log("Auto-install on macOS is supported via: npm run doctor:install");
    process.exit(1);
  }

  if (process.platform === "linux") {
    console.log("Auto-install on Linux is supported via: npm run doctor:install");
    process.exit(1);
  }

  console.log("Auto-install is not supported on this platform.");
  process.exit(1);
}

switch (process.platform) {
  case "darwin":
    console.log("Install: brew install node rust cmake git");
    if (!skipMicode) {
      console.log('MiCode: bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"');
    }
    break;
  case "linux":
    console.log("Ubuntu/Debian: sudo apt-get install -y nodejs npm rustc cargo cmake git");
    console.log("Fedora: sudo dnf install -y nodejs npm rust cargo cmake git");
    console.log("Arch: sudo pacman -S nodejs npm rust cmake git");
    if (!skipMicode) {
      console.log('MiCode: bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"');
    }
    break;
  case "win32":
    console.log("Install with winget (preferred):");
    console.log("  winget install OpenJS.NodeJS");
    console.log("  winget install Rustlang.Rustup");
    console.log("  winget install Kitware.CMake");
    console.log("  winget install Git.Git");
    console.log("  winget install Python.Python.3.12");
    console.log("  winget install Microsoft.VisualStudio.2022.BuildTools --override \"--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended\"");
    console.log("Or with choco:");
    console.log("  choco install -y nodejs rustup.install cmake git python");
    console.log("  choco install -y visualstudio2022buildtools --package-parameters \"--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart\"");
    console.log("Why link.exe matters:");
    console.log("  Tauri/Rust on Windows uses the MSVC linker. If `where link` returns nothing, install Visual Studio Build Tools 2022 with Desktop development with C++.");
    if (!skipMicode) {
      console.log("MiCode (PowerShell):");
      console.log('  powershell -ExecutionPolicy Bypass -Command "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"');
    }
    break;
  default:
    console.log("Install the missing tools with your package manager.");
    break;
}

process.exit(strict ? 1 : 0);
