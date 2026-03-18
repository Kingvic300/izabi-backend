const startsWithBytes = (buffer: Buffer, bytes: number[]): boolean => {
    if (buffer.length < bytes.length) return false;
    for (let i = 0; i < bytes.length; i += 1) {
        if (buffer[i] !== bytes[i]) return false;
    }
    return true;
};

const looksLikeText = (buffer: Buffer): boolean => {
    const sample = buffer.subarray(0, 4096);
    if (sample.length === 0) return false;

    let printable = 0;
    for (const byte of sample) {
        if (byte === 0) return false;
        if (
            byte === 9 ||
            byte === 10 ||
            byte === 13 ||
            (byte >= 32 && byte <= 126)
        ) {
            printable += 1;
        }
    }

    return printable / sample.length > 0.85;
};

const looksLikeHtml = (buffer: Buffer): boolean => {
    const preview = buffer.subarray(0, 4096).toString('utf-8');
    return /<!doctype\\s+html|<html|<head|<body|<div|<p|<table|<title/i.test(
        preview,
    );
};

export type FileKind =
    | 'pdf'
    | 'docx'
    | 'xlsx'
    | 'png'
    | 'jpeg'
    | 'gif'
    | 'html'
    | 'json'
    | 'csv'
    | 'markdown'
    | 'text'
    | 'unknown';

export const detectFileKind = (file: Express.Multer.File): FileKind => {
    const mime = (file.mimetype || '').toLowerCase();
    const fileName = (file.originalname || '').toLowerCase();
    const buffer = file.buffer;

    if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
    if (
        startsWithBytes(buffer, [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ])
    ) {
        return 'png';
    }
    if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
    if (
        startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    ) {
        return 'gif';
    }

    if (
        mime === 'image/jpeg' ||
        mime === 'image/jpg' ||
        mime === 'image/pjpeg'
    ) {
        return 'jpeg';
    }
    if (mime === 'image/png') {
        return 'png';
    }

    const isZip =
        startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
        startsWithBytes(buffer, [0x50, 0x4b, 0x07, 0x08]);
    if (isZip) {
        if (fileName.endsWith('.docx')) return 'docx';
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return 'xlsx';
    }

    if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'jpeg';
    if (fileName.endsWith('.png')) return 'png';

    if (
        mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
        return 'docx';
    }
    if (
        mime ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
        return 'xlsx';
    }
    if (mime === 'application/vnd.ms-excel' || fileName.endsWith('.xls')) {
        return 'xlsx';
    }
    if (
        mime === 'text/html' ||
        fileName.endsWith('.html') ||
        fileName.endsWith('.htm') ||
        looksLikeHtml(buffer)
    ) {
        return 'html';
    }
    if (
        fileName.endsWith('.txt') ||
        fileName.endsWith('.text') ||
        fileName.endsWith('.log')
    ) {
        return 'text';
    }
    if (mime === 'application/json' || fileName.endsWith('.json')) return 'json';
    if (mime === 'text/csv' || fileName.endsWith('.csv')) return 'csv';
    if (
        mime === 'text/markdown' ||
        fileName.endsWith('.md') ||
        fileName.endsWith('.markdown')
    ) {
        return 'markdown';
    }
    if (mime.startsWith('text/') || looksLikeText(buffer)) return 'text';

    return 'unknown';
};

export const detectFileType = (
    file: Express.Multer.File,
): 'pdf' | 'text' | 'docx' | 'image' | 'unknown' => {
    const kind = detectFileKind(file);
    if (kind === 'pdf' || kind === 'docx') return kind;
    if (kind === 'png' || kind === 'jpeg' || kind === 'gif') return 'image';
    if (
        kind === 'text' ||
        kind === 'html' ||
        kind === 'json' ||
        kind === 'csv' ||
        kind === 'markdown'
    ) {
        return 'text';
    }
    return 'unknown';
};
