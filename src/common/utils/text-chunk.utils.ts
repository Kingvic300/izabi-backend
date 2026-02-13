export function getChunkSize(textLength: number): number {
    if (textLength < 50_000) return 18_000;
    if (textLength < 300_000) return 16_000;
    return 14_000; // textbooks, PDFs, monsters
}

export function chunkTextBySize(text: string): string[] {
    const chunkSize = getChunkSize(text.length);
    const chunks: string[] = [];
    let currentIndex = 0;

    while (currentIndex < text.length) {
        let endIndex = Math.min(currentIndex + chunkSize, text.length);

        if (endIndex < text.length) {
            const lastPeriod = text.lastIndexOf('.', endIndex);
            const lastNewline = text.lastIndexOf('\n', endIndex);
            const breakPoint = Math.max(lastPeriod, lastNewline);

            if (breakPoint > currentIndex + chunkSize * 0.8) {
                endIndex = breakPoint + 1;
            }
        }

        chunks.push(text.slice(currentIndex, endIndex));
        currentIndex = endIndex;
    }
    return chunks;
}
