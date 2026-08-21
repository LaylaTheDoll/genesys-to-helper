import type { DoubleEliminationState, Match, Player, Round, Tournament } from "../core/types";
import { activePlayers, createBye, createDuel } from "./common";

// This file mirrors the winners lane, losers lane, and grand-final reset.

function bracketMatches(tournament: Tournament, bracket: Match["bracket"], bracketRound: number): Match[] {
  return tournament.rounds
    .flatMap((round) => round.matches)
    .filter((match) => match.bracket === bracket && match.bracketRound === bracketRound)
    .sort((a, b) => (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0));
}

function matchWinner(tournament: Tournament, match: Match): Player | null {
  if (match.pairing.kind === "bye") return tournament.players[match.pairing.playerId] ?? null;
  if (match.report?.kind !== "win") return null;
  return tournament.players[match.report.winnerId] ?? null;
}

function matchLoser(tournament: Tournament, match: Match): Player | null {
  if (match.pairing.kind !== "duel" || match.report?.kind !== "win") return null;
  const loserId = match.report.winnerId === match.pairing.playerA ? match.pairing.playerB : match.pairing.playerA;
  return tournament.players[loserId] ?? null;
}

function winnersFrom(tournament: Tournament, bracket: Match["bracket"], bracketRound: number): Player[] {
  return bracketMatches(tournament, bracket, bracketRound)
    .map((match) => matchWinner(tournament, match))
    .filter((player): player is Player => player !== null && !player.dropped);
}

function losersFrom(tournament: Tournament, bracket: Match["bracket"], bracketRound: number): Player[] {
  return bracketMatches(tournament, bracket, bracketRound)
    .map((match) => matchLoser(tournament, match))
    .filter((player): player is Player => player !== null && !player.dropped);
}

function winnerBracketRounds(tournament: Tournament): number {
  const firstRoundMatches = bracketMatches(tournament, "winners", 1).length;
  return Math.max(1, Math.log2(Math.max(2, firstRoundMatches * 2)));
}

function createBracketRound(tournament: Tournament, bracket: Match["bracket"], bracketRound: number, participants: Array<Player | null>): Round {
  const roundNumber = tournament.rounds.length + 1;
  const matches: Match[] = [];
  for (let index = 0; index < participants.length; index += 2) {
    const playerA = participants[index] ?? null;
    const playerB = participants[index + 1] ?? null;
    if (playerA && playerB) matches.push(createDuel(roundNumber, matches.length, playerA.userId, playerB.userId, bracket, bracketRound));
    else if (playerA || playerB) matches.push(createBye(roundNumber, matches.length, (playerA ?? playerB) as Player, bracket, bracketRound));
  }
  return { number: roundNumber, pairedAt: new Date().toISOString(), matches };
}

function initialBracketSlots(tournament: Tournament): Array<Player | null> {
  const players = activePlayers(tournament);
  const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(2, players.length)));
  const slots: Array<Player | null> = Array(bracketSize).fill(null);
  let seedOrder = [1, 2];
  while (seedOrder.length < bracketSize) {
    const nextSize = seedOrder.length * 2;
    seedOrder = seedOrder.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  seedOrder.forEach((seed, index) => { slots[index] = players[seed - 1] ?? null; });
  return slots;
}

function pairAdjacent(players: Player[]): Array<Player | null> {
  return players.length % 2 === 0 ? players : [...players, null];
}

function interleave(playerA: Player[], playerB: Player[]): Array<Player | null> {
  const participants: Array<Player | null> = [];
  const count = Math.max(playerA.length, playerB.length);
  for (let index = 0; index < count; index++) participants.push(playerA[index] ?? null, playerB[index] ?? null);
  return participants;
}

function participantsFor(tournament: Tournament, state: DoubleEliminationState): Array<Player | null> {
  if (state.kind === "winners") {
    return state.round === 1 ? initialBracketSlots(tournament) : pairAdjacent(winnersFrom(tournament, "winners", state.round - 1));
  }
  if (state.kind === "losers") {
    if (state.round === 1) return pairAdjacent(losersFrom(tournament, "winners", 1));
    if (state.round % 2 === 0) return interleave(winnersFrom(tournament, "losers", state.round - 1), losersFrom(tournament, "winners", state.round / 2 + 1));
    return pairAdjacent(winnersFrom(tournament, "losers", state.round - 1));
  }
  if (state.kind === "grandFinal") return [tournament.players[state.winnersChampionId] ?? null, tournament.players[state.losersChampionId] ?? null];
  return [tournament.players[state.playerA] ?? null, tournament.players[state.playerB] ?? null];
}

export function advanceDoubleEliminationState(tournament: Tournament): void {
  const state = tournament.doubleElimination;
  if (!state) return;
  const winnerRounds = winnerBracketRounds(tournament);
  if (state.kind === "grandFinal") {
    const match = bracketMatches(tournament, "grandFinal", 1)[0];
    tournament.doubleElimination = match?.report?.kind === "win" && match.report.winnerId === state.losersChampionId
      ? { kind: "grandFinalReset", playerA: state.winnersChampionId, playerB: state.losersChampionId }
      : null;
    return;
  }
  if (state.kind === "grandFinalReset") {
    tournament.doubleElimination = null;
    return;
  }
  if (state.kind === "winners") {
    tournament.doubleElimination = { kind: "losers", round: state.round === 1 ? 1 : state.round * 2 - 2 };
    return;
  }
  if (state.round === 1) {
    tournament.doubleElimination = winnerRounds === 1
      ? { kind: "grandFinal", winnersChampionId: winnersFrom(tournament, "winners", winnerRounds)[0]?.userId ?? "", losersChampionId: winnersFrom(tournament, "losers", 1)[0]?.userId ?? "" }
      : { kind: "winners", round: 2 };
  } else if (state.round % 2 === 1) {
    tournament.doubleElimination = { kind: "losers", round: state.round + 1 };
  } else if (state.round === winnerRounds * 2 - 2) {
    tournament.doubleElimination = {
      kind: "grandFinal",
      winnersChampionId: winnersFrom(tournament, "winners", winnerRounds)[0]?.userId ?? "",
      losersChampionId: winnersFrom(tournament, "losers", state.round)[0]?.userId ?? "",
    };
  } else {
    tournament.doubleElimination = { kind: "winners", round: state.round / 2 + 2 };
  }
}

export function pairDoubleEliminationRound(tournament: Tournament): Round {
  if (!tournament.doubleElimination) throw new Error("double-elimination bracket is complete");
  const state = tournament.doubleElimination;
  const bracket = state.kind === "winners" ? "winners" : state.kind === "losers" ? "losers" : state.kind === "grandFinal" ? "grandFinal" : "grandFinalReset";
  const bracketRound = state.kind === "winners" || state.kind === "losers" ? state.round : 1;
  return createBracketRound(tournament, bracket, bracketRound, participantsFor(tournament, state));
}

export function canPairDoubleElimination(tournament: Tournament): boolean {
  const state = tournament.doubleElimination;
  return state !== null && (state.kind === "grandFinal" || state.kind === "grandFinalReset" || participantsFor(tournament, state).some(Boolean));
}
