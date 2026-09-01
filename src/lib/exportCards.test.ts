import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_LIMIT,
  mapExportCard,
  mapExportRoom,
  parseExportCardQuery,
} from "./exportCards";
import {
  EXPORT_TOKEN_PREFIX,
  extractExportToken,
  generateExportToken,
  hashExportToken,
  hashesMatch,
} from "./exportToken";

describe("exportCards", () => {
  it("requires roomId and clamps pagination", () => {
    expect(() => parseExportCardQuery({})).toThrow(/roomId/);
    const parsed = parseExportCardQuery({
      roomId: "sala-1",
      archived: "true",
      status: "ready_for_qa",
      limit: "9999",
      offset: "-4",
    });
    expect(parsed.roomId).toBe("sala-1");
    expect(parsed.includeArchived).toBe(true);
    expect(parsed.status).toBe("ready_for_qa");
    expect(parsed.limit).toBe(500);
    expect(parsed.offset).toBe(0);
    expect(parseExportCardQuery({ roomId: "sala-1" }).limit).toBe(DEFAULT_EXPORT_LIMIT);
  });

  it("maps a room and a card with a stable public url", () => {
    expect(
      mapExportRoom({
        id: "board-qa",
        name: "QA permanente",
        room_type: "board",
        status: "active",
        project: "App",
      })
    ).toEqual({
      id: "board-qa",
      name: "QA permanente",
      type: "board",
      status: "active",
      project: "App",
      cardsPath: "/api/export/cards?roomId=board-qa",
    });

    const card = mapExportCard(
      {
        id: "bug-1",
        war_room_id: "board-qa",
        title: "Login quebra no iOS",
        description: "Passos…",
        criticism: "blocker",
        status: "in_progress",
        kanban_column_id: "doing",
        owner_name: "Ana",
        environment: "production",
        affected_url: "https://app.example/login",
        build_version: "1.2.3",
        tags: ["ios"],
        priority: "high",
        type: "bug",
        duplicate_of_bug_id: null,
        created_at: "2026-09-01T12:00:00.000Z",
        updated_at: "2026-09-01T13:00:00.000Z",
        created_by_name: "QA",
        resolved_at: null,
        archived: false,
      },
      "https://force-qa.vercel.app/"
    );
    expect(card.url).toBe("https://force-qa.vercel.app/?room=board-qa&card=bug-1");
    expect(card.severity).toBe("blocker");
    expect(card.column).toBe("doing");
    expect(card.tags).toEqual(["ios"]);
  });
});

describe("exportToken", () => {
  it("hashes a generated token in a way we can look up later", () => {
    const generated = generateExportToken();
    expect(generated.token.startsWith(EXPORT_TOKEN_PREFIX)).toBe(true);
    expect(generated.prefix).toBe(generated.token.slice(0, 12));
    expect(hashExportToken(generated.token)).toBe(generated.hash);
    expect(hashesMatch(generated.hash, generated.hash)).toBe(true);
    expect(hashesMatch(generated.hash, hashExportToken("fqex_other"))).toBe(false);
  });

  it("accepts Bearer or X-Api-Key and rejects junk", () => {
    const token = `${EXPORT_TOKEN_PREFIX}${"a".repeat(24)}`;
    expect(extractExportToken(`Bearer ${token}`, "")).toBe(token);
    expect(extractExportToken(undefined, token)).toBe(token);
    expect(() => extractExportToken("Bearer nope", "")).toThrow(/Token inválido/);
  });
});
