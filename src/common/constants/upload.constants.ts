const parseEnvNumber = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Default to safer limits; override via env if needed.
export const MAX_UPLOAD_SIZE_MB = parseEnvNumber(
    process.env.MAX_UPLOAD_SIZE_MB,
    25,
);
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export const MAX_JSON_BODY_MB = parseEnvNumber(
    process.env.MAX_JSON_BODY_MB,
    2,
);
export const MAX_JSON_BODY_BYTES = MAX_JSON_BODY_MB * 1024 * 1024;
