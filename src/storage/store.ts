import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StoreData } from "../core/types";
import { logFailure } from "../logging/error-log";
import { normalizeStoreData } from "./state-normalizer";

const DATA_DIR = join(import.meta.dir, "..", "..", "data");
const STATE_FILE = join(DATA_DIR, "state.json");
const BACKUP_FILE = STATE_FILE + ".bak";

// Tiny JSON store. Atomic writes keep Ctrl+C from wrecking state.

export class Store {
  private readonly state: StoreData;

  constructor() {
    this.state = this.load();
  }

  get data(): StoreData {
    return this.state;
  }

  archive(): void {
    // Keep finished tournaments around for the dashboard history view.
    const tour = this.state.tournament;
    if (!tour) return;
    const archived = structuredClone(tour);
    archived.signupMessageId = null;
    archived.dropMessageId = null;
    archived.doubleElimination = null;
    for (const match of archived.rounds.flatMap((round) => round.matches)) match.threadId = null;
    this.state.history.push(archived);
    this.state.tournament = null;
    this.save();
  }

  save(): void {
    // Write beside the real file, then swap it in atomically.
    mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(STATE_FILE)) copyFileSync(STATE_FILE, BACKUP_FILE);
    const tmp = STATE_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.state));
    renameSync(tmp, STATE_FILE);
  }

  private load(): StoreData {
    // Old state files get defaults here instead of making the rest of the app defensive.
    if (!existsSync(STATE_FILE)) return { tournament: null, history: [] };
    try {
      return normalizeStoreData(JSON.parse(readFileSync(STATE_FILE, "utf8")) as Partial<StoreData>);
    } catch (error) {
      if (!existsSync(BACKUP_FILE)) throw this.loadError(error);
      try {
        const recovered = normalizeStoreData(JSON.parse(readFileSync(BACKUP_FILE, "utf8")) as Partial<StoreData>);
        copyFileSync(BACKUP_FILE, STATE_FILE);
        logFailure("recovered data/state.json from data/state.json.bak", error);
        return recovered;
      } catch (backupError) {
        throw new Error(`${this.loadError(error).message}; backup recovery failed: ${this.loadError(backupError).message}`);
      }
    }
  }

  private loadError(error: unknown): Error {
    const reason = error instanceof Error ? error.message : "invalid state data";
    return new Error(`Unable to load data/state.json: ${reason}`);
  }
}
