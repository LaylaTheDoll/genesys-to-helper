import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import { config } from "../platform/config";
import type { Store } from "../storage/store";
import type { TournamentService } from "../application/service";
import { DROP_EMOJI, SIGNUP_EMOJI, type TournamentStructure } from "../core/types";
import { formatMessage, messages } from "../messages/messages";
import { logFailure } from "../logging/error-log";
import { noMentions } from "./gateway";

const URL_RE = /^https?:\/\/[^\s<>]+$/i;

// Discord is only the front door. The service owns tournament rules.

function isAdmin(user: User): boolean {
  return user.id === config.adminUserId;
}

const commands = [
  new SlashCommandBuilder()
    .setName("tourney-create")
    .setDescription("Create a tournament (admin)")
    .addStringOption((o) => o.setName("name").setDescription("Tournament name").setRequired(true))
    .addStringOption((o) => o.setName("structure").setDescription("Tournament structure").setRequired(true).addChoices(
      { name: "Swiss", value: "swiss" },
      { name: "Single Elimination", value: "singleElimination" },
      { name: "Double Elimination", value: "doubleElimination" },
      { name: "Round Robin", value: "roundRobin" },
    ))
    .addIntegerOption((o) => o.setName("top_cut").setDescription("Top cut size: 2, 4, 8, or 16").addChoices({ name: "2", value: 2 }, { name: "4", value: 4 }, { name: "8", value: 8 }, { name: "16", value: 16 })),
  new SlashCommandBuilder().setName("tourney-start").setDescription("Close signup and collect decklists (admin)"),
  new SlashCommandBuilder().setName("decklist").setDescription("Submit your decklist URL").addStringOption((o) => o.setName("url").setDescription("Decklist URL").setRequired(true)),
  new SlashCommandBuilder().setName("tourney-pair").setDescription("Pair the next tournament round (admin)"),
  new SlashCommandBuilder().setName("tourney-top-cut").setDescription("Start Top Cut after Swiss (admin)"),
  new SlashCommandBuilder()
    .setName("tourney-report")
    .setDescription("Report your match result (winner reports)")
    .addIntegerOption((o) => o.setName("winner_games").setDescription("Your won games (2)").setRequired(true))
    .addIntegerOption((o) => o.setName("loser_games").setDescription("Your lost games (0 or 1)").setRequired(true))
    .addBooleanOption((o) => o.setName("double_loss").setDescription("Admin: mark all pending duels of the round as double loss")),
  new SlashCommandBuilder().setName("tourney-drop").setDescription("Drop a player between rounds (admin)").addUserOption((o) => o.setName("user").setDescription("Player to drop").setRequired(true)),
  new SlashCommandBuilder().setName("tourney-end").setDescription("End the tournament (admin)"),
  new SlashCommandBuilder().setName("tourney-cancel").setDescription("Discard the tournament without archiving (admin)"),
];

// Wire reactions, slash commands, and login. Keep business logic out of here.
export function startBot(store: Store, service: TournamentService): void {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
  });
  service.attachClient(client);

  client.once(Events.ClientReady, async (ready) => {
    console.log(`[bot] logged in as ${ready.user.tag}`);
    if (config.guildId) {
      const guild = await ready.guilds.fetch(config.guildId).catch(() => null);
      if (guild) {
        await guild.commands.set(commands.map((c) => c.toJSON()));
        console.log(`[bot] registered ${commands.length} commands in guild ${config.guildId}`);
      }
    }
    await service.reconcileSignups().catch((e) => logFailure("reconcile signups", e));
  });

  client.on(Events.MessageReactionAdd, async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
      const tour = store.data.tournament;
      if (!tour) return;
      if (tour.phase === "signup" && reaction.emoji.name === SIGNUP_EMOJI && reaction.message.id === tour.signupMessageId) {
        if (tour.players[user.id]) return;
        tour.players[user.id] = {
          userId: user.id,
          username: user.username ?? "unknown",
          decklist: null,
          archetype: null,
          dropped: false,
          byeCount: 0,
          signedUpAt: new Date().toISOString(),
        };
        store.save();
        if (config.signupRoleId) {
          const guild = reaction.message.guild ?? (tour.guildId ? await client.guilds.fetch(tour.guildId).catch(() => null) : null);
          const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
          if (member) await member.roles.add(config.signupRoleId).catch((error) => logFailure("add signup role", error));
        }
        return;
      }
      if (["collecting", "running"].includes(tour.phase) && reaction.emoji.name === DROP_EMOJI && reaction.message.id === tour.dropMessageId) {
        if (tour.players[user.id]) await service.drop(user.id);
      }
    } catch (e) {
      logFailure("reaction handler", e);
      console.error("[bot] reaction handler error:", e);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await handleCommand(interaction, service);
    } catch (e) {
      console.error("[bot] command error:", e);
      const text = e instanceof Error ? e.message : "unexpected error";
      const errorMessage = formatMessage(messages.errors.prefix, { message: text });
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: errorMessage, ephemeral: true, ...noMentions }).catch(() => undefined);
      else await interaction.reply({ content: errorMessage, ephemeral: true, ...noMentions }).catch(() => undefined);
    }
  });

  client.login(config.token).catch((e) => {
    logFailure("Discord login", e);
    console.error("[bot] login failed:", e.message ?? e);
    process.exit(1);
  });
}

