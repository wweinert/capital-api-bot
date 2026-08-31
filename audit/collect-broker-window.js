#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, ...value] = arg.replace(/^--/, "").split("=");
        return [key, value.join("=")];
    }),
);

const host = args.host || "waldemar-pi";
const remoteCwd = args.remoteCwd || "/home/pi/dev/capital-api-bot";
const outputDir = path.resolve(args.output || "/private/tmp/capital-broker-audit");
const from = args.from || "2026-08-26T22:05:09Z";
const to = args.to || null;

const remoteProgram = String.raw`
import "dotenv/config";

const symbols = ["AUDUSD", "AUDJPY", "EURJPY", "GBPJPY", "USDCHF", "EURUSD", "GBPUSD", "GBPCHF", "USDJPY"];
const resolutions = ["MINUTE", "MINUTE_15", "HOUR"];
const resolutionNames = { MINUTE: "M1", MINUTE_15: "M15", HOUR: "H1" };
const baseUrl = String(process.env.BASE_URL || "") + String(process.env.API_PATH || "");
const apiKey = process.env.API_KEY;
const start = Date.parse(${JSON.stringify(from)});
const requestedTo = ${JSON.stringify(to)};
const auditTo = requestedTo ? Date.parse(requestedTo) : Math.floor(Date.now() / 60_000) * 60_000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const apiDate = (timestamp) => new Date(timestamp).toISOString().slice(0, 19);
let cst;
let securityToken;

if (![start, auditTo].every(Number.isFinite) || start >= auditTo) throw new Error("Invalid audit window");
if (!baseUrl || !apiKey || !process.env.API_IDENTIFIER || !process.env.API_PASSWORD) throw new Error("Missing broker environment");

async function login() {
    const response = await fetch(baseUrl + "/session", {
        method: "POST",
        headers: { "X-CAP-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
            identifier: process.env.API_IDENTIFIER,
            password: process.env.API_PASSWORD,
            encryptedPassword: false,
        }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error("Broker login failed: " + response.status + " " + JSON.stringify(body));
    cst = response.headers.get("cst");
    securityToken = response.headers.get("x-security-token");
    if (!cst || !securityToken) throw new Error("Broker session tokens missing");
    return body;
}

async function get(endpoint, attempt = 1) {
    await delay(1_050);
    const response = await fetch(baseUrl + endpoint, {
        headers: { CST: cst, "X-SECURITY-TOKEN": securityToken, "X-CAP-API-KEY": apiKey },
    });
    let body;
    try {
        body = await response.json();
    } catch {
        body = { error: "non_json_response" };
    }
    if ((response.status === 401 || response.status === 403) && attempt === 1) {
        await login();
        return get(endpoint, attempt + 1);
    }
    if (response.status === 429 && attempt <= 3) {
        await delay(2_000 * attempt);
        return get(endpoint, attempt + 1);
    }
    if (!response.ok) throw new Error(endpoint + " failed: " + response.status + " " + JSON.stringify(body));
    return body;
}

function emit(name, body) {
    process.stdout.write(JSON.stringify({ name, body }) + "\n");
}

async function getPrices(symbol, resolution) {
    if (resolution !== "MINUTE") {
        const query = new URLSearchParams({ resolution, max: "1000", to: apiDate(auditTo) });
        return get("/prices/" + symbol + "?" + query);
    }

    const byTimestamp = new Map();
    let combined = null;
    for (let cursor = start; cursor < auditTo;) {
        const end = Math.min(auditTo, cursor + 12 * 60 * 60 * 1000);
        const query = new URLSearchParams({ resolution, max: "1000", from: apiDate(cursor), to: apiDate(end) });
        const body = await get("/prices/" + symbol + "?" + query);
        combined = body;
        for (const row of body.prices || []) {
            const key = row.snapshotTimeUTC || row.snapshotTime;
            if (key) byTimestamp.set(key, row);
        }
        cursor = end;
    }
    return {
        ...(combined || {}),
        prices: [...byTimestamp.values()].sort((left, right) =>
            String(left.snapshotTimeUTC || left.snapshotTime).localeCompare(String(right.snapshotTimeUTC || right.snapshotTime)),
        ),
    };
}

const session = await login();
emit("meta", {
    from: new Date(start).toISOString(),
    toExclusive: new Date(auditTo).toISOString(),
    collectedAt: new Date().toISOString(),
    symbols,
    resolutions: resolutionNames,
    environment: baseUrl.includes("demo-api") ? "demo" : "live",
    accountType: session?.accountType ?? null,
});

for (const symbol of symbols) {
    for (const resolution of resolutions) {
        const body = await getPrices(symbol, resolution);
        emit(symbol + "_" + resolutionNames[resolution], body);
    }
}

for (const symbol of symbols) emit("market_" + symbol, await get("/markets/" + symbol));

const activities = [];
for (let cursor = start; cursor < auditTo;) {
    const nextMidnight = new Date(cursor);
    nextMidnight.setUTCHours(24, 0, 0, 0);
    const end = Math.min(auditTo, nextMidnight.getTime());
    const query = new URLSearchParams({ from: apiDate(cursor), to: apiDate(end), detailed: "true" });
    const body = await get("/history/activity?" + query);
    activities.push(...(body.activities || []));
    cursor = end;
}
emit("activity", { activities });

const transactionQuery = new URLSearchParams({ from: apiDate(start), to: apiDate(auditTo), type: "TRADE" });
emit("transactions", await get("/history/transactions?" + transactionQuery));
emit("accounts", await get("/accounts"));
emit("positions", await get("/positions"));
emit("workingorders", await get("/workingorders"));
`;

fs.mkdirSync(outputDir, { recursive: true });
const ssh = spawn("ssh", [host, `cd ${remoteCwd} && node --input-type=module`], {
    stdio: ["pipe", "pipe", "pipe"],
});

ssh.stdin.end(remoteProgram);
let stderr = "";
ssh.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
});

const files = [];
const reader = readline.createInterface({ input: ssh.stdout, crlfDelay: Infinity });
for await (const line of reader) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (!/^[A-Za-z0-9_-]+$/.test(message.name)) throw new Error(`Unsafe dataset name: ${message.name}`);
    const filename = `${message.name}.json`;
    const body = `${JSON.stringify(message.body, null, 2)}\n`;
    fs.writeFileSync(path.join(outputDir, filename), body);
    files.push({
        filename,
        bytes: Buffer.byteLength(body),
        sha256: crypto.createHash("sha256").update(body).digest("hex"),
    });
}

const exitCode = await new Promise((resolve) => ssh.on("close", resolve));
if (exitCode !== 0) throw new Error(`Remote collector failed (${exitCode}): ${stderr.trim()}`);
if (!files.some(({ filename }) => filename === "meta.json")) throw new Error("Collector returned no metadata");

const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: host,
    files: files.sort((left, right) => left.filename.localeCompare(right.filename)),
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outputDir, files: files.length }, null, 2));
