import { describe, expect, test } from "bun:test";
import { normalizeStoreData } from "./state-normalizer";
import type { Tournament } from "../core/types";

describe("state normalization", () => {
  // Fixtures here look older because that is exactly what we need to protect.
  test("fills defaults for older saved tournaments", () => {
    const data = normalizeStoreData({
      tournament: {
        number: 1,
        name: "Legacy",
        structure: "swiss",
        topCut: null,
        stage: "main",
        guildId: "guild",
        channelId: "channel",
        signupMessageId: null,
        phase: "signup",
        rounds: [],
        players: {},
        createdAt: "x",
        endedAt: null,
      } as unknown as Tournament,
      history: [],
    });

    expect(data.tournament?.swissRounds).toBeNull();
    expect(data.tournament?.doubleElimination).toBeNull();
    expect(data.tournament?.signupChannelId).toBe("channel");
    expect(data.tournament?.dropMessageId).toBeNull();
  });

  test("repairs duplicate tournament numbers", () => {
    const tournament = {
      number: 1,
      name: "Legacy",
      structure: "swiss",
      topCut: null,
      stage: "main",
      guildId: "guild",
      channelId: "channel",
      signupChannelId: "channel",
      pairingChannelId: "channel",
      dropsChannelId: "channel",
      signupMessageId: null,
      dropMessageId: null,
      phase: "ended",
      rounds: [],
      players: {},
      createdAt: "x",
      endedAt: "x",
    };
    const data = normalizeStoreData({ history: [tournament as unknown as Tournament, { ...tournament } as unknown as Tournament] });

    expect(data.history.map((item) => item.number)).toEqual([1, 2]);
  });
});
