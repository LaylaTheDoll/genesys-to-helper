import { describe, expect, test } from "bun:test";
import {
  MWP_FLOOR,
  WIN_POINTS,
  computeStandings,
  matchWinPct,
  omwPct,
  oppOmwPct,
  pointsFor,
  roundsPlayed,
  sumSqLostRounds,
} from "./tiebreakers";
import { advanceDoubleEliminationState, canPairNextRound, pairNextRound } from "../pairing";
import type { Match, Tournament } from "./types";

// These tests exercise tournament math without needing Discord running.

function player(id: string) {
  return {
    userId: id,
    username: `player-${id}`,
    decklist: null,
    archetype: null,
    dropped: false,
    byeCount: 0,
    signedUpAt: new Date().toISOString(),
  };
}

function tour(ids: string[], rounds: Match[][], structure: Tournament["structure"] = "swiss"): Tournament {
  return {
    number: 1,
    name: "test",
    structure,
    topCut: structure === "swissTopCut" ? 4 : null,
    swissRounds: null,
    stage: "main",
    doubleElimination: structure === "doubleElimination" ? { kind: "winners", round: 1 } : null,
    guildId: "g",
    channelId: "c",
    signupChannelId: "c",
    pairingChannelId: "c",
    dropsChannelId: "c",
    signupMessageId: null,
    dropMessageId: null,
    phase: "running",
    rounds: rounds.map((matches, i) => ({ number: i + 1, pairedAt: new Date().toISOString(), matches })),
    players: Object.fromEntries(ids.map((id) => [id, player(id)])),
    createdAt: new Date().toISOString(),
    endedAt: null,
  };
}

function win(a: string, b: string, winner: string, gw = 2, gl = 0): Match {
  return {
    id: `${a}-${b}`,
    pairing: { kind: "duel", playerA: a, playerB: b },
    report: { kind: "win", winnerId: winner, games: { winner: gw, loser: gl }, reportedBy: winner, reportedAt: new Date().toISOString() },
    threadId: null,
  };
}

function doubleLoss(a: string, b: string): Match {
  return {
    id: `${a}-${b}`,
    pairing: { kind: "duel", playerA: a, playerB: b },
    report: { kind: "doubleLoss", reportedBy: "admin", reportedAt: new Date().toISOString() },
    threadId: null,
  };
}

function bye(playerId: string): Match {
  return { id: `bye-${playerId}`, pairing: { kind: "bye", playerId }, report: null, threadId: null };
}

describe("match points and win percentage (Konami v2.5)", () => {
  test("3 points per match win, 0 per loss, double loss gives 0 to both", () => {
    const t = tour(["A", "B", "C"], [[win("A", "B", "A")], [doubleLoss("B", "C")], [win("A", "C", "A")]]);
    expect(pointsFor(t, "A")).toBe(6);
    expect(pointsFor(t, "B")).toBe(0);
    expect(pointsFor(t, "C")).toBe(0);
  });

  test("bye counts as a match win (3 points) and as a round played", () => {
    const t = tour(["A", "B"], [[bye("A")], [win("A", "B", "A")]]);
    expect(pointsFor(t, "A")).toBe(6);
    expect(roundsPlayed(t, "A")).toBe(2);
    expect(matchWinPct(t, "A")).toBe(1);
  });

  test("MWP = points / (3 x rounds played), floored at 0.33", () => {
    const t = tour(["A", "B", "C", "D"], [
      [win("A", "B", "B"), win("C", "D", "D")],
      [win("A", "C", "C"), win("B", "D", "D")],
      [win("A", "D", "D"), win("B", "C", "C")],
    ]);
    expect(pointsFor(t, "A")).toBe(0);
    expect(matchWinPct(t, "A")).toBe(MWP_FLOOR);
    expect(matchWinPct(t, "D")).toBe(1);
  });

  test("policy example: lost rounds 2 and 7 => DDD = 4 + 49 = 53", () => {
    const t = tour(["P", "X1", "X2", "X3", "X4", "X5", "X6", "X7"], [
      [win("P", "X1", "P")],
      [win("X2", "P", "X2")],
      [win("P", "X3", "P")],
      [win("P", "X4", "P")],
      [win("P", "X5", "P")],
      [win("P", "X6", "P")],
      [win("X7", "P", "X7")],
    ]);
    expect(sumSqLostRounds(t, "P")).toBe(53);
    expect(pointsFor(t, "P")).toBe(5 * WIN_POINTS);
    expect(matchWinPct(t, "P")).toBeCloseTo(15 / 21, 6);
  });

  test("double loss counts as a lost round for DDD and 0 points", () => {
    const t = tour(["A", "B", "C"], [[win("A", "B", "A")], [doubleLoss("A", "C")]]);
    expect(sumSqLostRounds(t, "A")).toBe(4);
    expect(pointsFor(t, "A")).toBe(3);
  });
});

