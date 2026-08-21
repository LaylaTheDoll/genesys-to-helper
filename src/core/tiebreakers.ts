import type { Match, Player, Tournament } from "./types";
import { isBye, pairingPlayers } from "./types";

// All standings math stays here so the dashboard and bot agree on rankings.

export const WIN_POINTS = 3 as const;
export const MWP_FLOOR = 0.33 as const;

export type StandingRow = {
  rank: number;
  player: Player;
  points: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  roundsPlayed: number;
  matchWinPct: number;
  omwPct: number;
  oppOmwPct: number;
  sumSqLostRounds: number;
};

export function matchesOf(t: Tournament, playerId: string): Match[] {
  return t.rounds.flatMap((r) =>
    r.matches.filter((m) => pairingPlayers(m.pairing).includes(playerId)),
  );
}

function pointsAndOutcome(m: Match, playerId: string): { points: number; isWin: boolean; isLoss: boolean } | null {
  if (isBye(m.pairing)) {
    if (m.pairing.playerId !== playerId) return null;
    return { points: WIN_POINTS, isWin: true, isLoss: false };
  }
  if (m.report === null) return null;
  if (m.report.kind === "doubleLoss") {
    return { points: 0, isWin: false, isLoss: true };
  }
  const winner = m.report.winnerId;
  const loser = winner === m.pairing.playerA ? m.pairing.playerB : m.pairing.playerA;
  if (winner === playerId) return { points: WIN_POINTS, isWin: true, isLoss: false };
  if (loser === playerId) return { points: 0, isWin: false, isLoss: true };
  return null;
}

export function pointsFor(t: Tournament, playerId: string): number {
  return matchesOf(t, playerId).reduce((acc, m) => acc + (pointsAndOutcome(m, playerId)?.points ?? 0), 0);
}

export function roundsPlayed(t: Tournament, playerId: string): number {
  return matchesOf(t, playerId).filter((m) => pointsAndOutcome(m, playerId) !== null).length;
}

export function matchWinPct(t: Tournament, playerId: string): number {
  const played = roundsPlayed(t, playerId);
  if (played === 0) return 0;
  const pct = pointsFor(t, playerId) / (WIN_POINTS * played);
  return Math.max(pct, MWP_FLOOR);
}

export function opponentsOf(t: Tournament, playerId: string): string[] {
  const out: string[] = [];
  for (const m of matchesOf(t, playerId)) {
    if (isBye(m.pairing)) continue;
    if (m.pairing.playerA === playerId) out.push(m.pairing.playerB);
    else if (m.pairing.playerB === playerId) out.push(m.pairing.playerA);
  }
  return out;
}

export function omwPct(t: Tournament, playerId: string): number {
  const opps = opponentsOf(t, playerId);
  if (opps.length === 0) return 0;
  const sum = opps.reduce((acc, id) => acc + matchWinPct(t, id), 0);
  return sum / opps.length;
}

export function oppOmwPct(t: Tournament, playerId: string): number {
  const opps = opponentsOf(t, playerId);
  if (opps.length === 0) return 0;
  const sum = opps.reduce((acc, id) => acc + omwPct(t, id), 0);
  return sum / opps.length;
}

export function sumSqLostRounds(t: Tournament, playerId: string): number {
  let sum = 0;
  for (const round of t.rounds) {
    for (const m of round.matches) {
      const outcome = pointsAndOutcome(m, playerId);
      if (outcome?.isLoss) sum += round.number ** 2;
    }
  }
  return sum;
}

export function playerRecord(t: Tournament, playerId: string): { wins: number; losses: number; gamesWon: number; gamesLost: number } {
  let wins = 0;
  let losses = 0;
  let gamesWon = 0;
  let gamesLost = 0;
  for (const m of matchesOf(t, playerId)) {
    const outcome = pointsAndOutcome(m, playerId);
    if (outcome === null) continue;
    if (outcome.isWin) wins++;
    else losses++;
    if (m.report !== null && m.report.kind === "win") {
      if (m.report.winnerId === playerId) {
        gamesWon += m.report.games.winner;
        gamesLost += m.report.games.loser;
      } else {
        gamesLost += m.report.games.winner;
        gamesWon += m.report.games.loser;
      }
    }
  }
  return { wins, losses, gamesWon, gamesLost };
}

export function computeStandings(t: Tournament): StandingRow[] {
  // This is deliberately calculated from matches, not stored as extra state.
  const rows = Object.values(t.players).map((player) => {
    const { wins, losses, gamesWon, gamesLost } = playerRecord(t, player.userId);
    return {
      player,
      points: pointsFor(t, player.userId),
      wins,
      losses,
      gamesWon,
      gamesLost,
      roundsPlayed: roundsPlayed(t, player.userId),
      matchWinPct: matchWinPct(t, player.userId),
      omwPct: omwPct(t, player.userId),
      oppOmwPct: oppOmwPct(t, player.userId),
      sumSqLostRounds: sumSqLostRounds(t, player.userId),
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.omwPct !== a.omwPct) return b.omwPct - a.omwPct;
    if (b.oppOmwPct !== a.oppOmwPct) return b.oppOmwPct - a.oppOmwPct;
    if (a.sumSqLostRounds !== b.sumSqLostRounds) return b.sumSqLostRounds - a.sumSqLostRounds;
    return a.player.username.localeCompare(b.player.username);
  });

  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}
