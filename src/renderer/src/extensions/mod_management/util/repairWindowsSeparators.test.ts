import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "path";

import { afterEach, describe, expect, test } from "vitest";

import { repairWindowsSeparators } from "./repairWindowsSeparators";

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "vortex-sep-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("repairWindowsSeparators", () => {
  test("splits a windows archive filename into directories", async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, "Azar\\opponent_abl.lua"), "return {}\n");
    await writeFile(path.join(root, "Videos\\Loading\\g01day_01.dds"), "dds");
    await mkdir(path.join(root, "Data"), { recursive: true });
    await writeFile(path.join(root, "Data", "keep.lua"), "keep");

    const result = await repairWindowsSeparators(root);

    expect(result.renamed).toBe(2);
    expect(result.skipped).toEqual([]);
    expect(await readFile(path.join(root, "Azar", "opponent_abl.lua"), "utf8")).toBe("return {}\n");
    expect(await readFile(path.join(root, "Videos", "Loading", "g01day_01.dds"), "utf8")).toBe(
      "dds",
    );
    expect(await readFile(path.join(root, "Data", "keep.lua"), "utf8")).toBe("keep");
  });

  test("repairs names nested inside a directory that itself uses backslashes", async () => {
    const root = await makeRoot();
    const nested = path.join(root, "foo\\bar");
    await mkdir(nested);
    await writeFile(path.join(nested, "nested\\file.txt"), "inner");

    const result = await repairWindowsSeparators(root);

    expect(result.renamed).toBe(2);
    expect(await readFile(path.join(root, "foo", "bar", "nested", "file.txt"), "utf8")).toBe(
      "inner",
    );
  });

  test("leaves an existing destination in place", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, "Azar"));
    await writeFile(path.join(root, "Azar", "opponent_abl.lua"), "already");
    await writeFile(path.join(root, "Azar\\opponent_abl.lua"), "flat");

    const result = await repairWindowsSeparators(root);

    expect(result.renamed).toBe(0);
    expect(result.skipped).toEqual([
      { name: "Azar\\opponent_abl.lua", reason: "destination exists" },
    ]);
    expect(await readFile(path.join(root, "Azar", "opponent_abl.lua"), "utf8")).toBe("already");
    expect(await readFile(path.join(root, "Azar\\opponent_abl.lua"), "utf8")).toBe("flat");
  });

  test("does not follow a parent-directory segment", async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, "..\\outside.txt"), "nope");

    const result = await repairWindowsSeparators(root);

    expect(result.renamed).toBe(0);
    expect(result.skipped).toEqual([{ name: "..\\outside.txt", reason: "unsafe path" }]);
    expect(await readFile(path.join(root, "..\\outside.txt"), "utf8")).toBe("nope");
  });
});
