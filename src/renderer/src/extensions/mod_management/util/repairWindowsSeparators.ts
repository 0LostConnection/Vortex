import { lstat, mkdir, readdir, rename } from "node:fs/promises";
import * as path from "path";

export interface ISkippedWindowsPath {
  name: string;
  reason: string;
}

export interface IRepairWindowsSeparatorsResult {
  renamed: number;
  skipped: ISkippedWindowsPath[];
}

/**
 * Rewrites extracted archive entries whose names contain `\` into a real
 * directory tree. On Linux a backslash is a legal filename character, and
 * 7-Zip keeps Windows zip separators in the name instead of creating folders.
 */
export async function repairWindowsSeparators(
  basePath: string,
): Promise<IRepairWindowsSeparatorsResult> {
  const skipped: ISkippedWindowsPath[] = [];
  const renamed = await repairDirectory(basePath, skipped);
  return { renamed, skipped };
}

async function repairDirectory(dir: string, skipped: ISkippedWindowsPath[]): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if (isNotFound(err)) {
      return 0;
    }
    throw err;
  }

  let renamed = 0;
  for (const name of names) {
    const fullPath = path.join(dir, name);
    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
      stats = await lstat(fullPath);
    } catch (err) {
      if (isNotFound(err)) {
        continue;
      }
      throw err;
    }

    if (name.includes("\\")) {
      renamed += await relocate(dir, name, stats.isDirectory(), skipped);
      continue;
    }

    if (stats.isDirectory()) {
      renamed += await repairDirectory(fullPath, skipped);
    }
  }
  return renamed;
}

async function relocate(
  dir: string,
  name: string,
  isDirectory: boolean,
  skipped: ISkippedWindowsPath[],
): Promise<number> {
  const segments = name.split("\\").filter((segment) => segment.length > 0);
  if (segments.length < 2 || segments.some((segment) => segment === "." || segment === "..")) {
    skipped.push({ name, reason: "unsafe path" });
    return 0;
  }

  const source = path.join(dir, name);
  const destination = path.join(dir, ...segments);
  try {
    await mkdir(path.dirname(destination), { recursive: true });
  } catch (err) {
    skipped.push({ name, reason: errorMessage(err) });
    return 0;
  }

  try {
    await lstat(destination);
    skipped.push({ name, reason: "destination exists" });
    return 0;
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }

  await rename(source, destination);
  if (isDirectory) {
    return 1 + (await repairDirectory(destination, skipped));
  }
  return 1;
}

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
