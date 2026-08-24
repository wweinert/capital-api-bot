import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANDIDATE, SERIES_SYMBOLS } from "./autoresearch/train.js";
import { evaluate, prepare, RESEARCH_PROTOCOL } from "./autoresearch/prepare.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const commonProtocol = {
  ...RESEARCH_PROTOCOL,
  schemaVersion: 5,
  evaluationEndExclusive: "2026-08-10T00:00:00.000Z",
  minimumCoverageEnd: "2026-08-07T20:00:00.000Z",
  lockedTest: "opened-once-after-candidate-freeze",
  sizing: `${RESEARCH_PROTOCOL.sizing}; account resets to EUR 500 at each replay boundary`,
};

const LOCKED_PROTOCOL = Object.freeze({
  ...commonProtocol,
  name: "locked-june-to-august-2026",
  train: Object.freeze({ fromWeek: "2026-W23", toWeek: "2026-W27", label: "locked-early" }),
  validation: Object.freeze({ fromWeek: "2026-W28", toWeek: "2026-W32", label: "locked-late" }),
});

const SIX_MONTH_PROTOCOL = Object.freeze({
  ...commonProtocol,
  name: "six-month-replay-2026",
  train: Object.freeze({ fromWeek: "2026-W07", toWeek: "2026-W19", label: "first-13-weeks" }),
  validation: Object.freeze({ fromWeek: "2026-W20", toWeek: "2026-W32", label: "last-13-weeks" }),
  lockedTest: "diagnostic-combined-replay-includes-development-and-opened-locked-weeks",
});

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const serializableCandidate = Object.fromEntries(Object.entries(CANDIDATE).filter(([, value]) => typeof value !== "function"));

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dataset") options.dataset = argv[++i];
    else if (argv[i] === "--report") options.report = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return options;
}

function summary(result) {
  return {
    qualified: result.qualified,
    gates: result.gates,
    startCapital: result.startCapital,
    finalBalance: result.finalBalance,
    pnl: result.pnl,
    returnPct: result.returnPct,
    profitFactor: result.profitFactor,
    maxDrawdownR: result.maxDrawdownR,
    maxDrawdownPct: result.maxDDPct,
    entries: result.entries,
    winRate: result.precision.winRate,
    tradesPerDay: result.precision.tradesPerDay,
    firstFold: result.folds.train,
    secondFold: result.folds.validation,
    monthly: result.monthly,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node lab/harness/replay.js --dataset <snapshot> [--report path.json]");
    return;
  }
  if (!options.dataset) throw new Error("Pass --dataset. Harness evaluation is offline and never downloads data.");
  const datasetDir = path.resolve(options.dataset);
  const prepared = prepare(datasetDir, SERIES_SYMBOLS, { protocol: SIX_MONTH_PROTOCOL, strictWindow: true });
  const locked = evaluate({ ...prepared, protocol: LOCKED_PROTOCOL, strictWindow: true }, CANDIDATE);
  const sixMonth = evaluate({ ...prepared, protocol: SIX_MONTH_PROTOCOL, strictWindow: true }, CANDIDATE);
  const evaluatorSource = fs.readFileSync(path.resolve(HERE, "../autoresearch/prepare.js"));
  const candidateSource = fs.readFileSync(path.resolve(HERE, "../autoresearch/train.js"));
  const output = {
    generatedAt: new Date().toISOString(),
    policy: "Frozen candidate; no parameter changes after opening the locked period; server/source dataset read-only.",
    strategy: serializableCandidate,
    hashes: {
      candidateConfigSha256: sha256(JSON.stringify(serializableCandidate)),
      candidateSourceSha256: sha256(candidateSource),
      evaluatorSourceSha256: sha256(evaluatorSource),
      datasetFingerprint: sha256(JSON.stringify(prepared.coverage)),
    },
    coverage: prepared.coverage,
    locked: { protocol: LOCKED_PROTOCOL, summary: summary(locked), result: locked },
    sixMonth: { protocol: SIX_MONTH_PROTOCOL, summary: summary(sixMonth), result: sixMonth },
    limitations: [
      "The June-August result is now opened and cannot be reused as a fresh holdout.",
      "The six-month replay overlaps the original development window and is diagnostic, not independent confirmation.",
      "Bid/ask execution is modeled, but broker-specific slippage, gaps, financing, minimum stop distance, and exact minimum deal size are not yet stressed.",
      "August includes only completed ISO weeks through 2026-08-09; the partial current week is excluded.",
    ],
  };
  if (options.report) {
    const reportPath = path.resolve(options.report);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`report: ${reportPath}`);
  }
  console.log(JSON.stringify({ locked: output.locked.summary, sixMonth: output.sixMonth.summary }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`harness replay failed: ${error.message}`);
  process.exitCode = 1;
}
