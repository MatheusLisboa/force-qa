import { describe, expect, it } from "vitest";
import { findMentionedUsers } from "./mentions";

describe("findMentionedUsers", () => {
  const users = [
    { id: "1", name: "Maria Silva" },
    { id: "2", name: "João" },
    { id: "3", name: "Ana" },
  ];

  it("matches full name and first name, without duplicating", () => {
    expect(findMentionedUsers("oi @Maria Silva e @João", users).map((u) => u.id)).toEqual(["1", "2"]);
    expect(findMentionedUsers("@Maria olha isso", users).map((u) => u.id)).toEqual(["1"]);
  });

  it("ignores unmatched tokens and is case-insensitive", () => {
    expect(findMentionedUsers("@ANA e @ninguém", users).map((u) => u.id)).toEqual(["3"]);
    expect(findMentionedUsers("sem arroba Maria", users)).toEqual([]);
  });
});
