import type { Match, Round, Tournament } from "../core/types";
import { activePlayers, createBye, createDuel, pairKey, playedPairs } from "./common";

// Round Robin just keeps finding pairs nobody has played yet.

export function pairRoundRobinRound(tournament: Tournament): Round {
  const roundNumber = tournament.rounds.length + 1;
  const pairsPlayed = playedPairs(tournament);
  const remainingPlayers = [...activePlayers(tournament)];
  const matches: Match[] = [];

  while (remainingPlayers.length > 0) {
    const player = remainingPlayers.shift() as (typeof remainingPlayers)[number];
    const opponentIndex = remainingPlayers.findIndex((opponent) => !pairsPlayed.has(pairKey(player.userId, opponent.userId)));
    if (opponentIndex === -1) {
      matches.push(createBye(roundNumber, matches.length, player));
      continue;
    }
    const opponent = remainingPlayers.splice(opponentIndex, 1)[0] as (typeof remainingPlayers)[number];
    matches.push(createDuel(roundNumber, matches.length, player.userId, opponent.userId));
  }
  return { number: roundNumber, pairedAt: new Date().toISOString(), matches };
}
