export const mapWithConcurrency = async <T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (true) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                if (currentIndex >= items.length) break;
                results[currentIndex] = await mapper(
                    items[currentIndex],
                    currentIndex,
                );
            }
        },
    );

    await Promise.all(workers);
    return results;
};

/**
 * Smartly trims text to focus on main content by removing common book/paper noise.
 */
export const cleanTextContent = (text: string): string => {
    let cleaned = text;

    const startMarkers = [
        /chapter\\s+1/i,
        /introduction/i,
        /background/i,
        /executive\\s+summary/i,
    ];

    for (const marker of startMarkers) {
        const match = text.slice(0, 100000).match(marker);
        if (match?.index && match.index > 5000) {
            cleaned = text.slice(match.index);
            break;
        }
    }

    const endMarkers = [
        'references',
        'bibliography',
        'appendix',
        'index',
        'glossary',
    ];

    for (const marker of endMarkers) {
        const lastIndex = cleaned.toLowerCase().lastIndexOf(marker);
        if (lastIndex !== -1 && lastIndex > cleaned.length * 0.7) {
            cleaned = cleaned.slice(0, lastIndex);
        }
    }

    return cleaned;
};
