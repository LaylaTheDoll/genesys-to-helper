import type { Tournament } from "./types";

// Archive reports only.

export function monthKey(iso: string, timeZone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error(`invalid timestamp: ${iso}`);
  return `${year}-${month}`;
}

export function filterByMonth(tours: Tournament[], month: string, timeZone = "UTC"): Tournament[] {
  return tours.filter((t) => monthKey(t.endedAt ?? t.createdAt, timeZone) === month);
}

export function availableMonths(tours: Tournament[], timeZone = "UTC"): string[] {
  const set = new Set(tours.map((t) => monthKey(t.endedAt ?? t.createdAt, timeZone)));
  return [...set].sort().reverse();
}

export type ArchetypeStat = {
  archetype: string;
  players: number;
  share: number;
  wins: number;
  losses: number;
  winRate: number | null;
};

export function metaForPeriod(tours: Tournament[]): ArchetypeStat[] {
  const players = new Map<string, number>();
  const winsMap = new Map<string, number>();
  const lossesMap = new Map<string, number>();

  for (const t of tours) {
    for (const p of Object.values(t.players)) {
      if (p.archetype) players.set(p.archetype, (players.get(p.archetype) ?? 0) + 1);
    }
    for (const round of t.rounds) {
      for (const m of round.matches) {
        if (m.pairing.kind !== "duel" || !m.report || m.report.kind !== "win") continue;
        const a = t.players[m.pairing.playerA];
        const b = t.players[m.pairing.playerB];
        if (!a?.archetype || !b?.archetype) continue;
        const winner = m.report.winnerId === m.pairing.playerA ? a.archetype : b.archetype;
        const loser = m.report.winnerId === m.pairing.playerA ? b.archetype : a.archetype;
        winsMap.set(winner, (winsMap.get(winner) ?? 0) + 1);
        lossesMap.set(loser, (lossesMap.get(loser) ?? 0) + 1);
      }
    }
  }

  const totalPlayers = [...players.values()].reduce((x, y) => x + y, 0);
  const archetypes = new Set([...players.keys(), ...winsMap.keys(), ...lossesMap.keys()]);
  return [...archetypes]
    .map((archetype) => {
      const wins = winsMap.get(archetype) ?? 0;
      const losses = lossesMap.get(archetype) ?? 0;
      return {
        archetype,
        players: players.get(archetype) ?? 0,
        share: totalPlayers > 0 ? (players.get(archetype) ?? 0) / totalPlayers : 0,
        wins,
        losses,
        winRate: wins + losses > 0 ? wins / (wins + losses) : null,
      };
    })
    .sort((a, b) => b.players - a.players || b.wins - a.wins || a.archetype.localeCompare(b.archetype));
}

export function periodSummary(tours: Tournament[]): { tournaments: number; matches: number; players: number } {
  let matches = 0;
  const players = new Set<string>();
  for (const t of tours) {
    for (const r of t.rounds) {
      for (const m of r.matches) {
        if (m.pairing.kind === "duel" && m.report !== null) matches++;
      }
    }
    for (const id of Object.keys(t.players)) players.add(id);
  }
  return { tournaments: tours.length, matches, players: players.size };
}
