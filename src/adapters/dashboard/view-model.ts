import { computeStandings } from "../../core/tiebreakers";
import type { Match, Tournament } from "../../core/types";

const bracketLabels = {
  winners: "Winners",
  losers: "Losers",
  grandFinal: "Grand Final",
  grandFinalReset: "Grand Final Reset",
} as const;

function roundLabel(round: Tournament["rounds"][number]): string {
  const bracket = round.matches[0]?.bracket;
  if (!bracket) return `Round ${round.number}`;
  const suffix = round.matches[0]?.bracketRound ? ` R${round.matches[0].bracketRound}` : "";
  return `${bracketLabels[bracket]}${suffix}`;
}

function matchView(tournament: Tournament, match: Match) {
  if (match.pairing.kind === "bye") {
    return { kind: "bye" as const, player: tournament.players[match.pairing.playerId]?.username ?? match.pairing.playerId };
  }
  const playerA = tournament.players[match.pairing.playerA];
  const playerB = tournament.players[match.pairing.playerB];
  const result = match.report === null
    ? "pending"
    : match.report.kind === "doubleLoss"
      ? "double loss"
      : `${match.report.games.winner}-${match.report.games.loser} ${match.report.winnerId === match.pairing.playerA ? playerA?.username : playerB?.username}`;
  return {
    kind: "duel" as const,
    a: playerA?.username ?? match.pairing.playerA,
    b: playerB?.username ?? match.pairing.playerB,
    aId: match.pairing.playerA,
    bId: match.pairing.playerB,
    result,
  };
}

export function createDashboardViewModel(tournament: Tournament) {
  const standingRows = computeStandings(tournament);
  const assignedPlayers = Object.values(tournament.players).filter((player) => player.archetype !== null);
  const archetypeCounts = new Map<string, number>();
  for (const player of assignedPlayers) {
    const archetype = player.archetype as string;
    archetypeCounts.set(archetype, (archetypeCounts.get(archetype) ?? 0) + 1);
  }
  const meta = [...archetypeCounts.entries()]
    .map(([archetype, count]) => ({ archetype, count, share: count / Math.max(assignedPlayers.length, 1) }))
    .sort((a, b) => b.count - a.count);
  const rounds = tournament.rounds.map((round) => ({
    number: round.number,
    pairedAt: round.pairedAt,
    label: roundLabel(round),
    pairs: round.matches.map((match) => matchView(tournament, match)),
  }));

  return {
    number: tournament.number,
    name: tournament.name,
    structure: tournament.structure,
    topCut: tournament.topCut,
    swissRounds: tournament.swissRounds,
    stage: tournament.stage,
    phase: tournament.phase,
    playerCount: Object.keys(tournament.players).length,
    decklistCount: Object.values(tournament.players).filter((player) => player.decklist !== null).length,
    standings: standingRows.map((row) => ({
      rank: row.rank,
      userId: row.player.userId,
      username: row.player.username,
      wins: row.wins,
      losses: row.losses,
      points: row.points,
      mwp: row.matchWinPct,
      omw: row.omwPct,
      oppOmw: row.oppOmwPct,
      ddd: row.sumSqLostRounds,
      decklist: row.player.decklist?.link ?? null,
      archetype: row.player.archetype,
      dropped: row.player.dropped,
    })),
    rounds,
    meta,
  };
}
