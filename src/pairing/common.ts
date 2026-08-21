import type { Match, Player, Tournament } from "../core/types";

// Small reusable pairing bits. No tournament-specific rules should sneak in here.

export function activePlayers(tournament: Tournament): Player[] {
  return Object.values(tournament.players).filter((player) => !player.dropped);
}

export function pairKey(playerA: string, playerB: string): string {
  return playerA < playerB ? `${playerA}|${playerB}` : `${playerB}|${playerA}`;
}

export function playedPairs(tournament: Tournament): Set<string> {
  const pairs = new Set<string>();
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.pairing.kind === "duel") pairs.add(pairKey(match.pairing.playerA, match.pairing.playerB));
    }
  }
  return pairs;
}

export function createDuel(roundNumber: number, index: number, playerA: string, playerB: string, bracket?: Match["bracket"], bracketRound?: number): Match {
  return {
    id: `m-${roundNumber}-${index}`,
    pairing: { kind: "duel", playerA, playerB },
    report: null,
    threadId: null,
    bracket,
    bracketRound,
    bracketSlot: index,
  };
}

export function createBye(roundNumber: number, index: number, player: Player, bracket?: Match["bracket"], bracketRound?: number): Match {
  player.byeCount++;
  return {
    id: `m-${roundNumber}-${index}`,
    pairing: { kind: "bye", playerId: player.userId },
    report: null,
    threadId: null,
    bracket,
    bracketRound,
    bracketSlot: index,
  };
}
