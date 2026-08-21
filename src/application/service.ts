import { advanceDoubleEliminationState, canPairNextRound, isRoundComplete, pairNextRound, swissRoundCount } from "../pairing";
import { computeStandings } from "../core/tiebreakers";
import type { Store } from "../storage/store";
import { formatMessage, messages } from "../messages/messages";
import { logFailure } from "../logging/error-log";
import type { Round, Tournament, TournamentStructure } from "../core/types";
import { DROP_EMOJI, SIGNUP_EMOJI } from "../core/types";
import { DiscordGateway, noMentions, type DiscordClient, type Sendable, type SentMessage } from "../discord/gateway";
import { config } from "../platform/config";

// Here commands come in and state changes happen.

export type TournamentStore = Pick<Store, "data" | "save" | "archive">;
type CreateOptions = {
  structure?: TournamentStructure;
  topCut?: number | null;
  signupChannelId?: string;
  pairingChannelId?: string;
  dropsChannelId?: string;
  dropChannel?: Sendable | null;
};

export class TournamentService {
  private readonly discord: DiscordGateway;
  private mutationTail = Promise.resolve();

  constructor(
    private readonly store: TournamentStore,
    client: DiscordClient,
  ) {
    this.discord = new DiscordGateway(client);
  }

  attachClient(client: Exclude<DiscordClient, null>): void {
    this.discord.attachClient(client);
  }

  get tournament(): Tournament | null {
    return this.store.data.tournament;
  }

  async sendableFor(channelId: string): Promise<Sendable | null> {
    return this.discord.sendableFor(channelId);
  }

