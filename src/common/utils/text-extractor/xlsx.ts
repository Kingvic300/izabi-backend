const loadXlsx = async (): Promise<any> => {
    return await import('xlsx');
};

export const extractTextFromXlsx = async (buffer: Buffer): Promise<string> => {
    const xlsx = await loadXlsx();
    const workbook = xlsx.read(buffer, {
        type: 'buffer',
        cellDates: true,
        raw: false,
    });

    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
        if (csv.trim().length > 0) {
            parts.push(`Sheet: ${sheetName}\\n${csv.trim()}`);
        }
    }

    return parts.join('\\n\\n');
};
