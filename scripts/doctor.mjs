import { spawnSync } from "node:child_process";

const strict = process.argv.includes("--strict");
const install = process.argv.includes("--install");

function hasCommand(command) {
  const checker = process.platform === "win32" ? "where" : "command";
  const checkerArgs = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(checker, checkerArgs, { stdio: "ignore" });
  return result.status === 0;
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
if (!hasCommand("micode")) missing.push("micode");

if (missing.length === 0) {
  console.log("Doctor: OK");
  process.exit(0);
}

console.log(`Doctor: missing dependencies: ${missing.join(" ")}`);
console.log("Required: node npm rustc cargo cmake git micode");

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
    if (missing.includes("micode")) {
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
    console.log('MiCode: bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"');
    break;
  case "linux":
    console.log("Ubuntu/Debian: sudo apt-get install -y nodejs npm rustc cargo cmake git");
    console.log("Fedora: sudo dnf install -y nodejs npm rust cargo cmake git");
    console.log("Arch: sudo pacman -S nodejs npm rust cmake git");
    console.log('MiCode: bash -c "$(curl -fsSL https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.sh)"');
    break;
  case "win32":
    console.log("Install with winget (preferred):");
    console.log("  winget install OpenJS.NodeJS");
    console.log("  winget install Rustlang.Rustup");
    console.log("  winget install Kitware.CMake");
    console.log("  winget install Git.Git");
    console.log("Or with choco:");
    console.log("  choco install -y nodejs rustup.install cmake git");
    console.log("MiCode (PowerShell):");
    console.log('  powershell -ExecutionPolicy Bypass -Command "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"');
    break;
  default:
    console.log("Install the missing tools with your package manager.");
    break;
}

process.exit(strict ? 1 : 0);
