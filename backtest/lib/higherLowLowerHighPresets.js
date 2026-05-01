import fs from "fs";
import path from "path";

export const DEFAULT_PRESET_DIR = path.join(process.cwd(), "backtest", "configs", "pa-hllh");

export function resolvePresetPath(nameOrPath) {
    if (!nameOrPath) return null;
    if (path.isAbsolute(nameOrPath) || String(nameOrPath).includes("/")) return nameOrPath;
    return path.join(DEFAULT_PRESET_DIR, String(nameOrPath).endsWith(".json") ? String(nameOrPath) : `${nameOrPath}.json`);
}

export function loadPreset(nameOrPath, fallback = {}) {
    const filePath = resolvePresetPath(nameOrPath);
    if (!filePath || !fs.existsSync(filePath)) return { ...fallback };
    return {
        ...fallback,
        ...JSON.parse(fs.readFileSync(filePath, "utf8")),
    };
}
