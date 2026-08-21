// Environment parsing lives in one boring place on purpose.

export const config = {
  token: process.env.DISCORD_TOKEN ?? "",
  adminUserId: process.env.ADMIN_DISCORD_USER_ID ?? "",
  guildId: process.env.GUILD_ID ?? "",
  signupChannelId: process.env.TOURNEY_SIGNUP_CHANNEL_ID ?? "",
  pairingChannelId: process.env.TOURNEY_FIND_OPPS_CHANNEL_ID ?? "",
  dropsChannelId: process.env.TOURNEY_DROPS_CHANNEL_ID ?? "",
  signupRoleId: process.env.TOURNEY_SIGNUP_ROLE_ID ?? "",
  dashboardPort: Number(process.env.DASHBOARD_PORT ?? 6767),
  dashboardBind: process.env.DASHBOARD_BIND ?? "127.0.0.1",
  timeZone: process.env.TOURNEY_TIME_ZONE ?? "UTC",
  playerReportingEnabled: process.env.TOURNEY_PLAYER_REPORTING_ENABLED === "true",
};

export function isConfigured(): boolean {
  return config.token !== "" && config.adminUserId !== "" && config.guildId !== "" &&
    config.signupChannelId !== "" && config.pairingChannelId !== "" && config.dropsChannelId !== "";
}

export function isLoopbackBind(): boolean {
  return ["127.0.0.1", "localhost", "::1"].includes(config.dashboardBind);
}
