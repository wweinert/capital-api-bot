import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "backtest", "logs");
const DECISION_LOG_PATH = path.join(LOG_DIR, "strategy-decisions.jsonl");

function ensureDir() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function clean(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (typeof value !== "object") return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

export function logStrategyDecision(payload = {}) {
    ensureDir();
    const row = {
        timestamp: new Date().toISOString(),
        strategyMode: payload.strategyMode || null,
        profileId: payload.profileId || null,
        strategyFamily: payload.strategyFamily || null,
        symbol: payload.symbol || null,
        timeframe: payload.timeframe || null,
        entrySignalReason: payload.entrySignalReason || payload.reason || null,
        exitProfile: clean(payload.exitProfile),
        managementProfile: clean(payload.managementProfile),
        riskProfile: clean(payload.riskProfile),
        decision: payload.decision || null,
        blockedReason: payload.blockedReason || null,
        candidateContext: clean(payload.candidateContext || payload.context || null),
        bid: payload.bid ?? payload.currentBid ?? null,
        ask: payload.ask ?? payload.currentAsk ?? null,
        spreadPips: payload.spreadPips ?? payload.currentSpreadPips ?? null,
        normalizedCandidateId: payload.normalizedCandidateId || null,
    };
    fs.appendFileSync(DECISION_LOG_PATH, `${JSON.stringify(row)}\n`);
}

export { DECISION_LOG_PATH };
