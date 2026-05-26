import { describe, expect, it } from "vitest";
import { LEAVE_CONFIRM_COPY } from "./editorCopy";

describe("editor leave confirmation copy", () => {
  it("uses English copy for leaving with unsaved changes", () => {
    expect(LEAVE_CONFIRM_COPY.body).toBe(
      "You have unsaved changes. If you leave now, they will be lost.",
    );
  });
});
