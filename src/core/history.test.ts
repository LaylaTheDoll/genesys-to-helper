import { describe, expect, test } from "bun:test";
import { availableMonths, filterByMonth, metaForPeriod, monthKey, periodSummary } from "./history";
import type { Match, Tournament } from "./types";

// Archive reporting stays testable as plain data.

function player(id: string, archetype: string | null = null) {
  return { userId: id, username: `player-${id}`, decklist: null, archetype, dropped: false, byeCount: 0, signedUpAt: "x" };
}

function win(a: string, b: string, winner: string): Match {
  return {
    id: `m-${a}-${b}`,
    pairing: { kind: "duel", playerA: a, playerB: b },
    report: { kind: "win", winnerId: winner, games: { winner: 2, loser: 0 }, reportedBy: winner, reportedAt: "x" },
    threadId: null,
  };
}

function doubleLoss(a: string, b: string): Match {
  return {
    id: `dl-${a}-${b}`,
    pairing: { kind: "duel", playerA: a, playerB: b },
    report: { kind: "doubleLoss", reportedBy: "admin", reportedAt: "x" },
    threadId: null,
  };
}

function tour(name: string, createdAt: string, players: Record<string, string | null>, rounds: Match[][], byes: string[] = []): Tournament {
  const p: Record<string, ReturnType<typeof player>> = {};
  for (const [id, archetype] of Object.entries(players)) p[id] = player(id, archetype);
  for (const id of byes) p[id] = player(id, null);
  const matches = rounds.map((ms, i) => [
    ...ms,
    ...byes.map((b) => ({ id: `bye-${b}-${i}`, pairing: { kind: "bye" as const, playerId: b }, report: null, threadId: null })),
  ]);
  return {
    number: 1,
    name,
    structure: "swiss",
    topCut: null,
    swissRounds: null,
    stage: "main",
    doubleElimination: null,
    guildId: "g",
    channelId: "c",
    signupChannelId: "c",
    pairingChannelId: "c",
    dropsChannelId: "c",
    signupMessageId: null,
    dropMessageId: null,
    phase: "ended",
    rounds: matches.map((ms, i) => ({ number: i + 1, pairedAt: "x", matches: ms })),
    players: p as Record<string, Tournament["players"][string]>,
    createdAt,
    endedAt: createdAt,
  };
}

describe("history month filtering", () => {
  test("month keys can use an explicit local timezone", () => {
    expect(monthKey("2026-08-01T02:30:00Z", "America/Sao_Paulo")).toBe("2026-07");
  });

  test("monthKey and filterByMonth select only the requested month", () => {
    const t1 = tour("Aug A", "2026-08-02T10:00:00Z", {}, []);
    const t2 = tour("Jul B", "2026-07-30T10:00:00Z", {}, []);
    const t3 = tour("Aug C", "2026-08-15T10:00:00Z", {}, []);
    expect(filterByMonth([t1, t2, t3], "2026-08").map((t) => t.name)).toEqual(["Aug A", "Aug C"]);
    expect(filterByMonth([t1, t2, t3], "2026-07").map((t) => t.name)).toEqual(["Jul B"]);
    expect(availableMonths([t1, t2])).toEqual(["2026-08", "2026-07"]);
  });
});

describe("period meta report", () => {
  test("representation share and win rate across tournaments; unassigned and double loss excluded", () => {
    const aug1 = tour("A", "2026-08-02T10:00:00Z", {
      A1: "rokket",
      B1: "denko",
      C1: null,
    }, [[win("A1", "B1", "A1"), win("C1", "B1", "B1")]]);
    const aug2 = tour("B", "2026-08-10T10:00:00Z", {
      A2: "denko",
      C2: "rokket",
    }, [[doubleLoss("A2", "C2")]]);
    const meta = metaForPeriod([aug1, aug2]);
    expect(meta.find((m) => m.archetype === "rokket")).toMatchObject({ players: 2, share: 0.5, wins: 1, losses: 0, winRate: 1 });
    expect(meta.find((m) => m.archetype === "denko")).toMatchObject({ players: 2, share: 0.5, wins: 0, losses: 1, winRate: 0 });
  });

  test("winless archetype gets 0 win rate, missing archetype never counted", () => {
    const t = tour("A", "2026-08-02T10:00:00Z", {
      A1: "stun",
      B1: "lab",
    }, [[win("B1", "A1", "B1")]]);
    const t2 = tour("B", "2026-08-03T10:00:00Z", {
      X1: null,
      Y1: "lab",
    }, [[win("X1", "Y1", "X1")]]);
    const meta = metaForPeriod([t, t2]);
    expect(meta.find((m) => m.archetype === "stun")).toMatchObject({ wins: 0, losses: 1, winRate: 0 });
    expect(meta.find((m) => m.archetype === "lab")).toMatchObject({ players: 2, wins: 1, losses: 0, winRate: 1 });
    expect(meta.some((m) => m.archetype === null)).toBe(false);
  });

  test("periodSummary counts tournaments, reported duels and distinct players", () => {
    const t = tour("A", "2026-08-02T10:00:00Z", { A1: "x", B1: "y" }, [[win("A1", "B1", "A1"), doubleLoss("X", "Y")]]);
    const t2 = tour("B", "2026-08-02T10:00:00Z", { A1: "x", B1: "y" }, [[win("A1", "B1", "B1")]]);
    expect(periodSummary([t, t2])).toEqual({ tournaments: 2, matches: 3, players: 2 });
  });
});