async function handleCommand(interaction: ChatInputCommandInteraction, service: TournamentService): Promise<void> {
  // Small command router; each case delegates quickly to the service.
  switch (interaction.commandName) {
    case "tourney-create": {
      if (!isAdmin(interaction.user)) throw new Error(messages.errors.adminOnly);
      if (!config.signupChannelId || !config.pairingChannelId || !config.dropsChannelId) throw new Error(messages.errors.configureChannels);
      const [signupChannel, pairingChannel, dropChannel] = await Promise.all([
        service.sendableFor(config.signupChannelId),
        service.sendableFor(config.pairingChannelId),
        service.sendableFor(config.dropsChannelId),
      ]);
      if (!signupChannel || !pairingChannel || !dropChannel) throw new Error(messages.errors.botCannotAccess);
      await service.create(interaction.options.getString("name", true), signupChannel, interaction.guildId ?? "", config.signupChannelId, {
        structure: interaction.options.getString("structure", true) as TournamentStructure,
        topCut: interaction.options.getInteger("top_cut"),
        signupChannelId: config.signupChannelId,
        pairingChannelId: config.pairingChannelId,
        dropsChannelId: config.dropsChannelId,
        dropChannel,
      });
      await interaction.reply({ content: messages.tournamentCreated, ephemeral: true, ...noMentions });
      return;
    }

    case "tourney-start": {
      if (!isAdmin(interaction.user)) throw new Error(messages.errors.adminOnly);
      await interaction.reply({ content: await service.start(), ephemeral: true, ...noMentions });
      return;
    }

    case "decklist": {
      const link = interaction.options.getString("url", true).trim();
      if (link.length > 2048 || !URL_RE.test(link)) throw new Error(messages.errors.invalidDecklistUrl);
      await interaction.reply({ content: await service.submitDecklist(interaction.user.id, link), ephemeral: true, ...noMentions });
      return;
    }

    case "tourney-pair": {
      if (!isAdmin(interaction.user)) throw new Error(messages.errors.adminOnly);
      await interaction.reply({ content: await service.pair(), ephemeral: true, ...noMentions });
      return;
    }

    case "tourney-top-cut": {
      if (!isAdmin(interaction.user)) throw new Error(messages.errors.adminOnly);
      await interaction.reply({ content: await service.startTopCut(), ephemeral: true, ...noMentions });
      return;
    }

    case "tourney-report": {
      const doubleLoss = interaction.options.getBoolean("double_loss") ?? false;
      if (doubleLoss && !isAdmin(interaction.user)) throw new Error(messages.errors.adminOnly);
      if (!doubleLoss && !config.playerReportingEnabled && !isAdmin(interaction.user)) throw new Error(messages.errors.playerReportingDisabled);
      const content = doubleLoss
        ? await service.reportDoubleLoss()
        : await service.reportWin(interaction.user.id, interaction.options.getInteger("winner_games", true) ?? 0, interaction.options.getInteger("loser_games", true) ?? 0);
      await interaction.reply({ content, ephemeral: true, ...noMentions });
      return;
    }

    case "tourney-drop": {
      if (!isAdmin(interaction.user)) throw new Error(messages.errors.adminOnly);
      const target = interaction.options.getUser("user", true);
      await interaction.reply({ content: await service.drop(target.id), ephemeral: true, ...noMentions });
      return;
    }

    case "tourney-end": {
      if (!isAdmin(interaction.user)) throw new Error(messages.errors.adminOnly);
      await interaction.reply({ content: await service.end(), ephemeral: true, ...noMentions });
      return;
    }

    case "tourney-cancel": {
      if (!isAdmin(interaction.user)) throw new Error(messages.errors.adminOnly);
      await interaction.reply({ content: await service.cancel(), ephemeral: true, ...noMentions });
      return;
    }

  }
}
