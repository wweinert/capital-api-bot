import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { PORTFOLIO, PROFILES, RISK, SESSIONS } from "../../config.js";
import { discoverSymbols, evaluate, evaluatePairProfiles, prepare, preparePairProfiles, RESEARCH_PROTOCOL, validateCandidateConfig } from "./prepare.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, "../..");

export const SERIES_SYMBOLS = Object.freeze([
    ...new Set(Object.values(SESSIONS).flatMap((session) => session.SYMBOLS ?? [])),
]);

// This is a snapshot assembled directly from the current live configuration.
// The evaluator mirrors strategies/strategies.js, services/trading.js and
// monitors.js without importing any broker session or order function.
export const CANDIDATE = Object.freeze({
    name: "current-live-green-red-m15-baseline",
    startCapital: RESEARCH_PROTOCOL.startCapital,
    maxPositions: PORTFOLIO.MAX_POSITIONS,
    maxPortfolioRiskPct: RESEARCH_PROTOCOL.risk.maxPortfolioPct,
    profiles: PROFILES,
    sessions: SESSIONS,
    riskRules: RISK,
    portfolioRules: PORTFOLIO,
});

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const serializableCandidate = (candidate) => Object.fromEntries(Object.entries(candidate).filter(([, value]) => typeof value !== "function"));

function sourceHashes() {
    const files = [
        "bot.js",
        "config.js",
        "indicators/indicators.js",
        "monitors.js",
        "services/trading.js",
        "strategies/strategies.js",
    ];
    return Object.fromEntries(files.map((file) => [file, sha256(fs.readFileSync(path.join(REPOSITORY_ROOT, file)))]));
}

function parseArgs(argv) {
    const options = { json: false, check: false };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--json") options.json = true;
        else if (argument === "--check") options.check = true;
        else if (argument === "--help" || argument === "-h") options.help = true;
        else if (argument === "--dataset") options.dataset = argv[++index];
        else if (argument === "--symbols") options.symbols = argv[++index]?.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
        else if (argument === "--from") options.from = argv[++index];
        else if (argument === "--to") options.to = argv[++index];
        else if (argument === "--max-portfolio-risk") options.maxPortfolioRiskPct = Number(argv[++index]);
        else if (argument === "--report") options.report = argv[++index];
        else if (argument === "--pair-profiles") options.pairProfiles = true;
        else throw new Error(`Unknown argument: ${argument}`);
    }
    return options;
}

function printHelp() {
    console.log(`Usage: node lab/autoresearch/train.js --dataset <directory> [options]

Options:
  --symbols EURUSD,GBPUSD     Override the live session symbol universe
  --from 2026-01-01          Optional inclusive UTC start
  --to 2026-08-19            Optional exclusive UTC end
  --max-portfolio-risk 0.15  Hard cap; may be lowered to 0.10
  --check                     Audit M15/H1 availability and prepare signals
  --json                      Print the complete result, including trades
  --report /tmp/baseline.json Write the complete result to a JSON file
  --pair-profiles             Replay the five JSON files in lab/pair-profiles
  -h, --help                  Show this help

AUTORESEARCH_DATASET_DIR may be used instead of --dataset. The run is offline;
it never starts a broker session and never changes the source dataset.`);
}

function buildCandidate(options = {}) {
    const maxPortfolioRiskPct = options.maxPortfolioRiskPct ?? CANDIDATE.maxPortfolioRiskPct;
    return { ...CANDIDATE, maxPortfolioRiskPct };
}

function conciseResult(result) {
    return {
        start: result.start,
        endExclusive: result.endExclusive,
        startCapital: result.startCapital,
        finalBalance: result.finalBalance,
        pnl: result.pnl,
        returnPct: result.returnPct,
        entries: result.entries,
        trades: result.trades.length,
        tradesPerDay: result.tradesPerDay,
        winRate: result.winRate,
        profitFactor: result.profitFactor,
        maxDrawdownEur: result.maxDrawdownEur,
        maxDrawdownPct: result.maxDrawdownPct,
        risk: result.risk,
        orders: result.orders,
        exitReasons: result.exitReasons,
        rejections: result.rejections,
        monthly: result.monthly,
        symbolStats: result.symbolStats,
    };
}

export function checkCandidate(datasetDir, requestedSymbols = SERIES_SYMBOLS, candidate = CANDIDATE) {
    validateCandidateConfig(candidate);
    const available = discoverSymbols(datasetDir);
    const missing = requestedSymbols.filter((symbol) => !available.includes(symbol));
    const unusedProfiles = Object.keys(candidate.profiles).filter((symbol) => !SERIES_SYMBOLS.includes(symbol));
    return { available, requestedSymbols, missing, unusedProfiles };
}

