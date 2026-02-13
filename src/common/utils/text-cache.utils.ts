import * as crypto from 'crypto';

export function normalizeText(input: string): string {
    return (input || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function generateHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}
