import { Store } from "../src/storage/store";
import type { Match, Player, Round, Tournament } from "../src/core/types";

// Test demo only. Running this replaces data/state.json.
const dayInMilliseconds = 86_400_000;

function createTimestamp(daysAgo: number, hour = 20): string {
  const dateValue = new Date(Date.now() - daysAgo * dayInMilliseconds);
  dateValue.setHours(hour, Math.floor(dateValue.getMinutes() / 10) * 10, 0, 0);
  return dateValue.toISOString();
}

function createPlayer(userId: string, username: string, archetype: string): Player {
  return {
    userId,
    username,
    decklist: { link: `https://www.masterduelmeta.com/decks/${archetype}`, submittedAt: createTimestamp(3) },
    archetype,
    dropped: false,
    byeCount: 0,
    signedUpAt: createTimestamp(5),
  };
}

function createDuel(id: string, playerAId: string, playerBId: string, winnerId: string | null, games?: [number, number], reportedAt?: string): Match {
  return {
    id,
    pairing: { kind: "duel", playerA: playerAId, playerB: playerBId },
    report:
      winnerId === null
        ? null
        : {
            kind: "win",
            winnerId,
            games: games ? { winner: games[0], loser: games[1] } : { winner: 2, loser: 0 },
            reportedBy: winnerId,
            reportedAt: reportedAt ?? createTimestamp(1),
          },
    threadId: `thread-${id}`,
  };
}

function createRound(roundNumber: number, matches: Match[], daysAgo: number): Round {
  return { number: roundNumber, pairedAt: createTimestamp(daysAgo, 21), matches };
}

function createTournament(tournamentNumber: number, name: string, players: Player[], rounds: Round[], endedDaysAgo: number | null): Tournament {
  const isEnded = endedDaysAgo !== null;
  return {
    number: tournamentNumber,
    name,
    structure: "swiss",
    topCut: null,
    swissRounds: 3,
    stage: "main",
    doubleElimination: null,
    guildId: "seed-guild",
    channelId: "seed-channel",
    signupChannelId: "seed-signup-channel",
    pairingChannelId: "seed-pairing-channel",
    dropsChannelId: "seed-drops-channel",
    signupMessageId: isEnded ? null : "seed-signup-message",
    dropMessageId: isEnded ? null : "seed-drop-message",
    phase: isEnded ? "ended" : "running",
    rounds,
    players: Object.fromEntries(players.map((playerValue) => [playerValue.userId, playerValue])),
    createdAt: createTimestamp(isEnded ? (endedDaysAgo as number) + 3 : 6),
    endedAt: isEnded ? createTimestamp(endedDaysAgo as number) : null,
  };
}

const playerA = createPlayer("player-a", "Player A", "tenpai");
const playerB = createPlayer("player-b", "Player B", "lab");
const playerC = createPlayer("player-c", "Player C", "yubel");
const playerD = createPlayer("player-d", "Player D", "voiceless");
const playerE = createPlayer("player-e", "Player E", "snake-eye");
const playerF = createPlayer("player-f", "Player F", "stun");
const playerG = createPlayer("bystialhotwheels", "bystialhotwheels", "yubel");
const playerH = createPlayer("player-h", "Player H", "tenpai");
const playerI = createPlayer("player-i", "Player I", "tenpai");

const liveTournament = createTournament(
  3,
  "Live Swiss Tournament",
  [playerA, playerB, playerC, playerD, playerE, playerF],
  [
    createRound(1, [
      createDuel("live-1", "player-a", "player-b", "player-a"),
      createDuel("live-2", "player-c", "player-d", "player-c", [2, 1]),
      createDuel("live-3", "player-e", "player-f", "player-e"),
    ], 2),
    createRound(2, [
      createDuel("live-4", "player-c", "player-a", "player-c", [2, 1]),
      createDuel("live-5", "player-e", "player-d", "player-e"),
      createDuel("live-6", "player-b", "player-f", "player-f", [2, 1]),
    ], 1),
    createRound(3, [
      createDuel("live-7", "player-c", "player-e", null),
      createDuel("live-8", "player-a", "player-f", null),
      createDuel("live-9", "player-b", "player-d", null),
    ], 0),
  ],
  null,
);

const augustTournament = createTournament(
  2,
  "August Swiss Tournament",
  [playerA, playerB, playerC, playerD, playerE, playerF, playerG, playerH],
  [
    createRound(1, [
      createDuel("august-1", "player-a", "player-b", "player-a"),
      createDuel("august-2", "player-c", "player-d", "player-c", [2, 1]),
      createDuel("august-3", "player-e", "player-f", "player-e"),
      createDuel("august-4", "bystialhotwheels", "player-h", "bystialhotwheels"),
    ], 9),
    createRound(2, [
      createDuel("august-5", "player-c", "player-a", "player-c", [2, 1]),
      createDuel("august-6", "player-e", "bystialhotwheels", "player-e", [2, 1]),
      createDuel("august-7", "player-h", "player-b", "player-h", [2, 1]),
      createDuel("august-8", "player-d", "player-f", "player-d"),
    ], 8),
    createRound(3, [
      createDuel("august-9", "player-c", "player-e", "player-c", [2, 1]),
      createDuel("august-10", "player-a", "player-h", "player-a"),
      createDuel("august-11", "bystialhotwheels", "player-d", "bystialhotwheels", [2, 1]),
      createDuel("august-12", "player-b", "player-f", "player-b"),
    ], 7),
  ],
  14,
);

const julyTournament = createTournament(
  1,
  "July Swiss Tournament",
  [playerA, playerB, playerC, playerE, playerF, playerI],
  [
    createRound(1, [
      createDuel("july-1", "player-a", "player-b", "player-a"),
      createDuel("july-2", "player-c", "player-e", "player-c", [2, 1]),
      createDuel("july-3", "player-f", "player-i", "player-f"),
    ], 33),
    createRound(2, [
      createDuel("july-4", "player-c", "player-a", "player-c", [2, 1]),
      createDuel("july-5", "player-f", "player-e", "player-f", [2, 1]),
      createDuel("july-6", "player-i", "player-b", "player-i"),
    ], 32),
    createRound(3, [
      createDuel("july-7", "player-c", "player-f", "player-c", [2, 1]),
      createDuel("july-8", "player-a", "player-e", "player-a", [2, 1]),
      createDuel("july-9", "player-b", "player-i", "player-b", [2, 1]),
    ], 31),
  ],
  26,
);

const store = new Store();
store.data.tournament = liveTournament;
store.data.history = [augustTournament, julyTournament];
store.save();
console.log("Seeded test demo state: live tournament plus July/August history.");