describe("tournament structures", () => {
  test("round robin avoids previously played pairings", () => {
    const t = tour(["A", "B", "C", "D"], [], "roundRobin");
    const first = pairNextRound(t);
    expect(first.matches).toHaveLength(2);
    for (const match of first.matches) {
      if (match.pairing.kind === "duel") match.report = { kind: "win", winnerId: match.pairing.playerA, games: { winner: 2, loser: 0 }, reportedBy: "admin", reportedAt: "x" };
    }
    t.rounds.push(first);
    const second = pairNextRound(t);
    expect(second.matches).toHaveLength(2);
    expect(canPairNextRound(t)).toBe(true);
  });

  test("single elimination ends after its final winner", () => {
    const t = tour(["A", "B"], [], "singleElimination");
    const final = pairNextRound(t);
    expect(final.matches).toHaveLength(1);
    const match = final.matches[0];
    if (match?.pairing.kind === "duel") match.report = { kind: "win", winnerId: match.pairing.playerA, games: { winner: 2, loser: 0 }, reportedBy: "admin", reportedAt: "x" };
    t.rounds.push(final);
    expect(canPairNextRound(t)).toBe(false);
  });
});

describe("OMW% and opponent's opponents' OMW%", () => {
  test("OMW is the average of opponents' MWP, bye rounds are ignored", () => {
    const t = tour(["A", "B", "C", "D", "E", "F", "G"], [
      [win("A", "B", "A"), win("C", "D", "C"), win("E", "F", "E"), bye("G")],
      [win("A", "C", "A"), win("B", "E", "E"), win("D", "F", "F"), bye("G")],
      [win("A", "E", "A"), win("B", "D", "B"), win("C", "F", "C"), bye("G")],
    ]);
    const standings = computeStandings(t);
    const b = standings.find((r) => r.player.userId === "B") as NonNullable<ReturnType<typeof computeStandings>>[number];
    const c = standings.find((r) => r.player.userId === "C") as NonNullable<ReturnType<typeof computeStandings>>[number];
    expect(b.points).toBe(3);
    expect(c.points).toBe(6);
    expect(b.omwPct).toBeCloseTo((1 + 2 / 3 + MWP_FLOOR) / 3, 4);
    expect(c.omwPct).toBeCloseTo((1 + MWP_FLOOR + 1 / 3) / 3, 4);
    expect(c.rank).toBeLessThan(b.rank);
  });

  test("an 0-win opponent is floored to 0.33 in OMW", () => {
    const t = tour(["A", "B", "C"], [[win("A", "B", "A")], [win("A", "C", "A")]]);
    expect(matchWinPct(t, "B")).toBe(MWP_FLOOR);
    expect(omwPct(t, "A")).toBeCloseTo((MWP_FLOOR + MWP_FLOOR) / 2, 4);
  });

  test("oppOmw is the average of each opponent's own OMW", () => {
    const t = tour(["P", "Q", "X", "Y", "Z"], [
      [win("P", "Q", "P"), win("X", "Y", "X")],
      [win("P", "X", "P"), win("Z", "Q", "Q")],
    ]);
    expect(oppOmwPct(t, "P")).toBeCloseTo(omwPct(t, "Q"), 6);
    expect(oppOmwPct(t, "Q")).toBeCloseTo(omwPct(t, "P"), 6);
  });
});

