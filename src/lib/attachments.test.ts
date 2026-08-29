import { describe, expect, it } from "vitest";
import { attachmentsOf, makeAttachment, parseAttachments, primaryAttachmentUrl } from "./attachments";

describe("attachments", () => {
  it("parses valid https items and drops junk", () => {
    expect(
      parseAttachments([
        { id: "1", url: "https://cdn.example/a.png", kind: "file" },
        { url: "javascript:alert(1)", kind: "file" },
        { url: "https://figma.com/file/x", kind: "prototype" },
        null,
      ])
    ).toEqual([
      { id: "1", url: "https://cdn.example/a.png", kind: "file" },
      { id: "att-2", url: "https://figma.com/file/x", kind: "prototype" },
    ]);
  });

  it("falls back to legacy evidence and prototype", () => {
    const bug = {
      evidenceUrl: "https://cdn.example/shot.png",
      prototypeUrl: "https://cdn.example/proto.png",
    };
    expect(attachmentsOf(bug).map((item) => item.kind)).toEqual(["file", "prototype"]);
    expect(primaryAttachmentUrl(bug)).toBe("https://cdn.example/shot.png");
    expect(attachmentsOf({ attachments: [makeAttachment("https://cdn.example/new.png")], evidenceUrl: bug.evidenceUrl })).toHaveLength(1);
  });
});
