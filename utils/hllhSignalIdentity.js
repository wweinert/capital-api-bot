function toIsoTimestamp(value) {
    if (value === undefined || value === null || value === "") return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    if (typeof value === "number") {
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }

    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
        const date = new Date(raw);
        return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }

    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function toUpper(value) {
    const raw = String(value || "").trim();
    return raw ? raw.toUpperCase() : null;
}

function toSide(value) {
    const upper = toUpper(value);
    if (upper === "BUY") return "LONG";
    if (upper === "SELL") return "SHORT";
    if (upper === "LONG" || upper === "SHORT") return upper;
    return null;
}

function toPivotWindow(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(1, Math.trunc(num)) : null;
}

export function parseLegacyHllhCandidateKey(key) {
    const raw = String(key || "").trim();
    if (!raw) return null;
    const parts = raw.split("|");
    if (parts.length < 8) return null;
    const [side, signalTimestamp, , setupMode, signalMode, entryMode, exitVariant, pivotPart] = parts;
    const pivotWindow = /^pivot(\d+)$/i.test(String(pivotPart || "").trim())
        ? Number(String(pivotPart || "").trim().replace(/^pivot/i, ""))
        : null;

    return {
        side: toSide(side),
        signalTimestamp: toIsoTimestamp(signalTimestamp),
        setupMode: String(setupMode || "").trim() || null,
        signalMode: String(signalMode || "").trim() || null,
        entryMode: String(entryMode || "").trim() || null,
        exitVariant: String(exitVariant || "").trim() || null,
        pivotWindow: toPivotWindow(pivotWindow),
    };
}

export function buildHllhConfigSignature(parts = {}) {
    const setupMode = String(parts.setupMode || "").trim() || null;
    const signalMode = String(parts.signalMode || "").trim() || null;
    const entryMode = String(parts.entryMode || "").trim() || null;
    const stopVariant = String(parts.stopVariant || "").trim() || null;
    const exitVariant = String(parts.exitVariant || "").trim() || null;
    const pivotWindow = toPivotWindow(parts.pivotWindow);

    if (!setupMode || !signalMode || !entryMode || !stopVariant || !exitVariant || !Number.isFinite(pivotWindow)) {
        return null;
    }

    return [setupMode, signalMode, entryMode, stopVariant, exitVariant, `pivot${pivotWindow}`].join("|");
}

export function buildHllhStableCandidateIdentity(parts = {}) {
    const symbol = toUpper(parts.symbol);
    const side = toSide(parts.side);
    const signalTimestamp = toIsoTimestamp(parts.signalTimestamp);
    const setupMode = String(parts.setupMode || "").trim() || null;
    const signalMode = String(parts.signalMode || "").trim() || null;
    const entryMode = String(parts.entryMode || "").trim() || null;
    const exitVariant = String(parts.exitVariant || "").trim() || null;
    const pivotWindow = toPivotWindow(parts.pivotWindow);

    if (!symbol || !side || !signalTimestamp || !setupMode || !signalMode || !entryMode || !exitVariant || !Number.isFinite(pivotWindow)) {
        return null;
    }

    return [symbol, side, signalTimestamp, setupMode, signalMode, entryMode, exitVariant, `pivot${pivotWindow}`].join("|");
}

function patternMetaFromRecord(record = {}) {
    if (record?.patternMeta && typeof record.patternMeta === "object") return record.patternMeta;
    if (record?.riskMeta?.patternMeta && typeof record.riskMeta.patternMeta === "object") return record.riskMeta.patternMeta;
    if (record?.orderPlan?.patternMeta && typeof record.orderPlan.patternMeta === "object") return record.orderPlan.patternMeta;
    if (record?.decision?.step5?.orderPlan?.patternMeta && typeof record.decision.step5.orderPlan.patternMeta === "object") {
        return record.decision.step5.orderPlan.patternMeta;
    }
    return {};
}

export function buildHllhStableIdentityFromRecord(record = {}, overrides = {}) {
    const patternMeta = patternMetaFromRecord(record);
    const parsedLegacy =
        parseLegacyHllhCandidateKey(overrides.candidateKey) ||
        parseLegacyHllhCandidateKey(patternMeta.candidateKey) ||
        parseLegacyHllhCandidateKey(patternMeta.tradeKey) ||
        parseLegacyHllhCandidateKey(record?.metadata?.candidateKey) ||
        parseLegacyHllhCandidateKey(record?.metadata?.tradeKey) ||
        parseLegacyHllhCandidateKey(record.candidateKey) ||
        parseLegacyHllhCandidateKey(record.tradeKey);

    const symbol = overrides.symbol || record.symbol || record.orderPlan?.symbol || record.snapshot?.symbol || null;
    const side =
        overrides.side ||
        record.side ||
        record.signal ||
        record.orderPlan?.side ||
        patternMeta.side ||
        parsedLegacy?.side ||
        null;
    const signalTimestamp =
        overrides.signalTimestamp ||
        record.signalTimestamp ||
        patternMeta.signalTimestamp ||
        patternMeta.signalCandle?.timestamp ||
        patternMeta.entryTimestamp ||
        record.entryTimestamp ||
        parsedLegacy?.signalTimestamp ||
        null;
    const setupMode = overrides.setupMode || patternMeta.setupMode || record.setupMode || parsedLegacy?.setupMode || null;
    const pivotWindow = overrides.pivotWindow || patternMeta.pivotWindow || record.pivotWindow || parsedLegacy?.pivotWindow || null;
    const signalMode = overrides.signalMode || patternMeta.signalMode || record.signalMode || parsedLegacy?.signalMode || null;
    const entryMode = overrides.entryMode || patternMeta.entryMode || record.entryMode || parsedLegacy?.entryMode || null;
    const stopVariant = overrides.stopVariant || patternMeta.stopVariant || record.stopVariant || null;
    const exitVariant = overrides.exitVariant || patternMeta.exitVariant || record.exitVariant || parsedLegacy?.exitVariant || null;

    return {
        normalizedCandidateId: buildHllhStableCandidateIdentity({
            symbol,
            side,
            signalTimestamp,
            setupMode,
            pivotWindow,
            signalMode,
            entryMode,
            exitVariant,
        }),
        normalizedTradeId: buildHllhStableCandidateIdentity({
            symbol,
            side,
            signalTimestamp,
            setupMode,
            pivotWindow,
            signalMode,
            entryMode,
            exitVariant,
        }),
        configSignature: buildHllhConfigSignature({
            setupMode,
            pivotWindow,
            signalMode,
            entryMode,
            stopVariant,
            exitVariant,
        }),
    };
}
