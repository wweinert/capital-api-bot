function safeError(error) {
    if (!error) return "";
    if (!(error instanceof Error)) return String(error);

    return error.response?.data?.errorCode ?? error.response?.data?.message ?? error.message;
}

const logger = {
    info: (message) => {
        const timestamp = new Date().toISOString();
        if (typeof message === "object") {
            console.log(`[INFO] ${timestamp} |\n${JSON.stringify(message, null, 2)}\n`);
        } else {
            console.log(`[INFO] ${timestamp} | ${message}`);
        }
    },

    error: (message, error) => {
        const timestamp = new Date().toISOString();
        if (typeof message === "object") {
            console.error(`[ERROR] ${timestamp} |\n${JSON.stringify(message, null, 2)}\n`, safeError(error));
        } else {
            console.error(`[ERROR] ${timestamp} | ${message}`, safeError(error));
        }
    },

    warn: (message, error) => {
        const timestamp = new Date().toISOString();
        if (typeof message === "object") {
            console.warn(`[WARN] ${timestamp} |\n${JSON.stringify(message, null, 2)}\n`, safeError(error));
        } else {
            console.warn(`[WARN] ${timestamp} | ${message}`, safeError(error));
        }
    },

    debug: (message) => {
        const timestamp = new Date().toISOString();
        if (typeof message === "object") {
            console.debug(`[DEBUG] ${timestamp} |\n${JSON.stringify(message, null, 2)}\n`);
        } else {
            console.debug(`[DEBUG] ${timestamp} | ${message}`);
        }
    },
};

export default logger;
