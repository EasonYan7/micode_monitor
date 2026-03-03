import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const [command, ...rest] = args;
const isWindows = process.platform === "win32";

const resolveBin = (bin) => {
  if (!isWindows) return bin;
  if (bin === "npm") return "npm.cmd";
  if (bin === "tauri") return "tauri.cmd";
  return bin;
};

const run = (bin, runArgs) => {
  const result = spawnSync(resolveBin(bin), runArgs, {
    stdio: "inherit",
    shell: isWindows,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
};

const runNpmScript = (script, scriptArgs) => {
  run("npm", ["run", script, "--", ...scriptArgs]);
};

if (command === "dev") {
  runNpmScript(isWindows ? "tauri:dev:win" : "tauri:dev", rest);
}

if (command === "build") {
  runNpmScript(isWindows ? "tauri:build:win" : "tauri:build", rest);
}

run("tauri", args);
