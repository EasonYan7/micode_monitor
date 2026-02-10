import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const strict = process.argv.includes("--strict");

function hasCommand(command) {
  if (process.platform === "win32") {
    const whereResult = spawnSync("where.exe", [command], { stdio: "ignore" });
    if (whereResult.status === 0) return true;

    if (command.toLowerCase() === "cmake") {
      const commonInstallPaths = [
        join("C:\\", "Program Files", "CMake", "bin", "cmake.exe"),
        join("C:\\", "Program Files (x86)", "CMake", "bin", "cmake.exe"),
      ];
      return commonInstallPaths.some((path) => existsSync(path));
    }

    return false;
  }

  const result = spawnSync("which", [command], { stdio: "ignore" });
  return result.status === 0;
}

const missing = [];
if (!hasCommand("cmake")) missing.push("cmake");
if (!hasCommand("cargo")) missing.push("cargo");
if (process.platform === "win32" && !hasCommand("link")) missing.push("link.exe");

if (missing.length === 0) {
  console.log("Doctor: OK");
  process.exit(0);
}

console.log(`Doctor: missing dependencies: ${missing.join(" ")}`);

switch (process.platform) {
  case "darwin":
    if (missing.includes("cmake")) {
      console.log("Install: brew install cmake");
    }
    if (missing.includes("cargo")) {
      console.log("Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh");
    }
    break;
  case "linux":
    if (missing.includes("cmake")) {
      console.log("Ubuntu/Debian: sudo apt-get install cmake");
      console.log("Fedora: sudo dnf install cmake");
      console.log("Arch: sudo pacman -S cmake");
    }
    if (missing.includes("cargo")) {
      console.log("Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh");
    }
    break;
  case "win32":
    if (missing.includes("cmake")) {
      console.log("Install CMake: choco install cmake");
      console.log("Or download from: https://cmake.org/download/");
    }
    if (missing.includes("cargo")) {
      console.log("Install Rust (cargo): winget install Rustlang.Rustup");
      console.log("Or download from: https://rustup.rs/");
    }
    if (missing.includes("link.exe")) {
      console.log("Install MSVC Build Tools (C++): winget install Microsoft.VisualStudio.2022.BuildTools");
      console.log("Required workloads/components:");
      console.log("- Desktop development with C++");
      console.log("- MSVC v143 build tools");
      console.log("- Windows 10/11 SDK");
    }
    break;
  default:
    if (missing.includes("cmake")) {
      console.log("Install CMake from: https://cmake.org/download/");
    }
    if (missing.includes("cargo")) {
      console.log("Install Rust from: https://rustup.rs/");
    }
    break;
}

process.exit(strict ? 1 : 0);

