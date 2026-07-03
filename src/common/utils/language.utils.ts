/**
 * Parses a standard `Accept-Language` header (e.g. "en-US,en;q=0.9,es;q=0.8")
 * and returns the highest-priority primary language subtag (e.g. "en").
 *
 * Returns undefined if the header is missing/empty so callers can fall back
 * to a query param, the user's saved preference, or a hard default.
 */
export function parsePrimaryLanguage(
    acceptLanguageHeader?: string | string[],
): string | undefined {
    if (!acceptLanguageHeader) return undefined;

    const header = Array.isArray(acceptLanguageHeader)
        ? acceptLanguageHeader.join(',')
        : acceptLanguageHeader;

    const entries = header
        .split(',')
        .map((part) => {
            const [rawTag, ...params] = part.trim().split(';');
            const qParam = params
                .map((p) => p.trim())
                .find((p) => p.startsWith('q='));
            const quality = qParam ? parseFloat(qParam.slice(2)) : 1;
            return { tag: rawTag.trim(), quality: isNaN(quality) ? 1 : quality };
        })
        .filter((entry) => entry.tag && entry.tag !== '*')
        .sort((a, b) => b.quality - a.quality);

    if (entries.length === 0) return undefined;

    // Reduce "en-US" -> "en"; keep the tag as-is if it has no region subtag.
    const primaryTag = entries[0].tag.split('-')[0].toLowerCase();
    return primaryTag || undefined;
}
