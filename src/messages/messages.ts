// User-facing copy lives here. Change .env, not the tournament logic.

type MessageValues = Record<string, string | number>;

const envMessage = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
};

export const messages = {
  signupOpen: envMessage("TOURNEY_MSG_SIGNUP_OPEN"),
  dropsOpen: envMessage("TOURNEY_MSG_DROPS_OPEN"),
  signupClosed: envMessage("TOURNEY_MSG_SIGNUP_CLOSED"),
  decklistSaved: envMessage("TOURNEY_MSG_DECKLIST_SAVED"),
  tournamentCreated: envMessage("TOURNEY_MSG_TOURNAMENT_CREATED"),
  topCutStarted: envMessage("TOURNEY_MSG_TOP_CUT_STARTED"),
  cancelConfirmed: envMessage("TOURNEY_MSG_TOURNAMENT_CANCELLED"),
  announcementWarning: envMessage("TOURNEY_MSG_ANNOUNCEMENT_WARNING"),
  bye: envMessage("TOURNEY_MSG_BYE"),
  pairing: envMessage("TOURNEY_MSG_PAIRING"),
  roundAnnouncement: envMessage("TOURNEY_MSG_ROUND_ANNOUNCEMENT"),
  roundPaired: envMessage("TOURNEY_MSG_ROUND_PAIRED"),
  roundComplete: envMessage("TOURNEY_MSG_ROUND_COMPLETE"),
  resultRecorded: envMessage("TOURNEY_MSG_RESULT_RECORDED"),
  doubleLossSummary: envMessage("TOURNEY_MSG_DOUBLE_LOSS"),
  dropped: envMessage("TOURNEY_MSG_DROPPED"),
  tournamentEnded: envMessage("TOURNEY_MSG_TOURNAMENT_ENDED"),
  noPlayers: envMessage("TOURNEY_MSG_NO_PLAYERS"),
  standingsRow: envMessage("TOURNEY_MSG_STANDINGS_ROW"),
  standings: envMessage("TOURNEY_MSG_STANDINGS"),

  errors: {
    adminOnly: envMessage("TOURNEY_ERR_ADMIN_ONLY"),
    configureChannels: envMessage("TOURNEY_ERR_CONFIGURE_CHANNELS"),
    botCannotAccess: envMessage("TOURNEY_ERR_BOT_CHANNEL_ACCESS"),
    invalidDecklistUrl: envMessage("TOURNEY_ERR_DECKLIST_URL"),
    prefix: envMessage("TOURNEY_MSG_ERROR_PREFIX"),
    playerReportingDisabled: envMessage("TOURNEY_ERR_PLAYER_REPORTING_DISABLED"),
    channelsUnavailable: envMessage("TOURNEY_ERR_CHANNELS_UNAVAILABLE"),
    invalidName: envMessage("TOURNEY_ERR_INVALID_NAME"),
    alreadyRunning: envMessage("TOURNEY_ERR_ALREADY_RUNNING"),
    signupClosed: envMessage("TOURNEY_ERR_SIGNUP_CLOSED"),
    noPlayers: envMessage("TOURNEY_ERR_NO_PLAYERS"),
    ended: envMessage("TOURNEY_ERR_ENDED"),
    notRegistered: envMessage("TOURNEY_ERR_NOT_REGISTERED"),
    dropped: envMessage("TOURNEY_ERR_DROPPED"),
    decklistAlreadyStored: envMessage("TOURNEY_ERR_DECKLIST_EXISTS"),
    tooFewPlayers: envMessage("TOURNEY_ERR_TOO_FEW_PLAYERS"),
    missingDecklists: envMessage("TOURNEY_ERR_MISSING_DECKLISTS"),
    pendingMatches: envMessage("TOURNEY_ERR_PENDING_MATCHES"),
    complete: envMessage("TOURNEY_ERR_COMPLETE"),
    noMatches: envMessage("TOURNEY_ERR_NO_MATCHES"),
    invalidScore: envMessage("TOURNEY_ERR_INVALID_SCORE"),
    noDuel: envMessage("TOURNEY_ERR_NO_DUEL"),
    resultExists: envMessage("TOURNEY_ERR_RESULT_EXISTS"),
    roundComplete: envMessage("TOURNEY_ERR_ROUND_COMPLETE"),
    notParticipant: envMessage("TOURNEY_ERR_NOT_PARTICIPANT"),
    alreadyDropped: envMessage("TOURNEY_ERR_ALREADY_DROPPED"),
    waitForRound: envMessage("TOURNEY_ERR_WAIT_FOR_ROUND"),
    dropsLocked: envMessage("TOURNEY_ERR_DROPS_LOCKED"),
    endPending: envMessage("TOURNEY_ERR_END_PENDING"),
    alreadyEnded: envMessage("TOURNEY_ERR_ALREADY_ENDED"),
    noTournament: envMessage("TOURNEY_ERR_NO_TOURNAMENT"),
    noRound: envMessage("TOURNEY_ERR_NO_ROUND"),
    notTopCut: envMessage("TOURNEY_ERR_NOT_TOP_CUT"),
    topCutAlreadyStarted: envMessage("TOURNEY_ERR_TOP_CUT_STARTED"),
    swissNotComplete: envMessage("TOURNEY_ERR_SWISS_NOT_COMPLETE"),
    topCutRequired: envMessage("TOURNEY_ERR_TOP_CUT_REQUIRED"),
    cancelEnded: envMessage("TOURNEY_ERR_CANCEL_ENDED"),
  },
} as const;

export function formatMessage(template: string, values: MessageValues = {}): string {
  return template
    .replace(/\\n/g, "\n")
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}