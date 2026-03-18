export const sanitize = (value: string): string =>
    (value || '')
        .toString()
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const formatAuditDate = (value: string | Date | number): string => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
};

export const severityColor = (severity: string): string => {
    const normalized = (severity || '').toLowerCase();
    if (normalized.includes('critical')) return 'rgba(248,113,113,0.18)';
    if (normalized.includes('high')) return 'rgba(251,146,60,0.18)';
    if (normalized.includes('medium')) return 'rgba(250,204,21,0.16)';
    if (normalized.includes('low')) return 'rgba(96,165,250,0.16)';
    return 'rgba(148,163,184,0.12)';
};

export const outcomeColor = (outcome: string): string => {
    const normalized = (outcome || '').toLowerCase();
    if (normalized.includes('success')) return 'rgba(16,185,129,0.18)';
    if (normalized.includes('blocked')) return 'rgba(248,113,113,0.18)';
    if (normalized.includes('failed')) return 'rgba(251,146,60,0.18)';
    return 'rgba(148,163,184,0.12)';
};

export const auditBaseStyles = `
    :root {
        color-scheme: dark;
    }
    body {
        margin: 0;
        padding: 0;
        background-color: #020617;
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif;
        color: #e2e8f0;
        -webkit-text-size-adjust: 100%;
    }
    .container {
        width: 100%;
        max-width: 720px;
        margin: 24px auto;
        background-color: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 20px;
        overflow: hidden;
    }
    .header {
        padding: 32px 36px;
        background: linear-gradient(135deg, #0f172a 0%, #111827 100%);
        border-bottom: 1px solid #1e293b;
    }
    .logo {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.2em;
        color: #e2e8f0;
    }
    .content {
        padding: 36px;
    }
    .title {
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 10px;
        color: #f8fafc;
    }
    .subtle {
        font-size: 14px;
        color: #94a3b8;
        line-height: 1.6;
    }
    .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        color: #e2e8f0;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
        margin-top: 20px;
    }
    .stat {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 14px;
        padding: 12px 14px;
    }
    .stat-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        color: #94a3b8;
    }
    .stat-value {
        font-size: 14px;
        font-weight: 700;
        margin-top: 6px;
        color: #f8fafc;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 16px;
        font-size: 12px;
    }
    th,
    td {
        padding: 10px 12px;
        text-align: left;
        border-bottom: 1px solid rgba(148, 163, 184, 0.12);
        color: #e2e8f0;
    }
    th {
        color: #94a3b8;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 10px;
    }
`;