describe("standings ordering", () => {
  test("points desc, then OMW desc, then oppOMW desc, then DDD desc, then name", () => {
    const t = tour(["A", "B", "C", "D", "E", "F", "G"], [
      [win("A", "B", "A"), win("C", "D", "C"), win("E", "F", "E"), bye("G")],
      [win("A", "C", "A"), win("B", "E", "E"), win("D", "F", "F"), bye("G")],
      [win("A", "E", "A"), win("B", "D", "B"), win("C", "F", "C"), bye("G")],
    ]);
    const idsByRank = computeStandings(t).map((r) => r.player.userId);
    expect(idsByRank).toEqual(["A", "G", "E", "C", "B", "F", "D"]);
  });

  test("DDD prefers losses in later rounds", () => {
    const t = tour(["P1", "P2", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "X8"], [
      [win("X1", "P1", "X1"), win("P2", "X2", "P2")],
      [win("P1", "X3", "P1"), win("X4", "P2", "X4")],
      [win("P1", "X5", "P1"), win("P2", "X6", "P2")],
      [win("P1", "X7", "P1"), win("P2", "X8", "P2")],
    ]);
    const standings = computeStandings(t);
    const p1 = standings.find((r) => r.player.userId === "P1") as NonNullable<ReturnType<typeof computeStandings>>[number];
    const p2 = standings.find((r) => r.player.userId === "P2") as NonNullable<ReturnType<typeof computeStandings>>[number];
    expect(p1.points).toBe(p2.points);
    expect(sumSqLostRounds(t, "P1")).toBe(1);
    expect(sumSqLostRounds(t, "P2")).toBe(4);
    expect(p2.rank).toBeLessThan(p1.rank);
  });
});

describe("swiss pairing", () => {
  test("first round pairs all even-count players with no byes", () => {
    const t = tour(["A", "B", "C", "D", "E", "F", "G", "H"], []);
    const round = pairNextRound(t);
    expect(round.matches).toHaveLength(4);
    const seen = new Set<string>();
    for (const m of round.matches) {
      if (m.pairing.kind !== "duel") continue;
      seen.add(m.pairing.playerA);
      seen.add(m.pairing.playerB);
    }
    expect(seen.size).toBe(8);
  });

  test("odd player count produces exactly one bye; that player duels next round", () => {
    const t = tour(["A", "B", "C", "D", "E", "F", "G"], []);
    const r1 = pairNextRound(t);
    const byes = r1.matches.filter((m) => m.pairing.kind === "bye");
    expect(byes).toHaveLength(1);
    const byePlayer = (byes[0] as Match).pairing;
    if (byePlayer.kind !== "bye") throw new Error("expected bye");
    const t2: Tournament = { ...t, rounds: [r1] };
    const r2 = pairNextRound(t2);
    const duels = r2.matches.filter((m) => m.pairing.kind === "duel");
    expect(duels.some((m) => m.pairing.kind === "duel" && (m.pairing.playerA === byePlayer.playerId || m.pairing.playerB === byePlayer.playerId))).toBe(true);
  });

  test("round 2 never rematches round 1 duels", () => {
    const t = tour(["A", "B", "C", "D", "E", "F", "G", "H"], []);
    const r1 = pairNextRound(t);
    const t2: Tournament = { ...t, rounds: [r1] };
    const r2 = pairNextRound(t2);
    const pair1 = new Set(
      r1.matches
        .filter((m) => m.pairing.kind === "duel")
        .map((m) => (m.pairing.kind === "duel" ? [m.pairing.playerA, m.pairing.playerB].sort().join("|") : "")),
    );
    for (const m of r2.matches) {
      if (m.pairing.kind !== "duel") continue;
      const key = [m.pairing.playerA, m.pairing.playerB].sort().join("|");
      expect(pair1.has(key)).toBe(false);
    }
  });

  test("same-point players are paired together after round 1 results", () => {
    const t = tour(["A", "B", "C", "D"], []);
    const r1 = pairNextRound(t);
    const winners: string[] = [];
    const losers: string[] = [];
    const round1matches: Match[] = [];
    for (const m of r1.matches) {
      if (m.pairing.kind !== "duel") continue;
      round1matches.push(win(m.pairing.playerA, m.pairing.playerB, m.pairing.playerA));
      winners.push(m.pairing.playerA);
      losers.push(m.pairing.playerB);
    }
    const t2: Tournament = { ...t, rounds: [{ number: 1, pairedAt: new Date().toISOString(), matches: round1matches }] };
    const r2 = pairNextRound(t2);
    for (const m of r2.matches) {
      if (m.pairing.kind !== "duel") continue;
      const pair = m.pairing;
      const bothIn = (group: string[]) => group.includes(pair.playerA) && group.includes(pair.playerB);
      expect(bothIn(winners) || bothIn(losers)).toBe(true);
    }
  });

  test("forces rematches instead of creating self-pairings", () => {
    const t = tour(["A", "B", "C", "D"], [
      [win("A", "B", "A"), win("C", "D", "C")],
      [win("A", "C", "A"), win("B", "D", "B")],
      [win("A", "D", "A"), win("B", "C", "B")],
    ]);
    const round = pairNextRound(t);
    const duels = round.matches.filter((match) => match.pairing.kind === "duel");

    expect(duels).toHaveLength(2);
    expect(new Set(duels.flatMap((match) => match.pairing.kind === "duel" ? [match.pairing.playerA, match.pairing.playerB] : [])).size).toBe(4);
    expect(duels.every((match) => match.pairing.kind === "duel" && match.pairing.playerA !== match.pairing.playerB)).toBe(true);
  });

  test("pairing is deterministic for a given round number", () => {
    const t = tour(["A", "B", "C", "D", "E", "F"], []);
    const r1a = pairNextRound(t);
    const r1b = pairNextRound(tour(["A", "B", "C", "D", "E", "F"], []));
    expect(JSON.stringify(r1a.matches.map((m) => m.pairing))).toBe(JSON.stringify(r1b.matches.map((m) => m.pairing)));
  });
});

