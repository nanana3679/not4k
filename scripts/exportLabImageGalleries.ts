import { access, cp } from "node:fs/promises";
import { join } from "node:path";

interface ExportLabImageGalleriesOptions {
  workspaceRoot: string;
  outputRoot: string;
  galleryIds: readonly string[];
}

const SAFE_GALLERY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function exportLabImageGalleries({
  workspaceRoot,
  outputRoot,
  galleryIds,
}: ExportLabImageGalleriesOptions): Promise<void> {
  for (const galleryId of galleryIds) {
    if (!SAFE_GALLERY_ID.test(galleryId)) {
      throw new Error(`Invalid Lab image gallery id: ${galleryId}`);
    }

    const sourceDirectory = join(workspaceRoot, "lab", "image-galleries", galleryId);
    const outputDirectory = join(outputRoot, "lab", "images", galleryId);
    await access(join(sourceDirectory, "index.html"));
    await cp(sourceDirectory, outputDirectory, { recursive: true, force: true });
  }
}
