// Shared shapes live here. If it gets persisted, it belongs here first.

export type Decklist = {
  link: string;
  submittedAt: string;
};

export type Player = {
  userId: string;
  username: string;
  decklist: Decklist | null;
  archetype: string | null;
  dropped: boolean;
  byeCount: number;
  signedUpAt: string;
};

export type MatchReport =
  | {
      kind: "win";
      winnerId: string;
      games: { winner: number; loser: number };
      reportedBy: string;
      reportedAt: string;
    }
  | { kind: "doubleLoss"; reportedBy: string; reportedAt: string };

export type Bye = { kind: "bye"; playerId: string };
export type Pairing = Bye | { kind: "duel"; playerA: string; playerB: string };

export type Match = {
  id: string;
  pairing: Pairing;
  report: MatchReport | null;
  threadId: string | null;
  bracket?: "winners" | "losers" | "grandFinal" | "grandFinalReset";
  bracketRound?: number;
  bracketSlot?: number;
};

export type Round = {
  number: number;
  pairedAt: string;
  matches: Match[];
};

export type Phase = "signup" | "collecting" | "running" | "ended";
export type TournamentStructure = "swiss" | "singleElimination" | "doubleElimination" | "roundRobin" | "swissTopCut";
export type TournamentStage = "main" | "topCut";
export type DoubleEliminationState =
  | { kind: "winners"; round: number }
  | { kind: "losers"; round: number }
  | { kind: "grandFinal"; winnersChampionId: string; losersChampionId: string }
  | { kind: "grandFinalReset"; playerA: string; playerB: string };

export type Tournament = {
  number: number;
  name: string;
  structure: TournamentStructure;
  topCut: number | null;
  swissRounds: number | null;
  stage: TournamentStage;
  doubleElimination: DoubleEliminationState | null;
  guildId: string;
  channelId: string;
  signupChannelId: string;
  pairingChannelId: string;
  dropsChannelId: string;
  signupMessageId: string | null;
  dropMessageId: string | null;
  phase: Phase;
  rounds: Round[];
  players: Record<string, Player>;
  createdAt: string;
  endedAt: string | null;
};

export type StoreData = {
  tournament: Tournament | null;
  history: Tournament[];
};

// Kept as a string because the archive only needs YYYY-MM lookups.
export type MonthKey = string;

export const SIGNUP_EMOJI = "✅";
export const DROP_EMOJI = "❌";

export function pairingPlayers(p: Pairing): string[] {
  switch (p.kind) {
    case "bye":
      return [p.playerId];
    case "duel":
      return [p.playerA, p.playerB];
  }
}

export function isBye(p: Pairing): p is Bye {
  return p.kind === "bye";
}

export function duelOpponentOf(m: Match, playerId: string): string | null {
  if (m.pairing.kind !== "duel") return null;
  if (m.pairing.playerA === playerId) return m.pairing.playerB;
  if (m.pairing.playerB === playerId) return m.pairing.playerA;
  return null;
}
