import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { PORTFOLIO, PROFILES, RISK, SESSIONS } from "../../config.js";
import { discoverSymbols, evaluate, evaluatePairProfiles, evaluateSessionProfile, prepare, preparePairProfiles, prepareSessionProfileSearch, RESEARCH_PROTOCOL, summarizeSessionSearchTrades, validateCandidateConfig } from "./prepare.js";

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
        else if (argument === "--session-search") options.sessionSearch = true;
        else if (argument === "--replay-session-report") options.replaySessionReport = argv[++index];
        else if (argument === "--seconds") options.seconds = Number(argv[++index]);
        else if (argument === "--seed") options.seed = Number(argv[++index]);
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
  --session-search            Search pair-by-session M15/H1 profiles
  --replay-session-report f   Causally replay frozen profiles from a search report
  --seconds 1800              Session-search wall-clock budget (default 30m)
  --seed 20260826             Deterministic session-search seed
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

const PROFILE_SEARCH_SESSIONS = Object.freeze(["asia", "london", "overlap", "newYork"]);

function seededRandom(seed) {
    let state = (Number(seed) || 1) >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function pick(random, values) {
    return values[Math.floor(random() * values.length)];
}

function randomSearchCandidate(random, symbol, session) {
    const minAtrPercentile = pick(random, [0, 0.1, 0.25, 0.4, 0.6]);
    const maxAtrPercentile = pick(random, [0.75, 0.9, 1]);
    const exitMode = random() < 0.72 ? "fixed" : "partial";
    const trailing = exitMode === "fixed" && random() < 0.25;
    return {
        name: `${symbol}-${session}-m15h1`,
        symbol,
        session,
        structureMode: pick(random, ["greenred", "greenred", "continuation"]),
        minImpulseAtr: pick(random, [0.25, 0.5, 0.75, 1]),
        minSwingGapAtr: pick(random, [0, 0.05, 0.1, 0.2]),
        maxRetrace: pick(random, [0.8, 0.95, 1.05, 1.2]),
        h1Bars: pick(random, [0, 0, 1, 1, 2, 4]),
        minH1MoveAtr: pick(random, [0, 0.05, 0.1, 0.15, 0.25, 0.4]),
        indicatorMode: pick(random, ["none", "none", "score", "bollinger", "rsi", "volume"]),
        minIndicatorScore: pick(random, [1, 1, 2]),
        minBollingerRoomAtr: pick(random, [0.5, 0.75, 1]),
        minAtrPercentile: Math.min(minAtrPercentile, maxAtrPercentile),
        maxAtrPercentile,
        minEfficiency: pick(random, [0, 0.05, 0.15, 0.25]),
        minActivity: pick(random, [0, 0.75, 1, 1.25]),
        minBodyRatio: pick(random, [0, 0.2, 0.3, 0.4]),
        minBodyAtr: pick(random, [0, 0, 0.2, 0.3]),
        minVolumeRatio: pick(random, [0, 0, 0.8, 1, 1.2]),
        maxSpreadAtr: pick(random, [0.5, 0.75, 1, 1.25, 1.5]),
        entryOffsetAtr: pick(random, [0, 0.01, 0.02, 0.03, 0.05]),
        expiryMinutes: pick(random, [15, 30, 45, 60, 75, 90]),
        stopBufferAtr: pick(random, [0, 0.02, 0.03, 0.05, 0.075]),
        exitMode,
        targetR: pick(random, [0.75, 1, 1.1, 1.25, 1.5, 2]),
        breakEvenAtR: exitMode === "fixed" && random() < 0.3 ? pick(random, [0.75, 1, 1.25]) : null,
        trailActivationR: trailing ? pick(random, [0.75, 1, 1.25]) : null,
        trailDistanceR: trailing ? pick(random, [0.4, 0.5, 0.75, 1]) : null,
        partialAtR: pick(random, [0.65, 0.75, 1]),
        partialFraction: pick(random, [0.5, 0.6]),
        trailAtr: pick(random, [2, 3, 4]),
        maxHoldMinutes: pick(random, [120, 180, 240, 360, 480]),
        cooldownMinutes: pick(random, [15, 30, 45, 60]),
        maxDailyEntries: pick(random, [1, 1, 2]),
        maxDailyLosses: pick(random, [1, 1, 2]),
    };
}

function normalizeLegacySeed(symbol, session, config) {
    if (!config) return null;
    const partial = config.partialRunner === true;
    return {
        name: `${symbol}-${session}-legacy-seed`, symbol, session,
        structureMode: config.structureMode === "green-red" ? "greenred" : "greenred",
        minImpulseAtr: Number(config.minImpulseAtr ?? 0.5), minSwingGapAtr: Number(config.minSwingGapAtr ?? 0.1), maxRetrace: Number(config.maxRetrace ?? 1.05),
        h1Bars: [0, 1, 2, 4].includes(Number(config.h1Bars)) ? Number(config.h1Bars) : 0, minH1MoveAtr: Number(config.minH1TrendAtr ?? 0),
        indicatorMode: Number(config.minimumM15IndicatorScore ?? 0) > 0 ? "score" : "none", minIndicatorScore: Number(config.minimumM15IndicatorScore ?? 0), minBollingerRoomAtr: Number(config.minBollingerRoomAtr ?? 0.75),
        minAtrPercentile: Number(config.minAtrRank ?? 0), maxAtrPercentile: 1, minEfficiency: Number(config.minEfficiency24 ?? 0), minActivity: Number(config.minActivity4 ?? 0),
        minBodyRatio: Number(config.minSignalBodyRatio ?? 0), minBodyAtr: Number(config.minSignalBodyAtr ?? 0), minVolumeRatio: Number(config.minVolumeRatio ?? 0), maxSpreadAtr: Number(config.maxSpreadAtr ?? 1.25),
        entryOffsetAtr: Number(config.pendingOffsetAtr ?? 0), expiryMinutes: Number(config.pendingExpiryMinutes ?? 30), stopBufferAtr: Number(config.stopBufferAtr ?? 0.03),
        exitMode: partial ? "partial" : "fixed", targetR: Number(config.rewardRisk ?? 1.25), breakEvenAtR: Number(config.breakEvenR) > 0 ? Number(config.breakEvenR) : null,
        trailActivationR: Number(config.trailR) > 0 ? Number(config.breakEvenR ?? 1) : null, trailDistanceR: Number(config.trailR) > 0 ? Number(config.trailR) : null,
        partialAtR: Number(config.partialR ?? 0.75), partialFraction: Number(config.partialFraction ?? 0.6), trailAtr: Number(config.trailATR ?? 3),
        maxHoldMinutes: Number(config.hold ?? 240), cooldownMinutes: Number(config.cooldown ?? 30), maxDailyEntries: Number(config.maxDaily ?? 1), maxDailyLosses: Number(config.maxLossesPerSymbolDay ?? 1),
    };
}

function loadLegacySeeds() {
    const reportPath = path.join(HERE, "reports/session-greenred-17fx-30min-2026-08-23.json");
    if (!fs.existsSync(reportPath)) return [];
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    return PROFILE_SEARCH_SESSIONS.flatMap((session) => (report.selected?.[session] ?? [])
        .map((item) => normalizeLegacySeed(item.symbol, session, item.config)))
        .filter(Boolean);
}

function mutateCandidate(random, seed) {
    const fresh = randomSearchCandidate(random, seed.symbol, seed.session);
    const mutableKeys = Object.keys(fresh).filter((key) => !["name", "symbol", "session"].includes(key));
    const result = { ...seed, name: `${seed.symbol}-${seed.session}-mutated` };
    const changes = 1 + Math.floor(random() * 5);
    for (let index = 0; index < changes; index += 1) {
        const key = pick(random, mutableKeys);
        result[key] = fresh[key];
    }
    if (result.minAtrPercentile > result.maxAtrPercentile) [result.minAtrPercentile, result.maxAtrPercentile] = [result.maxAtrPercentile, result.minAtrPercentile];
    return result;
}

function profileScore(nominal, stress) {
    const foldFloor = Math.min(...Object.values(stress.folds).map((fold) => fold.totalR));
    return +(2 * stress.totalR + nominal.totalR + 3 * foldFloor + 0.2 * (stress.positiveActiveDayPct - 50) - stress.maxDrawdownR).toFixed(6);
}

function profileAdmission(nominal, stress) {
    const nominalFolds = Object.values(nominal.folds);
    const stressFolds = Object.values(stress.folds);
    const gates = {
        sample: nominal.entries >= 24 && nominalFolds.every((fold) => fold.entries >= 5),
        nominalProfit: nominal.totalR > 0 && nominalFolds.every((fold) => fold.totalR > 0),
        stressProfit: stress.totalR > 0 && stressFolds.every((fold) => fold.totalR > 0),
        winRate: nominal.winRate > 50 && stress.winRate > 50,
        profitFactor: nominal.profitFactor >= 1.1 && stress.profitFactor >= 1.05,
        positiveDays: nominal.positiveActiveDayPct > 50 && stress.positiveActiveDayPct > 50,
        drawdown: nominal.maxDrawdownR <= 8 && stress.maxDrawdownR <= 10,
        frequency: nominal.tradesPerDay >= 0.08 && nominal.tradesPerDay <= 0.8,
    };
    return { passed: Object.values(gates).every(Boolean), gates };
}

function compactProfileResult(item) {
    return { candidate: item.candidate, score: item.score, admission: item.admission, nominal: item.nominal, stress: item.stress, source: item.source };
}

function insertRanked(map, key, item, limit) {
    const values = map.get(key) ?? [];
    values.push(item);
    values.sort((left, right) => right.score - left.score);
    map.set(key, values.slice(0, limit));
}

function portfolioFromTrades(prepared, profileRuns, spreadKey, options = {}) {
    const maxEntriesPerDay = Number(options.maxEntriesPerDay ?? 4);
    const maxEntriesPerSession = Number(options.maxEntriesPerSession ?? 2);
    const maxPositions = Number(options.maxPositions ?? 5);
    const candidates = profileRuns.flatMap((run) => run[spreadKey].trades.map((trade) => ({ ...trade, priority: run.priority ?? 0, profileKey: `${run.candidate.symbol}:${run.candidate.session}` })))
        .sort((left, right) => left.signalAt - right.signalAt || right.priority - left.priority || left.profileKey.localeCompare(right.profileKey));
    const accepted = [];
    const dayEntries = new Map();
    const daySessionEntries = new Map();
    for (const trade of candidates) {
        const active = accepted.filter((item) => item.closedMs > trade.signalAt);
        if (active.length >= maxPositions || active.some((item) => item.symbol === trade.symbol)) continue;
        const usedToday = dayEntries.get(trade.day) ?? 0;
        const remainingSessions = PROFILE_SEARCH_SESSIONS.length - PROFILE_SEARCH_SESSIONS.indexOf(trade.session) - 1;
        const usableBeforeFutureSessions = Math.max(1, maxEntriesPerDay - remainingSessions);
        if (usedToday >= usableBeforeFutureSessions) continue;
        const sessionKey = `${trade.day}:${trade.session}`;
        if ((daySessionEntries.get(sessionKey) ?? 0) >= maxEntriesPerSession) continue;
        accepted.push(trade);
        dayEntries.set(trade.day, (dayEntries.get(trade.day) ?? 0) + 1);
        daySessionEntries.set(sessionKey, (daySessionEntries.get(sessionKey) ?? 0) + 1);
    }
    const summary = summarizeSessionSearchTrades(prepared, accepted);
    let balance = 500;
    let peak = balance;
    let maxDrawdownPct = 0;
    for (const trade of [...accepted].sort((left, right) => left.closedMs - right.closedMs)) {
        balance += balance * 0.01 * trade.r;
        peak = Math.max(peak, balance);
        maxDrawdownPct = Math.max(maxDrawdownPct, 100 * (peak - balance) / peak);
    }
    const sessionEntries = Object.fromEntries(PROFILE_SEARCH_SESSIONS.map((session) => [session, accepted.filter((trade) => trade.session === session).length]));
    return { summary: { ...summary, finalBalance: +balance.toFixed(2), pnl: +(balance - 500).toFixed(2), returnPct: +(100 * (balance - 500) / 500).toFixed(2), maxDrawdownPct: +maxDrawdownPct.toFixed(2), sessionEntries }, trades: accepted };
}

function weekStartUtc(timestamp) {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.getTime();
}

function weeklyPortfolioStats(prepared, trades, options = {}) {
    const startCapital = Number(options.startCapital ?? 500);
    const riskPct = Number(options.riskPct ?? 0.01);
    const weekMs = 7 * 24 * 60 * 60_000;
    const ordered = [...trades].sort((left, right) => left.closedMs - right.closedMs);
    const byWeek = new Map();
    for (const trade of ordered) {
        const key = weekStartUtc(trade.closedMs);
        byWeek.set(key, [...(byWeek.get(key) ?? []), trade]);
    }

    let balance = startCapital;
    const weeks = [];
    for (let cursor = weekStartUtc(prepared.start); cursor < prepared.endExclusive; cursor += weekMs) {
        const weekTrades = byWeek.get(cursor) ?? [];
        const openingBalance = balance;
        let peak = balance;
        let maxDrawdownEur = 0;
        let maxDrawdownPct = 0;
        let grossProfit = 0;
        let grossLoss = 0;
        const dailyPnl = new Map();
        const sessions = Object.fromEntries(PROFILE_SEARCH_SESSIONS.map((session) => [session, 0]));

        for (const trade of weekTrades) {
            const pnl = balance * riskPct * trade.r;
            balance += pnl;
            if (pnl > 0) grossProfit += pnl;
            if (pnl < 0) grossLoss += pnl;
            const day = new Date(trade.closedMs).toISOString().slice(0, 10);
            dailyPnl.set(day, (dailyPnl.get(day) ?? 0) + pnl);
            sessions[trade.session] += 1;
            peak = Math.max(peak, balance);
            maxDrawdownEur = Math.max(maxDrawdownEur, peak - balance);
            maxDrawdownPct = Math.max(maxDrawdownPct, 100 * (peak - balance) / peak);
        }

        const pnl = balance - openingBalance;
        const wins = weekTrades.filter((trade) => trade.r > 0).length;
        const losses = weekTrades.filter((trade) => trade.r < 0).length;
        const activeDays = dailyPnl.size;
        const positiveDays = [...dailyPnl.values()].filter((value) => value > 0).length;
        weeks.push({
            weekStart: new Date(cursor).toISOString().slice(0, 10),
            weekEnd: new Date(Math.min(cursor + weekMs, prepared.endExclusive) - 1).toISOString().slice(0, 10),
            openingBalance: +openingBalance.toFixed(2),
            closingBalance: +balance.toFixed(2),
            pnl: +pnl.toFixed(2),
            returnPct: openingBalance ? +(100 * pnl / openingBalance).toFixed(2) : 0,
            trades: weekTrades.length,
            wins,
            losses,
            winRate: weekTrades.length ? +(100 * wins / weekTrades.length).toFixed(2) : 0,
            profitFactor: grossLoss < 0 ? +(grossProfit / Math.abs(grossLoss)).toFixed(3) : grossProfit > 0 ? 10 : 0,
            totalR: +weekTrades.reduce((sum, trade) => sum + trade.r, 0).toFixed(3),
            activeDays,
            positiveDays,
            positiveDayPct: activeDays ? +(100 * positiveDays / activeDays).toFixed(2) : 0,
            maxDrawdownEur: +maxDrawdownEur.toFixed(2),
            maxDrawdownPct: +maxDrawdownPct.toFixed(2),
            sessions,
        });
    }
    return { startCapital, riskPct, finalBalance: +balance.toFixed(2), weeks };
}

function portfolioAdmission(nominal, stress) {
    const gates = {
        activity: nominal.tradesPerDay >= 2 && nominal.tradesPerDay <= 4,
        nominalProfit: nominal.totalR > 0 && Object.values(nominal.folds).every((fold) => fold.totalR > 0),
        stressProfit: stress.totalR > 0 && Object.values(stress.folds).every((fold) => fold.totalR > 0),
        winRate: nominal.winRate > 50 && stress.winRate > 50,
        profitFactor: nominal.profitFactor >= 1.1 && stress.profitFactor >= 1.05,
        positiveDays: nominal.positiveActiveDayPct > 50 && stress.positiveActiveDayPct > 50,
        drawdown: nominal.maxDrawdownR <= 12 && stress.maxDrawdownR <= 15,
        sessions: Object.values(nominal.sessionEntries).every((entries) => entries >= 8),
    };
    return { passed: Object.values(gates).every(Boolean), gates };
}

function portfolioScore(nominal, stress) {
    const foldFloor = Math.min(...Object.values(stress.folds).map((fold) => fold.totalR));
    const activityPenalty = 10 * Math.abs(nominal.tradesPerDay - 3.25);
    return +(2 * stress.totalR + nominal.totalR + 3 * foldFloor + 0.3 * (stress.positiveActiveDayPct - 50) - stress.maxDrawdownR - activityPenalty).toFixed(6);
}

export function runSessionProfileSearch(datasetDir, options = {}) {
    const requestedSeconds = Number(options.seconds ?? 1800);
    if (!(requestedSeconds > 0)) throw new Error("--seconds must be positive.");
    const seed = Number(options.seed ?? 20260826);
    const random = seededRandom(seed);
    const available = discoverSymbols(datasetDir).filter((symbol) => symbol !== "AUDNZD");
    const symbols = (options.symbols ?? available).filter((symbol) => available.includes(symbol) && symbol !== "AUDNZD");
    const prepareStarted = performance.now();
    const prepared = prepareSessionProfileSearch(datasetDir, symbols, { from: options.from, to: options.to });
    const preparationSeconds = (performance.now() - prepareStarted) / 1000;
    const evaluatorSource = fs.readFileSync(path.join(HERE, "prepare.js"));
    const legacySeeds = loadLegacySeeds().filter((candidate) => symbols.includes(candidate.symbol));
    const seedsByKey = new Map();
    for (const candidate of legacySeeds) seedsByKey.set(`${candidate.symbol}:${candidate.session}`, [...(seedsByKey.get(`${candidate.symbol}:${candidate.session}`) ?? []), candidate]);
    const keys = symbols.flatMap((symbol) => PROFILE_SEARCH_SESSIONS.map((session) => `${symbol}:${session}`));
    const admitted = new Map();
    const fallbacks = new Map();
    const seen = new Set();
    const started = performance.now();
    const deadline = started + requestedSeconds * 1000;
    let iterations = 0;
    let duplicateCandidates = 0;
    let admittedEvaluations = 0;
    let lastProgress = started;
    while (performance.now() < deadline) {
        const scheduledKey = keys[iterations % keys.length];
        const [symbol, session] = scheduledKey.split(":");
        const seedCandidates = seedsByKey.get(scheduledKey) ?? [];
        let candidate;
        let source;
        if (iterations < legacySeeds.length && legacySeeds[iterations]) {
            candidate = legacySeeds[iterations];
            source = "legacy-hypothesis-seed";
        } else if (seedCandidates.length && random() < 0.45) {
            candidate = mutateCandidate(random, pick(random, seedCandidates));
            source = "legacy-seed-mutation";
        } else {
            candidate = randomSearchCandidate(random, symbol, session);
            source = "random-search";
        }
        const fingerprint = sha256(JSON.stringify(candidate));
        const candidateKey = `${candidate.symbol}:${candidate.session}`;
        iterations += 1;
        if (seen.has(fingerprint)) { duplicateCandidates += 1; continue; }
        seen.add(fingerprint);
        const nominalRun = evaluateSessionProfile(prepared, candidate, { spreadMultiplier: 1 });
        const stressRun = evaluateSessionProfile(prepared, candidate, { spreadMultiplier: 1.25 });
        const admission = profileAdmission(nominalRun.summary, stressRun.summary);
        const item = { candidate, nominal: nominalRun.summary, stress: stressRun.summary, admission, score: profileScore(nominalRun.summary, stressRun.summary), source };
        insertRanked(fallbacks, candidateKey, item, 3);
        if (admission.passed) {
            admittedEvaluations += 1;
            insertRanked(admitted, candidateKey, item, 8);
            const seeds = seedsByKey.get(candidateKey) ?? [];
            seeds.push(candidate);
            seedsByKey.set(candidateKey, seeds.slice(-12));
        }
        const now = performance.now();
        if (now - lastProgress >= 30_000) {
            const elapsed = (now - started) / 1000;
            console.log(`session-search progress: ${elapsed.toFixed(0)}s / ${requestedSeconds}s, iterations=${iterations}, admitted=${admittedEvaluations}, coveredKeys=${admitted.size}/${keys.length}`);
            lastProgress = now;
        }
    }

    const sessionPools = {};
    const fallbackLeaders = {};
    for (const session of PROFILE_SEARCH_SESSIONS) {
        const leaders = symbols.flatMap((symbol) => admitted.get(`${symbol}:${session}`)?.slice(0, 1) ?? []).sort((left, right) => right.score - left.score).slice(0, 5);
        sessionPools[session] = leaders.map(compactProfileResult);
        fallbackLeaders[session] = symbols.flatMap((symbol) => fallbacks.get(`${symbol}:${session}`)?.slice(0, 1) ?? []).sort((left, right) => right.score - left.score).slice(0, 5).map(compactProfileResult);
    }
    const finalists = Object.values(sessionPools).flat();
    const profileRuns = finalists.map((item, index) => ({
        candidate: item.candidate,
        priority: finalists.length - index,
        nominal: evaluateSessionProfile(prepared, item.candidate, { spreadMultiplier: 1 }),
        stress: evaluateSessionProfile(prepared, item.candidate, { spreadMultiplier: 1.25 }),
    }));
    let portfolio = null;
    if (profileRuns.length) {
        const nominal = portfolioFromTrades(prepared, profileRuns, "nominal");
        const stress = portfolioFromTrades(prepared, profileRuns, "stress");
        const admission = portfolioAdmission(nominal.summary, stress.summary);
        portfolio = {
            profiles: profileRuns.map((run) => run.candidate),
            score: portfolioScore(nominal.summary, stress.summary),
            admission,
            nominal: nominal.summary,
            stress: stress.summary,
        };
    }
    const actualSeconds = (performance.now() - started) / 1000;
    return {
        protocol: prepared.protocol,
        generatedAt: new Date().toISOString(),
        metadata: {
            evaluatorSha256: sha256(evaluatorSource),
            datasetFingerprint: prepared.datasetFingerprint,
            coverage: prepared.coverage,
            symbols: prepared.symbols,
            missingSymbols: prepared.missingSymbols,
            start: new Date(prepared.start).toISOString(),
            endExclusive: new Date(prepared.endExclusive).toISOString(),
            marketDays: prepared.marketDays,
            marketDaysByFold: prepared.marketDaysByFold,
            signalAudit: prepared.signalAudit,
            preparationSeconds,
        },
        search: { requestedSeconds, actualSeconds, seed, iterations, uniqueCandidates: seen.size, duplicateCandidates, admittedEvaluations, coveredPairSessions: admitted.size, totalPairSessions: keys.length, legacySeeds: legacySeeds.length },
        acceptance: {
            profile: "24+ trades, 5+ per temporal fold, positive all folds nominal/stress, >50% wins and profitable active days, PF>=1.10/1.05, DD<=8R/10R, 0.08-0.8 trades/day",
            portfolio: "2-4 trades/day, positive all folds nominal/stress, >50% wins and profitable active days, PF>=1.10/1.05, DD<=12R/15R, all four sessions represented",
            sessionCapacity: 5,
            dailyEntryCap: 4,
            sessionEntryCap: 2,
        },
        sessionPools,
        fallbackLeaders,
        portfolio,
        limitations: [
            "All available history is already-inspected development evidence; no result is fresh forward confirmation.",
            "Only M15 and the last fully closed H1 candle are loaded. Pending fills, exits, breakeven and trailing are conservatively resolved on M15.",
            "Spread x1.25 is tested, but gaps, financing, broker minimum size/distance and order rejection are unavailable.",
            "A five-pair session pool is a ceiling. Profiles that fail the frozen admission gates are shown only as fallbacks and are not admitted.",
            "The portfolio replay caps entries and overlapping positions, but R-based 1% compounding is an approximation until a candidate is frozen for a full margin-aware replay.",
        ],
    };
}

export function replayFrozenSessionSearch(datasetDir, sourceReportPath, options = {}) {
    const absoluteSource = path.resolve(sourceReportPath);
    const sourceText = fs.readFileSync(absoluteSource, "utf8");
    const source = JSON.parse(sourceText);
    const sessionPoolProfiles = PROFILE_SEARCH_SESSIONS.flatMap((session) => source.sessionPools?.[session] ?? []);
    const frozen = sessionPoolProfiles.length ? sessionPoolProfiles : (source.profiles ?? []).filter((item) => item?.candidate);
    if (!frozen.length) throw new Error("The source report contains no admitted session profiles.");
    const candidates = frozen.map((item) => item.candidate);
    const symbols = [...new Set(candidates.map((candidate) => candidate.symbol))];
    const started = performance.now();
    const prepared = prepareSessionProfileSearch(datasetDir, symbols, { from: options.from ?? source.metadata?.start, to: options.to ?? source.metadata?.endExclusive });
    const profileRuns = frozen.map((item, index) => ({
        candidate: item.candidate,
        priority: frozen.length - index,
        nominal: evaluateSessionProfile(prepared, item.candidate, { spreadMultiplier: 1 }),
        stress: evaluateSessionProfile(prepared, item.candidate, { spreadMultiplier: 1.25 }),
    }));
    const nominal = portfolioFromTrades(prepared, profileRuns, "nominal");
    const stress = portfolioFromTrades(prepared, profileRuns, "stress");
    const admission = portfolioAdmission(nominal.summary, stress.summary);
    const leaveOneOut = profileRuns.map((removed) => {
        const remaining = profileRuns.filter((run) => run !== removed);
        const nominalWithout = portfolioFromTrades(prepared, remaining, "nominal").summary;
        const stressWithout = portfolioFromTrades(prepared, remaining, "stress").summary;
        return {
            removed: `${removed.candidate.symbol}:${removed.candidate.session}`,
            nominalDeltaR: +(nominal.summary.totalR - nominalWithout.totalR).toFixed(3),
            stressDeltaR: +(stress.summary.totalR - stressWithout.totalR).toFixed(3),
            withoutNominal: nominalWithout,
            withoutStress: stressWithout,
        };
    }).sort((left, right) => right.stressDeltaR - left.stressDeltaR);
    return {
        protocol: { ...prepared.protocol, name: "frozen-session-profiles-causal-post-search-replay", selection: "profiles frozen from source report; same-timestamp priority fixed before outcome" },
        generatedAt: new Date().toISOString(),
        source: { path: sourceReportPath, sha256: sha256(sourceText), search: source.search, evaluatorSha256: source.metadata?.evaluatorSha256, datasetFingerprint: source.metadata?.datasetFingerprint },
        metadata: { evaluatorSha256: sha256(fs.readFileSync(path.join(HERE, "prepare.js"))), orchestratorSha256: sha256(fs.readFileSync(path.join(HERE, "train.js"))), datasetFingerprint: prepared.datasetFingerprint, symbols: prepared.symbols, start: new Date(prepared.start).toISOString(), endExclusive: new Date(prepared.endExclusive).toISOString(), marketDays: prepared.marketDays, elapsedSeconds: (performance.now() - started) / 1000 },
        profiles: frozen.map((item, index) => ({ priority: frozen.length - index, candidate: item.candidate, searchScore: item.score, searchNominal: item.nominal, searchStress: item.stress })),
        portfolio: { score: portfolioScore(nominal.summary, stress.summary), admission, nominal: nominal.summary, stress: stress.summary },
        weekly: {
            nominal: weeklyPortfolioStats(prepared, nominal.trades),
            stress: weeklyPortfolioStats(prepared, stress.trades),
        },
        leaveOneOut,
        limitations: [
            "This is a causal correction of the frozen development selection, not a fresh holdout and not a new parameter search.",
            "Static profile priority resolves simultaneous signals without using their future outcome.",
            "Only M15/H1 and R-based 1% compounding are used; broker margin, minimum distance/size, gaps, financing and rejections still require a separate frozen replay.",
        ],
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

function printSessionSearchSummary(output) {
    console.log("--- M15/H1 pair-by-session autoresearch ---");
    console.log(`period:                 ${output.metadata.start} .. ${output.metadata.endExclusive}`);
    console.log(`symbols:                ${output.metadata.symbols.join(",")}`);
    console.log(`search sec/iterations:  ${output.search.actualSeconds.toFixed(1)} / ${output.search.iterations}`);
    console.log(`admitted pair-sessions: ${output.search.coveredPairSessions} / ${output.search.totalPairSessions}`);
    for (const session of PROFILE_SEARCH_SESSIONS) console.log(`${session.padEnd(23)}${output.sessionPools[session].map((item) => item.candidate.symbol).join(",") || "none"}`);
    if (!output.portfolio) {
        console.log("portfolio:              unavailable (no admitted profiles)");
        return;
    }
    console.log(`portfolio qualified:    ${output.portfolio.admission.passed}`);
    console.log(`portfolio nominal:      ${output.portfolio.nominal.returnPct.toFixed(2)}%, PF ${output.portfolio.nominal.profitFactor.toFixed(3)}, win ${output.portfolio.nominal.winRate.toFixed(2)}%, ${output.portfolio.nominal.tradesPerDay.toFixed(2)} trades/day`);
    console.log(`portfolio stress x1.25: ${output.portfolio.stress.returnPct.toFixed(2)}%, PF ${output.portfolio.stress.profitFactor.toFixed(3)}, win ${output.portfolio.stress.winRate.toFixed(2)}%`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) return printHelp();
    const datasetValue = options.dataset ?? process.env.AUTORESEARCH_DATASET_DIR;
    if (!datasetValue) throw new Error("Pass --dataset or set AUTORESEARCH_DATASET_DIR.");
    const datasetDir = path.resolve(datasetValue);
    if (options.replaySessionReport) {
        const output = replayFrozenSessionSearch(datasetDir, options.replaySessionReport, options);
        if (options.report) {
            const reportPath = path.resolve(options.report);
            fs.mkdirSync(path.dirname(reportPath), { recursive: true });
            fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
            console.log(`report: ${reportPath}`);
        }
        console.log(`causal portfolio qualified: ${output.portfolio.admission.passed}`);
        console.log(`nominal: ${output.portfolio.nominal.returnPct.toFixed(2)}%, PF ${output.portfolio.nominal.profitFactor.toFixed(3)}, win ${output.portfolio.nominal.winRate.toFixed(2)}%, ${output.portfolio.nominal.tradesPerDay.toFixed(2)} trades/day`);
        console.log(`stress x1.25: ${output.portfolio.stress.returnPct.toFixed(2)}%, PF ${output.portfolio.stress.profitFactor.toFixed(3)}, win ${output.portfolio.stress.winRate.toFixed(2)}%`);
        if (options.json) console.log(JSON.stringify(output, null, 2));
        return;
    }
    if (options.sessionSearch) {
        const output = runSessionProfileSearch(datasetDir, options);
        if (options.report) {
            const reportPath = path.resolve(options.report);
            fs.mkdirSync(path.dirname(reportPath), { recursive: true });
            fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
            console.log(`report: ${reportPath}`);
        }
        if (options.json) console.log(JSON.stringify(output, null, 2));
        else printSessionSearchSummary(output);
        return;
    }
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
