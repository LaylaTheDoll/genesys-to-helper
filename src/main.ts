import { isConfigured } from "./platform/config";
import { Store } from "./storage/store";
import { TournamentService } from "./application/service";
import { startDashboard } from "./adapters/dashboard";
import { startBot } from "./discord/bot";

// Startup wiring only. If rules appear here, they probably belong in service.

const store = new Store();
const service = new TournamentService(store, null);

if (isConfigured()) {
  startBot(store, service);
} else {
  console.warn("[main] bot credentials or tournament channel IDs missing — bot disabled, dashboard only");
}

startDashboard(store, service);
console.log("[main] ready");
