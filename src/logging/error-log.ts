import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const ERROR_DIR = join(import.meta.dir, "..", "..", "error logs");

// One small file per failure makes Windows troubleshooting less painful.
export function logFailure(context: string, error: unknown): void {
  try {
    mkdirSync(ERROR_DIR, { recursive: true });
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    const file = join(ERROR_DIR, `error-${Date.now()}-${randomUUID()}.txt`);
    writeFileSync(file, `[${new Date().toISOString()}] ${context}\n${detail}\n`);
  } catch {
    // Logging must never hide the original failure.
  }
}
