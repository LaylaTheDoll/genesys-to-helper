import { ChannelType, Client, TextChannel, type MessageCreateOptions } from "discord.js";
import type { Match, Round, Tournament } from "../core/types";
import { logFailure } from "../logging/error-log";

export type SentMessage = { id: string; delete?: () => Promise<unknown> };
export type Sendable = { send(content: string, options?: MessageCreateOptions): Promise<SentMessage> };
export type DiscordClient = Client | null;

export const noMentions = { allowedMentions: { parse: [] as const } };

// All Discord API calls live here.
export class DiscordGateway {
  constructor(private client: DiscordClient) {}

  attachClient(client: Client): void {
    this.client = client;
  }

  async sendableFor(channelId: string): Promise<Sendable | null> {
    if (!this.client) return null;
    const channel = await this.client.channels.fetch(channelId).catch((error) => {
      logFailure(`fetch channel ${channelId}`, error);
      return null;
    });
    return channel instanceof TextChannel ? channel : null;
  }

  async announce(tournament: Tournament, content: string): Promise<boolean> {
    const channel = await this.sendableFor(tournament.pairingChannelId);
    if (!channel) {
      logFailure("announcement channel unavailable", new Error("pairing channel could not be fetched"));
      return false;
    }
    return channel.send(content, noMentions).then(() => true).catch((error) => {
      logFailure("send announcement", error);
      return false;
    });
  }

  async createMatchThreads(tournament: Tournament, round: Round): Promise<void> {
    const channel = await this.sendableFor(tournament.pairingChannelId);
    if (!channel) return;
    const threadChannel = channel as TextChannel;
    await Promise.all(round.matches.filter((match) => match.pairing.kind === "duel").map(async (match) => {
      if (match.pairing.kind !== "duel") return;
      const playerA = tournament.players[match.pairing.playerA];
      const playerB = tournament.players[match.pairing.playerB];
      const thread = await threadChannel.threads.create({
        name: `R${round.number} ${playerA?.username ?? "?"} vs ${playerB?.username ?? "?"}`,
        type: ChannelType.PrivateThread,
        invitable: false,
      }).catch((error) => {
        logFailure("create match thread", error);
        return null;
      });
      if (!thread) return;
      await Promise.all([
        thread.members.add(match.pairing.playerA).catch((error) => logFailure("add player A to match thread", error)),
        thread.members.add(match.pairing.playerB).catch((error) => logFailure("add player B to match thread", error)),
      ]);
      match.threadId = thread.id;
    }));
  }

  async deleteMatchThreads(tournament: Tournament, context: string): Promise<void> {
    await Promise.all(tournament.rounds.flatMap((round) => round.matches).filter((match) => match.threadId).map(async (match) => {
      if (!this.client || !match.threadId) return;
      const thread = await this.client.channels.fetch(match.threadId).catch((error) => {
        logFailure(`fetch thread for ${context}`, error);
        return null;
      });
      await thread?.delete().catch((error) => logFailure(`${context} thread deletion`, error));
    }));
  }

  async deleteMessage(channelId: string, messageId: string | null, context: string): Promise<void> {
    if (!this.client || !messageId) return;
    const channel = await this.client.channels.fetch(channelId).catch((error) => {
      logFailure(context, error);
      return null;
    });
    if (!(channel instanceof TextChannel)) return;
    const message = await channel.messages.fetch(messageId).catch((error) => {
      logFailure(context, error);
      return null;
    });
    if (message) await message.delete().catch((error) => logFailure(context, error));
  }

  async removeRoleFromAll(tournament: Tournament, roleId: string): Promise<void> {
    if (!this.client || !roleId) return;
    const guild = tournament.guildId ? await this.client.guilds.fetch(tournament.guildId).catch((error) => {
      logFailure("fetch guild for role removal", error);
      return null;
    }) : null;
    if (!guild) return;
    await Promise.all(Object.keys(tournament.players).map(async (userId) => {
      const member = await guild.members.fetch(userId).catch((error) =>
        logFailure(`remove role from ${userId}`, error));
    }));
  }

  async removeRole(guildId: string, userId: string, roleId: string): Promise<void> {
    if (!this.client || !roleId) return;
    const guild = await this.client.guilds.fetch(guildId).catch((error) => {
      logFailure(`fetch guild for role removal`, error);
      return null;
    });
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) await member.roles.remove(roleId).catch((error) => logFailure(`remove role from ${userId}`, error));
  }
}
