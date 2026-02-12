import { spawnSync } from "node:child_process";

const strict = process.argv.includes("--strict");

function hasCommand(command) {
  const checker = process.platform === "win32" ? "where" : "command";
  const checkerArgs = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(checker, checkerArgs, { stdio: "ignore" });
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
    console.log("Install with winget/choco:");
    console.log("  winget install OpenJS.NodeJS");
    console.log("  winget install Rustlang.Rustup");
    console.log("  winget install Kitware.CMake");
    console.log("  winget install Git.Git");
    console.log("MiCode (PowerShell):");
    console.log('  powershell -ExecutionPolicy Bypass -Command "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex"');
    break;
  default:
    console.log("Install the missing tools with your package manager.");
    break;
}

process.exit(strict ? 1 : 0);
