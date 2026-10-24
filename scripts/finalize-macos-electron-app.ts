import { execFileSync } from "node:child_process";
import {errorCode} from '../types/data.ts';
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const [appArgument] = process.argv.slice(2);
if (!appArgument) {
  throw new Error("Usage: node scripts/finalize-macos-electron-app.ts <app-bundle>");
}
if (process.platform !== "darwin") {
  throw new Error("macOS Electron app signing must run on macOS");
}

const appPath = path.resolve(appArgument);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

const bundleExtensions = new Set([".app", ".appex", ".bundle", ".framework", ".xpc"]);
const nestedCodeRoots = ["Frameworks", "Helpers", "Library", "PlugIns", "XPCServices"]
  .map((directory) => path.join(appPath, "Contents", directory));

async function collectNestedCode(directory: string, codeFiles: string[], bundles: string[]) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      if (bundleExtensions.has(path.extname(entry.name))) {
        bundles.push(entryPath);
      }
      await collectNestedCode(entryPath, codeFiles, bundles);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const fileType = execFileSync("/usr/bin/file", ["-b", entryPath], { encoding: "utf8" });
    if (fileType.startsWith("Mach-O")) {
      codeFiles.push(entryPath);
    }
  }
}

function deepestFirst(paths: string[]) {
  return [...new Set(paths)].sort((left, right) => {
    const depthDifference = right.split(path.sep).length - left.split(path.sep).length;
    return depthDifference || left.localeCompare(right);
  });
}

function sign(codePath: string) {
  execFileSync(
    "/usr/bin/codesign",
    ["--force", "--sign", "-", "--timestamp=none", codePath],
    { stdio: "inherit" },
  );
}

const codeFiles: string[] = [];
const bundles: string[] = [];
for (const nestedCodeRoot of nestedCodeRoots) {
  await collectNestedCode(nestedCodeRoot, codeFiles, bundles);
}
for (const codeFile of deepestFirst(codeFiles)) {
  sign(codeFile);
}
for (const bundle of deepestFirst(bundles)) {
  sign(bundle);
}
sign(appPath);

execFileSync(
  process.execPath,
  [path.join(scriptDirectory, "verify-macos-electron-app.ts"), appPath],
  { stdio: "inherit" },
);
