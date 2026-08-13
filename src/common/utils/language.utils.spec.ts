import { parsePrimaryLanguage } from './language.utils';

describe('parsePrimaryLanguage', () => {
    it('returns undefined when the header is missing', () => {
        expect(parsePrimaryLanguage(undefined)).toBeUndefined();
        expect(parsePrimaryLanguage('')).toBeUndefined();
    });

    it('picks the highest-quality language', () => {
        expect(parsePrimaryLanguage('en-US,en;q=0.9,es;q=0.8')).toBe('en');
        expect(parsePrimaryLanguage('fr;q=0.5,es;q=0.9,en;q=0.7')).toBe('es');
    });

    it('reduces region subtags to the primary language code', () => {
        expect(parsePrimaryLanguage('pt-BR')).toBe('pt');
        expect(parsePrimaryLanguage('zh-Hans-CN')).toBe('zh');
    });

    it('ignores a bare wildcard', () => {
        expect(parsePrimaryLanguage('*')).toBeUndefined();
    });

    it('handles an array of header values', () => {
        expect(parsePrimaryLanguage(['fr;q=0.9', 'en;q=0.8'])).toBe('fr');
    });

    it('defaults missing quality values to 1', () => {
        expect(parsePrimaryLanguage('de,en;q=0.9')).toBe('de');
    });
});
