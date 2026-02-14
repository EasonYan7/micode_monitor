import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const [command, ...rest] = args;

const run = (bin, runArgs) => {
  const result = spawnSync(bin, runArgs, { stdio: "inherit", shell: false });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
};

const runNpmScript = (script, scriptArgs) => {
  run("npm", ["run", script, "--", ...scriptArgs]);
};

const isWindows = process.platform === "win32";

if (command === "dev") {
  runNpmScript(isWindows ? "tauri:dev:win" : "tauri:dev", rest);
}

if (command === "build") {
  runNpmScript(isWindows ? "tauri:build:win" : "tauri:build", rest);
}

run("tauri", args);
