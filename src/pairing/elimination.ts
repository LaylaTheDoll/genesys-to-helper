import { computeStandings } from "../core/tiebreakers";
import type { Match, Player, Round, Tournament } from "../core/types";
import { activePlayers, createBye, createDuel } from "./common";

// Single elimination and Top Cut share the same simple winner-advances flow.

export function eliminationCandidates(tournament: Tournament): Player[] {
  if (tournament.structure === "swissTopCut" && tournament.stage === "topCut" && tournament.rounds.length === (tournament.swissRounds ?? 0)) {
    const topCutSize = tournament.topCut ?? 8;
    return computeStandings(tournament).filter((row) => !row.player.dropped).slice(0, topCutSize).map((row) => row.player);
  }

  const lastRound = tournament.rounds[tournament.rounds.length - 1];
  if (!lastRound) return activePlayers(tournament);
  const winners: Player[] = [];
  for (const match of lastRound.matches) {
    if (match.pairing.kind === "bye") {
      const player = tournament.players[match.pairing.playerId];
      if (player && !player.dropped) winners.push(player);
    } else if (match.report?.kind === "win") {
      const player = tournament.players[match.report.winnerId];
      if (player && !player.dropped) winners.push(player);
    }
  }
  return winners;
}

export function pairEliminationRound(tournament: Tournament): Round {
  const roundNumber = tournament.rounds.length + 1;
  const candidates = eliminationCandidates(tournament);
  const matches: Match[] = [];
  while (candidates.length >= 2) {
    const playerA = candidates.shift() as Player;
    const playerB = candidates.pop() as Player;
    matches.push(createDuel(roundNumber, matches.length, playerA.userId, playerB.userId));
  }
  if (candidates.length === 1) matches.push(createBye(roundNumber, matches.length, candidates[0] as Player));
  return { number: roundNumber, pairedAt: new Date().toISOString(), matches };
}
