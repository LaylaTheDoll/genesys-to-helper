import { describe, expect, test } from "bun:test";
import { formatMessage, messages } from "./messages";

describe("message templates", () => {
  test("replaces placeholders and escaped newlines", () => {
    expect(
      formatMessage(messages.roundAnnouncement, {
        label: "Round 1",
        lines: "A vs B",
      }),
    ).toContain("**Round 1**\nA vs B");
  });
});