export function runExperiment(datasetDir, requestedSymbols = SERIES_SYMBOLS, options = {}) {
    const candidate = options.candidate ?? buildCandidate(options);
    const audit = checkCandidate(datasetDir, requestedSymbols, candidate);
    const started = performance.now();
    const prepared = prepare(datasetDir, requestedSymbols, {
        protocol: RESEARCH_PROTOCOL,
        candidate,
        from: options.from,
        to: options.to,
    });
    const preparationSeconds = (performance.now() - started) / 1000;
    const evaluationStarted = performance.now();
    const result = evaluate(prepared, candidate);
    const evaluationSeconds = (performance.now() - evaluationStarted) / 1000;
    const evaluatorSource = fs.readFileSync(path.join(HERE, "prepare.js"));
    const candidateConfig = serializableCandidate(candidate);
    const metadata = {
        generatedAt: new Date().toISOString(),
        evaluatorSha256: sha256(evaluatorSource),
        candidateSha256: sha256(JSON.stringify(candidateConfig)),
        liveSourceSha256: sourceHashes(),
        datasetFingerprint: prepared.datasetFingerprint,
        coverage: prepared.coverage,
        requestedSymbols: prepared.requestedSymbols,
        evaluatedSymbols: prepared.symbols,
        missingSymbols: prepared.missingSymbols,
        availableSymbols: prepared.availableSymbols,
        signalAudit: prepared.signalAudit,
        preparedCandidates: prepared.events.length,
        preparationSeconds,
        evaluationSeconds,
    };
    const findings = {
        inactiveLiveProfiles: audit.unusedProfiles,
        missingHistoricalLiveSymbols: audit.missing,
        h1CurrentlyAffectsSignal: true,
        liveProfileFieldsCurrentlyUnusedByStrategy: [],
    };
    const limitations = [
        "Only M15 and H1 were loaded, as requested. Pending fills, SL/TP ambiguity, max-hold checks and trailing are therefore resolved on M15 rather than the live one-minute monitor cadence.",
        "When SL and TP are both touched in one M15 candle, SL is applied first. Trailing changes become active on the next M15 candle.",
        "Historical broker minimum stop/target distances, financing, guaranteed-stop premiums and rejection/slippage details are unavailable in the candle files.",
        "Drawdown is calculated from realized account balance. Intratrade unrealized equity drawdown is not included.",
        "Leverage uses the existing research convention of 30:1 for major USD pairs and 20:1 for crosses because historical marginFactor snapshots are not present.",
        "The run enforces the user's one-symbol-one-slot requirement and therefore does not reproduce the live duplicate-symbol candidate bug during overlapping configured sessions.",
        "This full-period baseline becomes inspected evidence and is not a fresh locked test for later optimization.",
    ];
    return { protocol: RESEARCH_PROTOCOL, candidate: candidateConfig, metadata, findings, limitations, summary: conciseResult(result), result };
}

export function runPairProfileExperiment(datasetDir, options = {}) {
    const profileDir = path.resolve(HERE, "../pair-profiles");
    const symbols = ["AUDUSD", "EURGBP", "EURUSD", "GBPUSD", "USDJPY"];
    const profileDocuments = Object.fromEntries(symbols.map((symbol) => [symbol, JSON.parse(fs.readFileSync(path.join(profileDir, `${symbol}.json`), "utf8"))]));
    const started = performance.now();
    const prepared = preparePairProfiles(datasetDir, profileDocuments, { from: options.from, to: options.to });
    const preparationSeconds = (performance.now() - started) / 1000;
    const evaluatedAt = performance.now();
    const result = evaluatePairProfiles(prepared, { startCapital: 500, maxPositions: 5, maxPortfolioRiskPct: options.maxPortfolioRiskPct ?? 0.15 });
    const evaluationSeconds = (performance.now() - evaluatedAt) / 1000;
    return {
        protocol: { ...RESEARCH_PROTOCOL, name: "stored-five-pair-profiles-short-replay", profileFrequencyLimits: "removed", globalH1Direction: true },
        metadata: { generatedAt: new Date().toISOString(), profileFiles: symbols.map((symbol) => path.relative(REPOSITORY_ROOT, path.join(profileDir, `${symbol}.json`))), activeSymbols: prepared.symbols, disabledSymbols: prepared.disabledSymbols, missingSymbols: prepared.missingSymbols, coverage: prepared.coverage, signalAudit: prepared.signalAudit, datasetFingerprint: prepared.datasetFingerprint, preparationSeconds, evaluationSeconds },
        limitations: [
            "Only M15 and H1 are used. Entry, partial exit, breakeven, trailing and intrabar ambiguity are replayed conservatively on M15.",
            "EURGBP is reported but not traded because its stored JSON has profile: null.",
            "All four non-null stored profiles have enabled:false research-admission flags; this requested replay applies their profile bodies without treating them as approved for live deployment.",
            "The mandatory one-closed-H1-bar direction filter is applied globally, including USDJPY whose historical profile originally recorded no higher-timeframe filter.",
            "Daily trade caps, cooldowns and loss-streak caps are deliberately not applied.",
            "Broker minimum size/distance, slippage, gaps and financing are not available in the candle dataset.",
        ],
        summary: conciseResult(result),
        result,
    };
}

