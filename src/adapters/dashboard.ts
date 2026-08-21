import { computeStandings } from "../core/tiebreakers";
import { availableMonths, filterByMonth, metaForPeriod, monthKey, periodSummary } from "../core/history";
import { config, isLoopbackBind } from "../platform/config";
import type { Store } from "../storage/store";
import type { TournamentService } from "../application/service";
import { createDashboardViewModel } from "./dashboard/view-model";

// The dashboard reads view models and sends commands. It should not own rules.

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>YGO Tournament Dashboard</title>
<style>
  body { font-family: Verdana, Geneva, Tahoma, sans-serif; margin: 0; background: #182333; color: #d9e2ed; font-size: 12px; }
  #app { max-width: 1420px; margin: 0 auto; padding: 10px; }
  h1, h2, h3 { margin: 0 0 4px; font-weight: bold; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #455b73; padding: 3px 6px; text-align: left; background: #202f42; white-space: nowrap; }
  th { background: #2d496b; color: #e4edf8; }
  tr:nth-child(even) td { background: #26394f; }
  .pill { display: inline-block; border: 1px solid #7189a4; background: #30455e; border-bottom-width: 2px; padding: 1px 8px; font-size: 11px; margin: 0 4px 4px 0; vertical-align: middle; }
  .badge { display: inline-block; border: 1px solid #9bb0c8; padding: 1px 8px; font-size: 11px; color: #fff; text-shadow: 0 1px 1px rgba(0,0,0,.5); margin-right: 6px; vertical-align: middle; }
  .b-signup { background: #8e7415; } .b-collecting { background: #286399; }
  .b-running { background: #28734a; } .b-ended { background: #873f51; }
  .ok { color: #91d6ad; } .warn { color: #f0cb73; } .bad { color: #ff9ea6; }
  a { color: #91caff; } a:visited { color: #c0a8e8; }
  button { font-family: inherit; font-size: 12px; color: #eaf2fc; background: linear-gradient(#536f91, #344c69); border: 1px solid #7891ad; padding: 4px 11px; margin: 2px; cursor: pointer; }
  button:hover { background: linear-gradient(#6382a7, #3c5879); }
  button:active { background: linear-gradient(#344c69, #536f91); border-top-color: #b6c9dc; }
  button:disabled { color: #8393a6; background: #29394d; cursor: default; }
  select, input { font-family: inherit; font-size: 12px; color: #eaf2fc; background: #24364b; border: 1px solid #7891ad; padding: 3px 4px; margin: 2px; }
  select:focus, input:focus { border-color: #72b7f2; outline: none; }
  .card { border: 1px solid #4e6681; background: #1d2b3d; margin: 0 0 8px; overflow-x: auto; }
  .danger-card { border: 1px solid #8b4655; background: #301f29; margin: 18px 0 8px; padding: 10px; color: #f0c7cf; }
  .danger-card button { background: #713243; border-color: #b15d70; margin-top: 8px; }
  .card h3 { background: linear-gradient(#477aae, #285181); color: #f5f8fc; padding: 4px 9px; border-bottom: 1px solid #1b3557; text-shadow: 0 1px 1px rgba(0,0,0,.55); font-size: 12px; letter-spacing: .2px; }
  .card h1 { font-size: 16px; color: #dceafa; padding: 8px 9px 0; }
  .title-input { width: min(70vw, 620px); box-sizing: border-box; font: inherit; font-size: 16px; font-weight: bold; color: #dceafa; background: transparent; border: 1px solid transparent; padding: 0 2px; margin: 0; }
  .title-input:hover, .title-input:focus { background: #24364b; border-color: #7891ad; outline: none; }
  .tournament-number { color: #91caff; font-size: 13px; white-space: nowrap; }
  .archive-open { color: #91caff; background: transparent; border-color: transparent; padding: 0; margin: 0; }
  .archive-open:hover { color: #dceafa; background: #30455e; }
  .card > div, .card > p { padding: 6px 9px; }
  .round { border: 1px solid #4e6681; background: #23364b; margin: 4px 0; padding: 3px 7px; }
  .muted { color: #aebed0; font-size: 11px; }
  .round-actions, .match-actions { display: inline-flex; flex-wrap: wrap; gap: 2px; margin-left: 6px; }
  .round-actions button, .match-actions button { font-size: 11px; padding: 2px 6px; }
  .tag { display: inline-block; background: #365676; border: 1px solid #7592b2; color: #e2edf9; padding: 0 6px; margin: 0 5px 3px 0; font-size: 11px; }
  .result-line { margin: 4px 9px 8px; min-height: 15px; font-weight: bold; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-end; padding: 6px 9px; }
  .field { display: inline-flex; flex-direction: column; margin-right: 6px; }
  .field label { font-size: 11px; color: #aebed0; margin-bottom: 1px; }
  .archetype-input { width: 110px; }
  .hist-scroll { max-height: 330px; overflow: auto; }
  .grid2 { display: grid; grid-template-columns: 3fr 2fr; gap: 8px; align-items: start; }
  @media (max-width: 1100px) { .grid2 { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div id="app">loading…</div>
<script>
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const localDateTime = (iso) => {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};
const pct = (n) => (n * 100).toFixed(1) + "%";

let state = null;
let archiveTournament = null;
let resultLine = "";

async function cmd(action, body = {}) {
  resultLine = "…";
  render();
  try {
    const res = await fetch("/api/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
    const j = await res.json();
    if (j.ok && action === "rename" && archiveTournament && body.number === archiveTournament.number) {
      archiveTournament.name = body.name;
    }
    resultLine = (j.ok ? "✓ " : "✗ ") + (j.message ?? j.error ?? "");
  } catch (e) {
    resultLine = "✗ " + e;
  }
  await Promise.all([refresh(), loadHistory()]);
  render();
}

async function refresh() {
  const res = await fetch("/api/state");
  const next = (await res.json()).tournament;
  const changed = JSON.stringify(next) !== JSON.stringify(state);
  state = next;
  return changed;
}

function phaseBadge(p) {
  return '<span class="badge b-' + p + '">' + p + "</span>";
}

function structureLabel(structure) {
  return ({ swiss: "Swiss", swissTopCut: "Swiss + Top Cut", singleElimination: "Single Elimination", doubleElimination: "Double Elimination", roundRobin: "Round Robin" })[structure] ?? structure;
}

function createTournament() {
  const name = prompt("Tournament name");
  if (!name) return;
  const structure = document.getElementById("create-structure").value;
  const topCut = structure === "swiss" && document.getElementById("create-top-cut-enabled").checked
    ? Number(document.getElementById("create-top-cut").value)
    : null;
  cmd("create", { name, structure, topCut });
}

function toggleTopCut() {
  const structure = document.getElementById("create-structure");
  const enabled = document.getElementById("create-top-cut-enabled");
  const select = document.getElementById("create-top-cut");
  const swiss = structure.value === "swiss";
  enabled.disabled = !swiss;
  if (!swiss) enabled.checked = false;
  select.disabled = false;
  select.style.display = "inline-block";
}

function controlPanel() {
  if (archiveTournament) return '<div class="card"><h3>Archived tournament</h3><div class="toolbar"><button onclick="closeArchive()">Back to live tournament</button></div></div>';
  const t = state;
  const phase = t ? t.phase : null;
  const btn = (label, act, enabled) => '<button onclick="cmd(\\'' + act + '\\')"' + (enabled ? "" : " disabled") + ">" + label + "</button>";
  const players = t ? t.standings.map((s) => '<option value="' + s.userId + '">' + esc(s.username) + '</option>').join("") : "";
  const drop = phase === "running" || phase === "collecting"
    ? '<div class="field"><label>Drop player</label><select id="rdrop">' + players + "</select></div>" +
      '<button onclick="cmd(\\'drop\\', {user: document.getElementById(\\'rdrop\\').value})">Drop</button>'
    : "";
  const lastRound = t?.rounds[t.rounds.length - 1];
  const swissDone = Boolean(lastRound && lastRound.pairs.every((p) => p.kind === "bye" || p.result !== "pending"));
  const topCutReady = phase === "running" && t?.structure === "swissTopCut" && t.stage === "main" && t.swissRounds !== null && t.rounds.length >= t.swissRounds && swissDone;
  const pairEnabled = (phase === "collecting" || phase === "running") && !topCutReady;
  return '<div class="card"><h3>Control</h3><div class="toolbar">' +
    '<div class="field"><label>Format</label><span class="pill">Genesys</span></div>' +
    '<div class="field"><label>Structure</label><select id="create-structure" onchange="toggleTopCut()"><option value="swiss">Swiss</option><option value="singleElimination">Single Elimination</option><option value="doubleElimination">Double Elimination</option><option value="roundRobin">Round Robin</option></select></div>' +
    '<div class="field"><label>Top cut</label><label><input type="checkbox" id="create-top-cut-enabled" onchange="toggleTopCut()" /> Enable</label><select id="create-top-cut"><option value="2">2</option><option value="4">4</option><option value="8" selected>8</option><option value="16">16</option></select></div>' +
    '<button onclick="createTournament()"' + (phase === null || phase === "ended" ? "" : " disabled") + ">Create</button>" +
    btn("Start", "start", phase === "signup") +
    btn("Pair", "pair", pairEnabled) +
    btn("Start Top Cut", "topCut", topCutReady) +
    btn("End", "end", phase !== null && phase !== "ended") +
    drop +
    '</div><div class="result-line">' + esc(resultLine) + "</div></div>";
}

function cancelSection() {
  if (archiveTournament || !state || state.phase === "ended") return "";
  return '<div class="danger-card"><strong>Danger zone</strong><br><span>Discard this tournament without archiving it.</span><br><button onclick="if (confirm(\\'Cancel and permanently discard this tournament?\\')) cmd(\\'cancel\\')">Cancel tournament</button></div>';
}

function metaSection() {
  const t = archiveTournament ?? state;
  if (!t) return '<div class="card"><h3>No tournament</h3><p>Create one with the control panel (channel configuration required).</p></div>';
  const rows = t.meta.map((m) => '<tr><td>' + esc(m.archetype) + '</td><td>' + m.count + '</td><td>' + pct(m.share) + '</td></tr>').join("");
  return '<div class="card"><h3>Meta — ' + esc(t.name) + '</h3><table><tr><th>Archetype</th><th>Players</th><th>Share</th></tr>' + rows + '</table></div>';
}

function standingsSection() {
  const t = archiveTournament ?? state;
  if (!t) return "";
  const rows = t.standings.map((r) => {
    const link = r.decklist ? '<a href="' + esc(r.decklist) + '" target="_blank" rel="noopener">decklist</a>' : '<span class="warn">missing</span>';
    const archetype = '<input type="text" class="archetype-input" data-user="' + esc(r.userId) + '" value="' + esc(r.archetype ?? "") + '" placeholder="Archetype" />';
    return '<tr><td>' + r.rank + '</td><td>' + (r.dropped ? "✂ " : "") + esc(r.username) +
      '</td><td>' + r.wins + "-" + r.losses + '</td><td>' + r.points + '</td><td>' + pct(r.mwp) + '</td><td>' + pct(r.omw) + '</td><td>' + pct(r.oppOmw) +
      '</td><td>' + r.ddd + '</td><td>' + link + '</td><td>' + archetype + '</td></tr>';
  }).join("");
  return '<div class="card"><h3>Standings — Konami v2.5 (Pts → OMW% → Opp-OMW% → Σ(lost round)²)</h3>' +
    '<table><tr><th>#</th><th>User</th><th>Record</th><th>Pts</th><th>MWP</th><th>OMW</th><th>OppOMW</th><th>D³</th><th>Decklist</th><th>Archetype</th></tr>' + rows + "</table></div>";
}

function roundsSection() {
  const t = archiveTournament ?? state;
  if (!t) return "";
  const rounds = t.rounds.map((r) => {
    const currentRound = !archiveTournament && t.phase === "running" && r.number === t.rounds[t.rounds.length - 1]?.number;
    const reportButton = (winner, games, label) =>
      '<button onclick="cmd(\\'report\\', {winner: ' + esc(JSON.stringify(winner)) + ', games: ' + esc(JSON.stringify(games)) + '})">' + label + "</button>";
    const pairs = r.pairs.map((p) => {
      if (p.kind === "bye") return '<div><span class="tag">BYE</span> ' + esc(p.player) + '</div>';
      const actions = currentRound && p.result === "pending"
        ? '<span class="match-actions">' +
          reportButton(p.aId, "2-0", esc(p.a) + " 2-0") + reportButton(p.aId, "2-1", esc(p.a) + " 2-1") +
          reportButton(p.bId, "2-0", esc(p.b) + " 2-0") + reportButton(p.bId, "2-1", esc(p.b) + " 2-1") +
          "</span>"
        : "";
      return '<div><span class="tag">R' + r.number + '</span> ' + esc(p.a) + " vs " + esc(p.b) + " — <span class=" + (p.result === "pending" ? '"warn"' : '"ok"') + ">" + esc(p.result) + "</span>" + actions + "</div>";
    }).join("");
    const hasPending = r.pairs.some((p) => p.kind === "duel" && p.result === "pending");
    const roundAction = currentRound && hasPending ? '<span class="round-actions"><button onclick="cmd(\\'doubleLoss\\')">Double loss</button></span>' : "";
    return '<div class="round"><strong>' + esc(r.label) + '</strong> <span class="muted">' + esc(localDateTime(r.pairedAt)) + "</span>" + roundAction + pairs + "</div>";
  }).join("");
  return '<div class="card"><h3>Rounds</h3>' + (rounds || "<p>none yet</p>") + "</div>";
}

function main() {
  const t = archiveTournament ?? state;
  if (!t) return '<div class="card"><h3>No tournament running</h3></div>';
  return '<div class="card"><h1><span class="tournament-number">#' + t.number + '</span> <input id="tournament-name" class="title-input" value="' + esc(t.name) + '" aria-label="Tournament name" /></h1>' +
    '<div>' + phaseBadge(t.phase) + ' <span class="pill">Genesys</span> <span class="pill">' + structureLabel(t.structure) + (t.topCut ? " " + t.topCut : "") + '</span> <span class="pill">' + t.playerCount + ' players</span> <span class="pill">' + t.decklistCount + "/" + t.playerCount + " decklists</span></div></div>";
}

let lastHistory = null;
async function loadHistory() {
  const month = document.getElementById("month")?.value || "";
  const res = await fetch("/api/history" + (month ? "?month=" + encodeURIComponent(month) : ""));
  lastHistory = await res.json();
  const m = document.getElementById("month");
  if (m && lastHistory.month && lastHistory.months.length) m.value = lastHistory.month;
  renderHistory();
}

function renderHistory() {
  const body = document.getElementById("hist-body");
  if (!body) return;
  const h = lastHistory;
  if (!h || !h.tournaments.length) {
    body.innerHTML = '<p class="warn">No archived tournaments in this period.</p>';
    return;
  }
  const s = h.summary;
  const tours = h.tournaments.map((t) =>
    '<tr><td>' + t.number + '</td><td><button class="archive-open" onclick="openArchive(' + t.number + ')">' + esc(t.name) + '</button></td><td>' + esc(localDateTime(t.endedAt ?? t.createdAt)) + '</td><td>' + t.players +
    '</td><td>' + t.rounds + '</td><td>' + (t.winner ? esc(t.winner.username) + " (" + t.winner.points + " pts)" : "-") + "</td></tr>",
  ).join("");
  const meta = h.meta.map((m) =>
    '<tr><td>' + esc(m.archetype) + '</td><td>' + m.players + '</td><td>' + pct(m.share) + '</td><td>' + m.wins + "-" + m.losses + '</td><td>' + (m.winRate === null ? "-" : pct(m.winRate)) + "</td></tr>",
  ).join("");
  body.innerHTML =
    '<div class="pill">' + s.tournaments + ' tournaments</div> <div class="pill">' + s.matches + ' matches</div> <div class="pill">' + s.players + " players</div>" +
    "<h3>Tournaments</h3><table><tr><th>#</th><th>Name</th><th>Date</th><th>Players</th><th>Rounds</th><th>Winner</th></tr>" + tours + "</table>" +
    "<h3>Archetype report</h3><table><tr><th>Archetype</th><th>Players</th><th>Share</th><th>W-L</th><th>Win rate</th></tr>" + meta + "</table>";
}

async function openArchive(number) {
  const res = await fetch("/api/history/tournament?number=" + encodeURIComponent(number));
  const body = await res.json();
  if (!res.ok) {
    resultLine = "✗ " + (body.error ?? "unable to open archive");
    return;
  }
  archiveTournament = body.tournament;
  render();
}

function closeArchive() {
  archiveTournament = null;
  render();
}

function stepMonth(d) {
  const m = document.getElementById("month");
  const y = Number(m.value.slice(0, 4));
  const mo = Number(m.value.slice(5, 7));
  const dt = new Date(y, mo - 1 + d, 1);
  m.value = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0");
  loadHistory();
}

function render() {
  const hasMonth = Boolean(document.getElementById("month"));
  const monthValue = document.getElementById("month")?.value ?? "";
  const editingTitle = document.activeElement?.id === "tournament-name";
  const titleDraft = editingTitle ? document.activeElement.value : null;
  app.innerHTML = [
    '<div class="grid2">',
    '<div>' + main() + controlPanel() + standingsSection() + roundsSection() + '</div>',
    '<div>' + metaSection() +
      '<div class="card"><h3>Monthly archive</h3>' +
      '<div class="toolbar"><button id="mprev" onclick="stepMonth(-1)">‹</button><input type="month" id="month" />' +
      '<button id="mnext" onclick="stepMonth(1)">›</button></div>' +
      '<div class="hist-scroll"><div id="hist-body">loading…</div></div></div>' +
    '</div>',
    '</div>',
    cancelSection(),
  ].join("");
  if (editingTitle && titleDraft !== null) {
    const titleInput = document.getElementById("tournament-name");
    if (titleInput) {
      titleInput.value = titleDraft;
      titleInput.focus();
    }
  }
  const month = document.getElementById("month");
  if (month && monthValue) month.value = monthValue;
  if (!hasMonth || !lastHistory) loadHistory();
  else renderHistory();
}

document.addEventListener("change", (e) => {
  if (e.target.id === "month") loadHistory();
  if (e.target.id === "tournament-name") {
    const name = e.target.value.trim();
    const currentName = archiveTournament?.name ?? state?.name;
    if (name && name !== currentName) {
      const body = archiveTournament ? { name, number: archiveTournament.number } : { name };
      cmd("rename", body);
    } else e.target.value = currentName ?? "";
    return;
  }
  const sel = e.target;
  if (!sel.dataset?.user) return;
  fetch("/api/archetype", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: sel.dataset.user, archetype: sel.value }),
  });
});

(async function boot() {
  await refresh();
  render();
  setInterval(async () => { if (await refresh()) render(); }, 5000);
})();
</script>
</body>
</html>`;

export function startDashboard(store: Store, service: TournamentService): void {
  // This UI has no auth layer, so make loopback a hard safety boundary.
  if (!isLoopbackBind()) throw new Error("DASHBOARD_BIND must stay loopback; remote dashboard access is not authenticated");
  if (!Number.isInteger(config.dashboardPort) || config.dashboardPort < 1 || config.dashboardPort > 65535) {
    throw new Error("DASHBOARD_PORT must be an integer between 1 and 65535");
  }
  Bun.serve({
    hostname: config.dashboardBind,
    port: config.dashboardPort,
    async fetch(req) {
      const url = new URL(req.url);
      const t = store.data.tournament;

      if (url.pathname === "/api/state") {
        return Response.json({ tournament: t ? createDashboardViewModel(t) : null });
      }

      if (url.pathname === "/api/archetype" && req.method === "POST") {
        const body = (await req.json()) as { userId?: string; archetype?: string };
        if (!t || !body.userId) return Response.json({ error: "no tournament or userId" }, { status: 400 });
        const player = t.players[body.userId];
        if (!player) return Response.json({ error: "unknown user" }, { status: 404 });
        if (body.archetype !== undefined && typeof body.archetype !== "string") return Response.json({ error: "invalid archetype" }, { status: 400 });
        if (body.archetype && body.archetype.length > 80) return Response.json({ error: "archetype too long" }, { status: 400 });
        player.archetype = body.archetype === undefined || body.archetype.trim() === "" ? null : body.archetype.trim();
        store.save();
        return Response.json({ ok: true });
      }

      if (url.pathname === "/api/history") {
        const months = availableMonths(store.data.history, config.timeZone);
        const fallback = monthKey(new Date().toISOString(), config.timeZone);
        const month = url.searchParams.get("month") ?? months[0] ?? fallback;
        const inMonth = filterByMonth(store.data.history, month, config.timeZone);
        return Response.json({
          month,
          months,
          summary: periodSummary(inMonth),
          tournaments: inMonth.map((h) => {
            const rows = computeStandings(h);
            const top = rows[0];
            return {
              number: h.number,
              name: h.name,
              createdAt: h.createdAt,
              endedAt: h.endedAt,
              players: Object.keys(h.players).length,
              rounds: h.rounds.length,
              winner: top ? { username: top.player.username, points: top.points } : null,
            };
          }),
          meta: metaForPeriod(inMonth),
        });
      }

      if (url.pathname === "/api/history/tournament") {
        const number = Number(url.searchParams.get("number"));
        const tournament = store.data.history.find((h) => h.number === number);
        if (!tournament) return Response.json({ error: "archived tournament not found" }, { status: 404 });
        return Response.json({ tournament: createDashboardViewModel(tournament) });
      }

      if (url.pathname === "/api/commands" && req.method === "POST") {
        const body = (await req.json()) as { action?: string; name?: string; number?: number; structure?: string; topCut?: number | null; winner?: string; games?: string; user?: string };
        try {
          const action = body.action ?? "";
          let message = "";
          switch (action) {
            case "rename": {
              const name = body.name?.trim();
              if (!name) throw new Error("name required");
              if (body.number !== undefined) {
                const archived = store.data.history.find((tour) => tour.number === body.number);
                if (!archived) throw new Error("archived tournament not found");
                archived.name = name;
              } else {
                if (!t) throw new Error("no tournament yet");
                if (t.phase === "ended") throw new Error("tournament ended");
                t.name = name;
              }
              store.save();
              message = "Tournament renamed.";
              break;
            }
            case "create": {
              if (!body.name) throw new Error("name required");
              const signupChannelId = config.signupChannelId || t?.signupChannelId || "";
              const pairingChannelId = config.pairingChannelId || t?.pairingChannelId || "";
              const dropsChannelId = config.dropsChannelId || t?.dropsChannelId || "";
              if (!signupChannelId || !pairingChannelId || !dropsChannelId) throw new Error("set the three TOURNEY_*_CHANNEL_ID variables");
              const [signupChannel, pairingChannel, dropChannel] = await Promise.all([
                service.sendableFor(signupChannelId),
                service.sendableFor(pairingChannelId),
                service.sendableFor(dropsChannelId),
              ]);
              if (!signupChannel || !pairingChannel || !dropChannel) throw new Error("bot cannot access one of the configured tournament channels");
              await service.create(body.name, signupChannel, config.guildId, signupChannelId, {
                structure: body.structure as "swiss" | "singleElimination" | "doubleElimination" | "roundRobin" | "swissTopCut",
                topCut: body.topCut,
                signupChannelId,
                pairingChannelId,
                dropsChannelId,
                dropChannel,
              });
              message = "Tournament created.";
              break;
            }
            case "start":
              message = await service.start();
              break;
            case "pair":
              message = await service.pair();
              break;
            case "topCut":
              message = await service.startTopCut();
              break;
            case "doubleLoss":
              message = await service.reportDoubleLoss();
              break;
            case "report": {
              if (!body.winner) throw new Error("winner required");
              const games = (body.games ?? "2-0").split("-").map(Number);
              if (games.length !== 2 || games.some((score) => !Number.isInteger(score))) throw new Error("invalid score — use 2-0 or 2-1");
              message = await service.reportWin(body.winner, games[0] as number, games[1] as number);
              break;
            }
            case "drop":
              if (!body.user) throw new Error("user required");
              message = await service.drop(body.user);
              break;
            case "end":
              message = await service.end();
              break;
            case "cancel":
              message = await service.cancel();
              break;
            default:
              throw new Error("unknown action: " + action);
          }
          return Response.json({ ok: true, message });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 400 });
        }
      }

      const page = PAGE;
      return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  console.log(`[dashboard] http://${config.dashboardBind}:${config.dashboardPort}`);
}
