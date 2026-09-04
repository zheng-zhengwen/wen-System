import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";

export function executable(name) {
  if (process.platform !== "win32") return name;
  if (name === "npx" || name === "npm") return `${name}.cmd`;
  return name;
}

export function localTool(name) {
  const tools = {
    esbuild: path.resolve("node_modules/esbuild/bin/esbuild"),
    vite: path.resolve("node_modules/vite/bin/vite.js"),
  };
  const file = tools[name];
  if (!file || !exists(file)) throw new Error(`local tool not found: ${name}`);
  return file;
}

function exists(file) {
  try {
    accessSync(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function which(name) {
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const suffix of process.platform === "win32" ? ["", ".exe", ".cmd"] : [""]) {
      const candidate = path.join(dir, `${name}${suffix}`);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

export function chromeExecutable() {
  const override = process.env.AWEN_E2E_CHROME?.trim();
  if (override) return override;

  const candidates = process.platform === "win32"
    ? [
        path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Chromium", "Application", "chrome.exe"),
      ]
    : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && exists(candidate)) return candidate;
    const found = which(candidate);
    if (found) return found;
  }
  throw new Error(
    `找不到 Chrome。请安装 Chrome/Chromium，或设置 AWEN_E2E_CHROME 指向浏览器可执行文件（平台：${os.platform()}）。`,
  );
}
