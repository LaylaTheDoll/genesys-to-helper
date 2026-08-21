import { eliminationCandidates, pairEliminationRound } from "./elimination";
import { advanceDoubleEliminationState, canPairDoubleElimination, pairDoubleEliminationRound } from "./double-elimination";
import { activePlayers, pairKey, playedPairs } from "./common";
import { pairRoundRobinRound } from "./round-robin";
import { pairSwissRound } from "./swiss";
import type { Round, Tournament } from "../core/types";

export { advanceDoubleEliminationState } from "./double-elimination";

export function swissRoundCount(tournament: Tournament): number {
  if (tournament.swissRounds !== null) return tournament.swissRounds;
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, activePlayers(tournament).length))));
}

export function canPairNextRound(tournament: Tournament): boolean {
  const candidates = activePlayers(tournament);
  if (tournament.structure === "roundRobin") {
    const pairsPlayed = playedPairs(tournament);
    return candidates.some((player, index) => candidates.slice(index + 1).some((opponent) => !pairsPlayed.has(pairKey(player.userId, opponent.userId))));
  }
  if (tournament.structure === "singleElimination" || (tournament.structure === "swissTopCut" && tournament.stage === "topCut")) {
    return eliminationCandidates(tournament).length > 1;
  }
  if (tournament.structure === "doubleElimination") return canPairDoubleElimination(tournament);
  return candidates.length >= 2;
}

export function pairNextRound(tournament: Tournament): Round {
  if (tournament.structure === "roundRobin") return pairRoundRobinRound(tournament);
  if (tournament.structure === "singleElimination") return pairEliminationRound(tournament);
  if (tournament.structure === "doubleElimination") return pairDoubleEliminationRound(tournament);
  if (tournament.structure === "swissTopCut" && tournament.stage === "topCut") return pairEliminationRound(tournament);
  return pairSwissRound(tournament);
}

export function isRoundComplete(round: Round): boolean {
  return round.matches.every((match) => match.pairing.kind === "bye" || match.report !== null);
}