function printSummary(output) {
    const { summary, metadata, findings } = output;
    console.log("--- current live M15/H1 baseline ---");
    console.log(`period:                 ${summary.start} .. ${summary.endExclusive}`);
    console.log(`symbols:                ${metadata.evaluatedSymbols.join(",")}`);
    console.log(`missing:                ${metadata.missingSymbols.join(",") || "none"}`);
    console.log(`start/final EUR:        ${summary.startCapital.toFixed(2)} / ${summary.finalBalance.toFixed(2)}`);
    console.log(`pnl / return:           ${summary.pnl.toFixed(2)} / ${summary.returnPct.toFixed(2)}%`);
    console.log(`entries / per day:      ${summary.entries} / ${summary.tradesPerDay.toFixed(3)}`);
    console.log(`win rate / PF:          ${summary.winRate.toFixed(2)}% / ${summary.profitFactor.toFixed(3)}`);
    console.log(`max drawdown:           EUR ${summary.maxDrawdownEur.toFixed(2)} / ${summary.maxDrawdownPct.toFixed(2)}%`);
    console.log(`max position risk:      ${summary.risk.maxPositionPct.toFixed(3)}%`);
    console.log(`max portfolio risk:     ${summary.risk.maxPortfolioPct.toFixed(3)}%`);
    console.log(`max margin usage:       ${summary.risk.maxMarginUsagePct.toFixed(3)}%`);
    console.log(`prepared candidates:    ${metadata.preparedCandidates}`);
    console.log(`global H1 direction:    ${findings.h1CurrentlyAffectsSignal}`);
    console.log(`dataset fingerprint:    ${metadata.datasetFingerprint}`);
    console.log(`evaluator sha256:       ${metadata.evaluatorSha256}`);
    console.log(`prepare/evaluate sec:   ${metadata.preparationSeconds.toFixed(1)} / ${metadata.evaluationSeconds.toFixed(1)}`);
}

function printPairProfileSummary(output) {
    const { summary, metadata } = output;
    console.log("--- stored five-pair profile replay ---");
    console.log(`period:                 ${summary.start} .. ${summary.endExclusive}`);
    console.log(`active symbols:         ${metadata.activeSymbols.join(",")}`);
    console.log(`disabled profiles:      ${metadata.disabledSymbols.join(",") || "none"}`);
    console.log(`start/final EUR:        ${summary.startCapital.toFixed(2)} / ${summary.finalBalance.toFixed(2)}`);
    console.log(`pnl / return:           ${summary.pnl.toFixed(2)} / ${summary.returnPct.toFixed(2)}%`);
    console.log(`entries / per day:      ${summary.entries} / ${summary.tradesPerDay.toFixed(3)}`);
    console.log(`win rate / PF:          ${summary.winRate.toFixed(2)}% / ${summary.profitFactor.toFixed(3)}`);
    console.log(`max drawdown:           EUR ${summary.maxDrawdownEur.toFixed(2)} / ${summary.maxDrawdownPct.toFixed(2)}%`);
    console.log(`max portfolio risk:     ${summary.risk.maxPortfolioPct.toFixed(3)}%`);
    console.log(`prepare/evaluate sec:   ${metadata.preparationSeconds.toFixed(1)} / ${metadata.evaluationSeconds.toFixed(1)}`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) return printHelp();
    const datasetValue = options.dataset ?? process.env.AUTORESEARCH_DATASET_DIR;
    if (!datasetValue) throw new Error("Pass --dataset or set AUTORESEARCH_DATASET_DIR.");
    const datasetDir = path.resolve(datasetValue);
    if (options.pairProfiles) {
        const output = runPairProfileExperiment(datasetDir, options);
        if (options.report) {
            const reportPath = path.resolve(options.report);
            fs.mkdirSync(path.dirname(reportPath), { recursive: true });
            fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
            console.log(`report: ${reportPath}`);
        }
        if (options.json) console.log(JSON.stringify(output, null, 2));
        else printPairProfileSummary(output);
        return;
    }
    const symbols = options.symbols ?? SERIES_SYMBOLS;
    const candidate = buildCandidate(options);
    if (options.check) {
        const audit = checkCandidate(datasetDir, symbols, candidate);
        const prepared = prepare(datasetDir, symbols, { protocol: RESEARCH_PROTOCOL, candidate, from: options.from, to: options.to });
        console.log(JSON.stringify({ ok: true, datasetDir, ...audit, evaluatedSymbols: prepared.symbols, datasetFingerprint: prepared.datasetFingerprint, coverage: prepared.coverage, signalAudit: prepared.signalAudit, candidates: prepared.events.length }, null, 2));
        return;
    }
    const output = runExperiment(datasetDir, symbols, { ...options, candidate });
    if (options.report) {
        const reportPath = path.resolve(options.report);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
        console.log(`report: ${reportPath}`);
    }
    if (options.json) console.log(JSON.stringify(output, null, 2));
    else printSummary(output);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`live baseline failed: ${error.stack ?? error.message}`);
        process.exitCode = 1;
    });
}
