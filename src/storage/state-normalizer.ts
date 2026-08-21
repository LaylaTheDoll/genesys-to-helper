import type { StoreData, Tournament } from "../core/types";

// Keep old state files usable while the app's schema keeps growing.

function isTournamentNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeHistory(history: Tournament[]): Tournament[] {
  const usedNumbers = new Set<number>();
  let nextNumber = 1;
  return history.map((tournament) => {
    const number = isTournamentNumber(tournament.number) && !usedNumbers.has(tournament.number) ? tournament.number : nextNumber;
    usedNumbers.add(number);
    nextNumber = Math.max(nextNumber, number + 1);
    return {
      ...tournament,
      number,
      structure: tournament.structure ?? "swiss",
      topCut: tournament.topCut ?? null,
      swissRounds: tournament.swissRounds ?? null,
      stage: tournament.stage ?? "main",
      doubleElimination: tournament.doubleElimination ?? (tournament.structure === "doubleElimination" ? { kind: "winners", round: 1 } : null),
      signupChannelId: tournament.signupChannelId ?? tournament.channelId,
      pairingChannelId: tournament.pairingChannelId ?? tournament.channelId,
      dropsChannelId: tournament.dropsChannelId ?? tournament.channelId,
      dropMessageId: tournament.dropMessageId ?? null,
    };
  });
}

export function normalizeStoreData(raw: Partial<StoreData>): StoreData {
  const history = normalizeHistory(raw.history ?? []);
  const usedNumbers = new Set(history.map((tournament) => tournament.number));
  const nextNumber = Math.max(0, ...usedNumbers) + 1;
  const currentTournament = raw.tournament
    ? {
        ...raw.tournament,
        number: isTournamentNumber(raw.tournament.number) && !usedNumbers.has(raw.tournament.number) ? raw.tournament.number : nextNumber,
        structure: raw.tournament.structure ?? "swiss",
        topCut: raw.tournament.topCut ?? null,
        swissRounds: raw.tournament.swissRounds ?? null,
        stage: raw.tournament.stage ?? "main",
        doubleElimination: raw.tournament.doubleElimination ?? (raw.tournament.structure === "doubleElimination" ? { kind: "winners", round: 1 } : null),
        signupChannelId: raw.tournament.signupChannelId ?? raw.tournament.channelId,
        pairingChannelId: raw.tournament.pairingChannelId ?? raw.tournament.channelId,
        dropsChannelId: raw.tournament.dropsChannelId ?? raw.tournament.channelId,
        dropMessageId: raw.tournament.dropMessageId ?? null,
      }
    : null;
  return { tournament: currentTournament, history };
}
