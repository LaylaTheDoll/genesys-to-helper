import { pointsFor } from "../core/tiebreakers";
import type { Match, Player, Round, Tournament } from "../core/types";
import { activePlayers, createBye, createDuel, pairKey, playedPairs } from "./common";

// Swiss is the flexible one: group by points, then avoid rematches when possible.

function createRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex] as T, items[index] as T];
  }
}

export function pairSwissRound(tournament: Tournament): Round {
  const roundNumber = tournament.rounds.length + 1;
  const pairsPlayed = playedPairs(tournament);
  const candidates = activePlayers(tournament);
  const random = createRandom(roundNumber * 7919 + candidates.length * 104729);
  const pointGroups = new Map<number, Player[]>();

  for (const player of candidates) {
    const points = pointsFor(tournament, player.userId);
    const group = pointGroups.get(points) ?? [];
    group.push(player);
    pointGroups.set(points, group);
  }

  const groups = [...pointGroups.keys()].sort((a, b) => b - a).map((points) => pointGroups.get(points));
  const matches: Match[] = [];
  const usedPlayers = new Set<string>();
  let floatingPlayers: Player[] = [];

  const tryPair = (player: Player, pool: Player[]): boolean => {
    const opponentIndex = pool.findIndex((opponent) => !pairsPlayed.has(pairKey(player.userId, opponent.userId)));
    if (opponentIndex === -1) return false;
    const opponent = pool.splice(opponentIndex, 1)[0] as Player;
    usedPlayers.add(player.userId);
    usedPlayers.add(opponent.userId);
    matches.push(createDuel(roundNumber, matches.length, player.userId, opponent.userId));
    return true;
  };

  for (const group of groups) {
    if (!group) continue;
    const pool = [...floatingPlayers, ...group].filter((player) => !usedPlayers.has(player.userId));
    floatingPlayers = [];
    shuffle(pool, random);
    while (pool.length >= 2) {
      const player = pool.shift() as Player;
      if (!tryPair(player, pool)) floatingPlayers.push(player);
    }
    if (pool.length === 1) floatingPlayers.push(pool[0] as Player);
  }

  while (floatingPlayers.length >= 2) {
    shuffle(floatingPlayers, random);
    const player = floatingPlayers.shift() as Player;
    if (tryPair(player, floatingPlayers)) continue;
    // Rematches are better than accidentally pairing someone with themselves.
    const opponent = floatingPlayers.shift() as Player;
    usedPlayers.add(player.userId);
    usedPlayers.add(opponent.userId);
    matches.push(createDuel(roundNumber, matches.length, player.userId, opponent.userId));
  }

  if (floatingPlayers.length === 1) matches.push(createBye(roundNumber, matches.length, floatingPlayers[0] as Player));
  return { number: roundNumber, pairedAt: new Date().toISOString(), matches };
}
