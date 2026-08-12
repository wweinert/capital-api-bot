import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, prepare } from "./prepare.js";
import { decide, rank, PROTOCOL, SERIES_SYMBOLS } from "./train-price-action-portfolio.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.resolve(process.argv[2] ?? "");
const SOURCE = path.resolve(process.argv[3] ?? "lab/autoresearch/reports/m15-price-action-h1-session-portfolio-17fx-20min-2026-08-12.json");
const REPORT = path.resolve(process.argv[4] ?? "lab/autoresearch/reports/m15-price-action-h1-stable-portfolio-post-search-2026-08-12.json");
if (!process.argv[2]) throw new Error("Pass the dataset directory as the first argument.");

const source = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const stable = source.stablePostSearchCells ?? [];
const selected = new Map();
for (const record of stable) {
  const symbol = record.candidate.symbols?.[0], session = record.candidate.allowedSessions?.[0];
  if (!symbol || !session) continue;
  const key = `${session}:${symbol}`;
  if (!selected.has(key)) selected.set(key, record);
}

function profileMap(fixedOnly) {
  const profiles = {};
  for (const record of selected.values()) {
    const symbol = record.candidate.symbols[0], session = record.candidate.allowedSessions[0];
    const profile = { ...record.candidate };
    for (const key of ["name", "symbols", "allowedSessions", "riskPct", "marginUtilization", "maxPositions", "rankAtTimestampLimit"]) delete profile[key];
    if (fixedOnly) Object.assign(profile, { exitKey: "fixed-2r-control", runnerMode: "none", breakEvenR: 0, trailATR: 0, trailR: 0,
      partialRunner: false, partialR: 0, partialFraction: 0, moveStopOnPartial: false });
    profiles[symbol] ??= {}; profiles[symbol][session] = profile;
  }
  return profiles;
}

function portfolio(name, riskPct, fixedOnly) {
  const pairSessionProfiles = profileMap(fixedOnly), symbols = Object.keys(pairSessionProfiles);
  return {
    ...stable[0].candidate,
    name, symbols, allowedSessions: undefined, portfolioMode: true, pairSessionProfiles,
    riskPct, maxPositions: 5, rankAtTimestampLimit: 5, maxDaily: 3, decide, rank,
  };
}

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function serializable(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== "function" && item !== undefined)); }
function compact(result) {
  return { finalBalance: result.finalBalance, returnPct: result.returnPct, profitFactor: result.profitFactor, entries: result.entries,
    partialExits: result.partialExits, maxDrawdownR: result.maxDrawdownR, maxDrawdownPct: result.maxDDPct, risk: result.risk,
    train: result.folds.train, validation: result.folds.validation, dailyFolds: result.dailyFolds, gates: result.gates,
    recent: result.recent, symbolStats: result.symbolStats, sessionStats: result.sessionStats, monthly: result.monthly };
}

const protocol = source.protocol ?? PROTOCOL;
const prepared = prepare(DATASET, SERIES_SYMBOLS, { protocol, strictWindow: true });
const candidates = [];
for (const riskPct of [0.01, 0.02, 0.03]) {
  candidates.push(portfolio(`post-search-stable-tuned-risk-${100 * riskPct}`, riskPct, false));
  candidates.push(portfolio(`post-search-stable-fixed2r-risk-${100 * riskPct}`, riskPct, true));
}
const results = candidates.map((candidate) => ({ candidate: serializable(candidate), result: compact(evaluate(prepared, candidate)) }));
const output = {
  generatedAt: new Date().toISOString(), source: SOURCE,
  evidenceStatus: "post-search diagnostic selected after inspecting both train and validation; not an independent walk-forward result",
  protocol,
  evaluatorSha256: sha256(fs.readFileSync(path.join(HERE, "prepare.js"))),
  datasetFingerprint: sha256(JSON.stringify(prepared.coverage)),
  selectedProfiles: [...selected.values()].map((record) => ({ candidate: record.candidate, sourceSummary: record.summary })),
  results,
};
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ report: REPORT, selectedProfiles: output.selectedProfiles.map((item) => item.candidate.name),
  results: results.map((item) => ({ name: item.candidate.name, ...item.result })) }, null, 2));