  // Commands can overlap because Discord and the dashboard are both async.
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>((resolve) => { release = resolve; });
    return previous.then(operation).finally(release);
  }

  create(name: string, channel: Sendable | null, guildId: string, channelId: string, options: CreateOptions = {}): Promise<Tournament> {
    return this.mutate(() => this.createInternal(name, channel, guildId, channelId, options));
  }

  start(): Promise<string> { return this.mutate(() => this.startInternal()); }
  startTopCut(): Promise<string> { return this.mutate(() => this.startTopCutInternal()); }
  submitDecklist(userId: string, link: string): Promise<string> { return this.mutate(() => this.submitDecklistInternal(userId, link)); }
  pair(): Promise<string> { return this.mutate(() => this.pairInternal()); }
  reportWin(userId: string, winnerGames: number, loserGames: number): Promise<string> {
    return this.mutate(() => this.reportWinInternal(userId, winnerGames, loserGames));
  }
  reportDoubleLoss(): Promise<string> { return this.mutate(() => this.reportDoubleLossInternal()); }
  drop(userId: string): Promise<string> { return this.mutate(() => this.dropInternal(userId)); }
  end(): Promise<string> { return this.mutate(() => this.endInternal()); }
  cancel(): Promise<string> { return this.mutate(() => this.cancelInternal()); }

  private async announce(content: string): Promise<boolean> {
    const tournament = this.store.data.tournament;
    return tournament ? this.discord.announce(tournament, content) : false;
  }

  private async createInternal(name: string, channel: Sendable | null, guildId: string, channelId: string, options: CreateOptions = {}): Promise<Tournament> {
    // Build one tournament object; Discord message IDs get attached before saving it.
    if (!channel || !options.dropChannel) throw new Error(messages.errors.channelsUnavailable);
    const cleanName = name.trim();
    if (cleanName.length === 0 || cleanName.length > 100) throw new Error(messages.errors.invalidName);
    const cur = this.store.data.tournament;
    if (cur && cur.phase !== "ended") throw new Error(messages.errors.alreadyRunning);
    if (cur) this.store.archive();
    const number = Math.max(0, ...this.store.data.history.map((tour) => tour.number)) + 1;
    const structures: TournamentStructure[] = ["swiss", "singleElimination", "doubleElimination", "roundRobin", "swissTopCut"];
    const requestedStructure = structures.includes(options.structure ?? "swiss") ? (options.structure ?? "swiss") : "swiss";
    const requestedTopCut = [2, 4, 8, 16].includes(options.topCut ?? 0) ? options.topCut ?? null : null;
    const structure = requestedStructure === "swiss" && requestedTopCut !== null ? "swissTopCut" : requestedStructure;
    const topCut = structure === "swissTopCut" ? requestedTopCut ?? 8 : null;
    const created: Tournament = {
      number,
       name: cleanName,
      structure,
      topCut,
      swissRounds: null,
      stage: "main",
      doubleElimination: structure === "doubleElimination" ? { kind: "winners", round: 1 } : null,
      guildId,
      channelId,
      signupChannelId: options.signupChannelId ?? channelId,
      pairingChannelId: options.pairingChannelId ?? channelId,
      dropsChannelId: options.dropsChannelId ?? channelId,
      signupMessageId: null,
      dropMessageId: null,
      phase: "signup",
      rounds: [],
      players: {},
      createdAt: new Date().toISOString(),
      endedAt: null,
    };
    const sent: SentMessage[] = [];
    try {
      const signupMessage = await channel.send(formatMessage(messages.signupOpen, { name: cleanName, signupEmoji: SIGNUP_EMOJI }), noMentions);
      sent.push(signupMessage);
      created.signupMessageId = signupMessage.id;

      const dropMessage = await options.dropChannel.send(formatMessage(messages.dropsOpen, { name: cleanName, dropEmoji: DROP_EMOJI }), noMentions);
      sent.push(dropMessage);
      created.dropMessageId = dropMessage.id;

      this.store.data.tournament = created;
      this.store.save();
    } catch (error) {
      logFailure("create tournament", error);
      await Promise.all(sent.map(async (message) => {
        if (message.delete) await message.delete().catch((error) => logFailure("delete failed tournament message", error));
      }));
      if (this.store.data.tournament === created) this.store.data.tournament = null;
      throw error;
    }
    return created;
  }

  private async startInternal(): Promise<string> {
    const tour = this.requireTournament();
    if (tour.phase !== "signup") throw new Error(messages.errors.signupClosed);
    if (Object.keys(tour.players).length === 0) throw new Error(messages.errors.noPlayers);
    if (tour.swissRounds === null && (tour.structure === "swiss" || tour.structure === "swissTopCut")) tour.swissRounds = swissRoundCount(tour);
    tour.phase = "collecting";
    this.store.save();
    const missing = Object.values(tour.players).filter((p) => p.decklist === null);
    return formatMessage(messages.signupClosed, { missing: missing.map((p) => p.username).join(", ") || "none" });
  }

  private async startTopCutInternal(): Promise<string> {
    const tour = this.requireTournament();
    if (tour.structure !== "swissTopCut") throw new Error(messages.errors.notTopCut);
    if (tour.stage === "topCut") throw new Error(messages.errors.topCutAlreadyStarted);
    if (tour.phase !== "running") throw new Error(messages.errors.noMatches);
    const lastRound = this.requireLastRound();
    if (!isRoundComplete(lastRound)) throw new Error(messages.errors.pendingMatches);
    if (tour.swissRounds === null) tour.swissRounds = swissRoundCount(tour);
    if (tour.rounds.length < tour.swissRounds) throw new Error(formatMessage(messages.errors.swissNotComplete, { rounds: tour.swissRounds }));
    tour.stage = "topCut";
    this.store.save();
    return messages.topCutStarted;
  }

  private async submitDecklistInternal(userId: string, link: string): Promise<string> {
    const tour = this.requireTournament();
    if (tour.phase === "ended") throw new Error(messages.errors.ended);
    const player = tour.players[userId];
    if (!player) throw new Error(messages.errors.notRegistered);
    if (player.dropped) throw new Error(messages.errors.dropped);
    if (player.decklist) throw new Error(messages.errors.decklistAlreadyStored);
    player.decklist = { link, submittedAt: new Date().toISOString() };
    this.store.save();
    return messages.decklistSaved;
  }

  private async pairInternal(): Promise<string> {
    // Pair only after decklists and the previous round are settled.
    const tour = this.requireTournament();
    if (tour.phase === "ended") throw new Error(messages.errors.ended);
    const active = Object.values(tour.players).filter((p) => !p.dropped);
    if (active.length < 2) throw new Error(messages.errors.tooFewPlayers);
    const missing = active.filter((p) => p.decklist === null);
    if (missing.length > 0) throw new Error(formatMessage(messages.errors.missingDecklists, { players: missing.map((p) => p.username).join(", ") }));
    const lastRound = tour.rounds[tour.rounds.length - 1];
    if (lastRound && !isRoundComplete(lastRound)) throw new Error(messages.errors.pendingMatches);
    if (tour.structure === "doubleElimination" && lastRound) advanceDoubleEliminationState(tour);
    if (tour.structure === "swissTopCut" && tour.stage === "main" && tour.swissRounds !== null && tour.rounds.length >= tour.swissRounds) throw new Error(messages.errors.topCutRequired);
    if (!canPairNextRound(tour)) throw new Error(messages.errors.complete);
    if (tour.phase === "collecting") tour.phase = "running";

    const round = pairNextRound(tour);
    tour.rounds.push(round);

    await this.discord.createMatchThreads(tour, round);
    this.store.save();

    const lines = round.matches.map((m) => {
      if (m.pairing.kind === "bye") {
        const p = tour.players[m.pairing.playerId];
        return formatMessage(messages.bye, { player: p?.username ?? m.pairing.playerId });
      }
      const a = tour.players[m.pairing.playerA];
      const b = tour.players[m.pairing.playerB];
      const thread = m.threadId ? `<#${m.threadId}>` : "";
      return formatMessage(messages.pairing, { a: a?.username ?? "?", b: b?.username ?? "?", thread });
    });
    const bracket = round.matches[0]?.bracket;
    const label = bracket ? `${bracket === "winners" ? "Winners" : bracket === "losers" ? "Losers" : bracket === "grandFinal" ? "Grand Final" : "Grand Final Reset"}${round.matches[0]?.bracketRound ? ` R${round.matches[0].bracketRound}` : ""}` : `Round ${round.number}`;
    const announced = await this.announce(formatMessage(messages.roundAnnouncement, { label, lines: lines.join("\n") }));
    return formatMessage(messages.roundPaired, { label, matches: round.matches.length }) + (announced ? "" : messages.announcementWarning);
  }

  private async reportWinInternal(userId: string, winnerGames: number, loserGames: number): Promise<string> {
    const tour = this.requireTournament();
    if (tour.phase !== "running") throw new Error(messages.errors.noMatches);
    if (winnerGames !== 2 || (loserGames !== 0 && loserGames !== 1)) {
      throw new Error(messages.errors.invalidScore);
    }
    const lastRound = this.requireLastRound();
    const myDuel = lastRound.matches.find(
      (m) => m.pairing.kind === "duel" && (m.pairing.playerA === userId || m.pairing.playerB === userId),
    );
    if (!myDuel) throw new Error(messages.errors.noDuel);
    if (myDuel.report !== null) throw new Error(messages.errors.resultExists);
    myDuel.report = {
      kind: "win",
      winnerId: userId,
      games: { winner: winnerGames, loser: loserGames },
      reportedBy: userId,
      reportedAt: new Date().toISOString(),
    };
    this.store.save();
    const announced = isRoundComplete(lastRound)
      ? await this.announce(formatMessage(messages.roundComplete, { round: lastRound.number }))
      : true;
    return formatMessage(messages.resultRecorded, { winnerGames, loserGames }) + (announced ? "" : messages.announcementWarning);
  }

  private async reportDoubleLossInternal(): Promise<string> {
    const tour = this.requireTournament();
    if (tour.phase !== "running") throw new Error(messages.errors.noMatches);
    const lastRound = this.requireLastRound();
    const pending = lastRound.matches.filter((m) => m.pairing.kind === "duel" && m.report === null);
    if (pending.length === 0) throw new Error(messages.errors.roundComplete);
    for (const m of pending) {
      m.report = { kind: "doubleLoss", reportedBy: "dashboard/admin", reportedAt: new Date().toISOString() };
    }
    this.store.save();
    return formatMessage(messages.doubleLossSummary, { round: lastRound.number, matches: pending.length });
  }

  private async dropInternal(userId: string): Promise<string> {
    const tour = this.requireTournament();
    if (tour.phase === "ended") throw new Error(messages.errors.ended);
    const player = tour.players[userId];
    if (!player) throw new Error(messages.errors.notParticipant);
    if (player.dropped) throw new Error(messages.errors.alreadyDropped);
    const lastRound = tour.rounds[tour.rounds.length - 1];
    if (lastRound && !isRoundComplete(lastRound)) throw new Error(messages.errors.waitForRound);
    const bracketStarted = lastRound && (
      tour.structure === "singleElimination" ||
      tour.structure === "doubleElimination" ||
      (tour.structure === "swissTopCut" && tour.stage === "topCut")
    );
    if (bracketStarted) throw new Error(messages.errors.dropsLocked);
    player.dropped = true;
    this.store.save();
    return formatMessage(messages.dropped, { player: player.username });
  }

  private async endInternal(): Promise<string> {
    const tour = this.requireTournament();
    if (tour.phase === "ended") throw new Error(messages.errors.alreadyEnded);
    const lastRound = tour.rounds[tour.rounds.length - 1];
    if (tour.phase === "running" && lastRound && !isRoundComplete(lastRound)) throw new Error(messages.errors.endPending);
    await this.discord.deleteMatchThreads(tour, "cleanup");
    if (config.signupRoleId) await this.discord.removeRoleFromAll(tour, config.signupRoleId);
    tour.phase = "ended";
    tour.endedAt = new Date().toISOString();
    this.store.save();
    this.store.archive();
    return messages.tournamentEnded;
  }

  private async cancelInternal(): Promise<string> {
    const tour = this.requireTournament();
    if (tour.phase === "ended") throw new Error(messages.errors.cancelEnded);
    await this.discord.deleteMatchThreads(tour, "cancellation");
    await Promise.all([
      this.discord.deleteMessage(tour.signupChannelId, tour.signupMessageId, "delete signup message during cancellation"),
      this.discord.deleteMessage(tour.dropsChannelId, tour.dropMessageId, "delete drop message during cancellation"),
    ]);
    this.store.data.tournament = null;
    this.store.save();
    return messages.cancelConfirmed;
  }

  standingsText(tour: Tournament = this.requireTournament()): string {
    const rows = computeStandings(tour);
    if (rows.length === 0) return messages.noPlayers;
    const lines = rows.map((r) => {
      const name = r.player.dropped ? `~~${r.player.username}~~` : r.player.username;
      return formatMessage(messages.standingsRow, {
        rank: r.rank,
        name,
        points: r.points,
        wins: r.wins,
        losses: r.losses,
        mwp: (r.matchWinPct * 100).toFixed(1),
        omw: (r.omwPct * 100).toFixed(1),
        ddd: r.sumSqLostRounds,
      });
    });
    return formatMessage(messages.standings, { name: tour.name, lines: lines.join("\n") });
  }

  // Return the active tournament or explain why a command cannot run.
  private requireTournament(): Tournament {
    const tour = this.store.data.tournament;
    if (!tour) throw new Error(messages.errors.noTournament);
    return tour;
  }

  // Return the latest round or explain why a match command cannot run.
  private requireLastRound(): Round {
    const tour = this.requireTournament();
    const last = tour.rounds[tour.rounds.length - 1];
    if (!last) throw new Error(messages.errors.noRound);
    return last;
  }
}
