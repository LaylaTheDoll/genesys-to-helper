import { describe, expect, test } from "bun:test";
import { TournamentService, type TournamentStore } from "./service";
import type { Match, Player, StoreData, Tournament } from "../core/types";

function player(userId: string): Player {
  return {
    userId,
    username: `player-${userId}`,
    decklist: { link: "https://example.test/deck", submittedAt: "x" },
    archetype: null,
    dropped: false,
    byeCount: 0,
    signedUpAt: "x",
  };
}

function runningTournament(match: Match): Tournament {
  return {
    number: 1,
    name: "Test",
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
    phase: "running",
    rounds: [{ number: 1, pairedAt: "x", matches: [match] }],
    players: { a: player("a"), b: player("b") },
    createdAt: "x",
    endedAt: null,
  };
}

function fakeStore(tournament: Tournament | null = null): { store: TournamentStore; data: StoreData } {
  const data: StoreData = { tournament, history: [] };
  return {
    data,
    store: {
      data,
      save: () => undefined,
      archive: () => { data.tournament = null; },
    },
  };
}

describe("TournamentService", () => {
  test("cleans up signup messages when drop-channel creation fails", async () => {
    let deleted = false;
    const signupChannel = {
      send: async () => ({ id: "signup", delete: async () => { deleted = true; } }),
    };
    const dropChannel = {
      send: async () => { throw new Error("drop channel unavailable"); },
    };
    const { store, data } = fakeStore();
    const service = new TournamentService(store, null);

    await expect(service.create("Test", signupChannel, "guild", "signup", { dropChannel })).rejects.toThrow("drop channel unavailable");
    expect(deleted).toBe(true);
    expect(data.tournament).toBeNull();
  });

  test("rejects impossible match scores before writing a result", async () => {
    const match: Match = {
      id: "match",
      pairing: { kind: "duel", playerA: "a", playerB: "b" },
      report: null,
      threadId: null,
    };
    const { store } = fakeStore(runningTournament(match));
    const service = new TournamentService(store, null);

    await expect(service.reportWin("a", 3, 2)).rejects.toThrow("use 2-0 or 2-1");
    expect(match.report).toBeNull();
  });

  test("does not end while the current round is pending", async () => {
    const match: Match = {
      id: "match",
      pairing: { kind: "duel", playerA: "a", playerB: "b" },
      report: null,
      threadId: null,
    };
    const { store } = fakeStore(runningTournament(match));
    const service = new TournamentService(store, null);

    await expect(service.end()).rejects.toThrow("finish or double-loss");
  });

  test("requires the TO to start Top Cut explicitly", async () => {
    const match: Match = {
      id: "match",
      pairing: { kind: "duel", playerA: "a", playerB: "b" },
      report: { kind: "win", winnerId: "a", games: { winner: 2, loser: 0 }, reportedBy: "a", reportedAt: "x" },
      threadId: null,
    };
    const tournament = runningTournament(match);
    tournament.structure = "swissTopCut";
    tournament.swissRounds = 1;
    const { store } = fakeStore(tournament);
    const service = new TournamentService(store, null);

    await expect(service.pair()).rejects.toThrow("must start Top Cut");
    await expect(service.startTopCut()).resolves.toContain("Top Cut started");
    expect(tournament.stage).toBe("topCut");
  });
});