describe("double-elimination pairing", () => {
  function finish(t: Tournament, round: ReturnType<typeof pairNextRound>, winner?: string): void {
    for (const match of round.matches) {
      if (match.pairing.kind !== "duel") continue;
      const winnerId = winner && (match.pairing.playerA === winner || match.pairing.playerB === winner)
        ? winner
        : match.pairing.playerA;
      match.report = { kind: "win", winnerId, games: { winner: 2, loser: 0 }, reportedBy: winnerId, reportedAt: "x" };
    }
    t.rounds.push(round);
    advanceDoubleEliminationState(t);
  }

  test("uses canonical winners/losers feeds and grand-final reset", () => {
    const t = tour(["A", "B", "C", "D"], [], "doubleElimination");

    const winners1 = pairNextRound(t);
    expect(winners1.matches.every((m) => m.bracket === "winners" && m.bracketRound === 1)).toBe(true);
    finish(t, winners1);

    const losers1 = pairNextRound(t);
    expect(losers1.matches).toHaveLength(1);
    expect(losers1.matches[0]?.bracket).toBe("losers");
    finish(t, losers1);

    const winners2 = pairNextRound(t);
    expect(winners2.matches).toHaveLength(1);
    expect(winners2.matches[0]?.bracketRound).toBe(2);
    finish(t, winners2);

    const losers2 = pairNextRound(t);
    expect(losers2.matches[0]?.bracketRound).toBe(2);
    const losersChampion = losers2.matches[0]?.pairing.kind === "duel" ? losers2.matches[0].pairing.playerA : "";
    finish(t, losers2, losersChampion);

    const grandFinal = pairNextRound(t);
    expect(grandFinal.matches[0]?.bracket).toBe("grandFinal");
    const resetWinner = grandFinal.matches[0]?.pairing.kind === "duel" ? grandFinal.matches[0].pairing.playerB : "";
    finish(t, grandFinal, resetWinner);

    const reset = pairNextRound(t);
    expect(reset.matches[0]?.bracket).toBe("grandFinalReset");
    finish(t, reset);
    expect(canPairNextRound(t)).toBe(false);
  });

  test("keeps non-power-of-two double-elimination brackets moving", () => {
    for (const playerCount of [5, 6, 7]) {
      const ids = Array.from({ length: playerCount }, (_, index) => `P${index}`);
      const t = tour(ids, [], "doubleElimination");
      let steps = 0;

      while (canPairNextRound(t) && steps < 20) {
        const round = pairNextRound(t);
        expect(round.matches.length).toBeGreaterThan(0);
        expect(round.matches.every((match) => Number.isInteger(match.bracketRound))).toBe(true);
        for (const match of round.matches) {
          if (match.pairing.kind !== "duel") continue;
          match.report = { kind: "win", winnerId: match.pairing.playerA, games: { winner: 2, loser: 0 }, reportedBy: "admin", reportedAt: "x" };
        }
        t.rounds.push(round);
        advanceDoubleEliminationState(t);
        steps++;
      }

      expect(t.doubleElimination).toBeNull();
      expect(steps).toBeLessThan(20);
    }
  });
});
