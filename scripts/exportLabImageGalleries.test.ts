import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportLabImageGalleries } from "./exportLabImageGalleries";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("exportLabImageGalleries", () => {
  it("registered만 지정하면 HTML과 중첩 자산은 복사하고 unregistered 컬렉션은 공개하지 않는다", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "not4k-lab-gallery-source-"));
    const outputRoot = await mkdtemp(join(tmpdir(), "not4k-lab-gallery-output-"));
    temporaryDirectories.push(workspaceRoot, outputRoot);

    await mkdir(join(workspaceRoot, "lab/image-galleries/registered/assets"), { recursive: true });
    await mkdir(join(workspaceRoot, "lab/image-galleries/unregistered"), { recursive: true });
    await writeFile(join(workspaceRoot, "lab/image-galleries/registered/index.html"), "<img src=\"assets/image.png\">");
    await writeFile(join(workspaceRoot, "lab/image-galleries/registered/assets/image.png"), "registered-image");
    await writeFile(join(workspaceRoot, "lab/image-galleries/unregistered/index.html"), "private");

    await exportLabImageGalleries({ workspaceRoot, outputRoot, galleryIds: ["registered"] });

    expect(await readFile(join(outputRoot, "lab/images/registered/index.html"), "utf8")).toContain("assets/image.png");
    expect(await readFile(join(outputRoot, "lab/images/registered/assets/image.png"), "utf8")).toBe("registered-image");
    await expect(access(join(outputRoot, "lab/images/unregistered/index.html"))).rejects.toThrow();
  });
});
