import { describe, expect, test } from "bun:test";
import { DiscordGateway } from "./gateway";
import type { Tournament } from "../core/types";

function emptyTournament(): Tournament {
  return {
    number: 1,
    name: "Gateway test",
    structure: "swiss",
    topCut: null,
    swissRounds: null,
    stage: "main",
    doubleElimination: null,
    guildId: "guild",
    channelId: "channel",
    signupChannelId: "signup",
    pairingChannelId: "pairing",
    dropsChannelId: "drops",
    signupMessageId: null,
    dropMessageId: null,
    phase: "signup",
    rounds: [],
    players: {},
    createdAt: "x",
    endedAt: null,
  };
}

describe("DiscordGateway", () => {
  // These tests stay offline on purpose; Discord itself is not the unit under test.
  test("stays harmless when Discord is not connected", async () => {
    const gateway = new DiscordGateway(null);
    const tournament = emptyTournament();

    expect(await gateway.sendableFor("channel")).toBeNull();
    await gateway.createMatchThreads(tournament, { number: 1, pairedAt: "x", matches: [] });
    await gateway.deleteMatchThreads(tournament, "test");
    await gateway.deleteMessage("channel", null, "test");
  });
});
