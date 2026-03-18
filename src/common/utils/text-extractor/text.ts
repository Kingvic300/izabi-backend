import { ENABLE_HTML_PARSING } from './constants';

const decodeHtmlEntities = (value: string): string =>
    value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#(\d+);/g, (_, code) =>
            String.fromCharCode(Number(code)),
        );

const stripHtmlToText = (html: string): string => {
    const withoutNoise = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

    const withBreaks = withoutNoise.replace(
        /<\/(p|div|br|li|tr|td|th|h\d|section|article)>/gi,
        '\n',
    );

    const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
    return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
};

export const maybeParseHtml = (text: string): string =>
    ENABLE_HTML_PARSING ? stripHtmlToText(text) : text;

export const readTextFromStream = async (
    stream: NodeJS.ReadableStream & { destroy?: (error?: Error) => void },
    maxChars: number,
): Promise<string> => {
    let text = '';
    for await (const chunk of stream) {
        text += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        if (text.length >= maxChars) {
            if ('destroy' in stream && typeof stream.destroy === 'function') {
                stream.destroy();
            }
            break;
        }
    }
    return text.slice(0, maxChars);
};
