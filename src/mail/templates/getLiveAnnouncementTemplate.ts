export const getLiveAnnouncementTemplate = (name: string): string => {
    const safe = (value?: string) =>
        (value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    const firstName = safe(name ? name.split(' ')[0] : 'Scholar') || 'Scholar';

    return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Izabi is Live</title>
  </head>
  <body style="margin:0; padding:0; background-color:#0b0f14;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0b0f14; padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px; background:#0f1620; border-radius:18px; overflow:hidden; border:1px solid #1c2733;">
            <tr>
              <td style="padding:28px 32px; background:linear-gradient(135deg,#0f2033,#0b141f); border-bottom:1px solid #1c2733;">
                <div style="font-family:Arial,Helvetica,sans-serif; color:#9fb3c8; font-size:12px; letter-spacing:2px; text-transform:uppercase; font-weight:700;">
                  Izabi Launch
                </div>
                <h1 style="margin:10px 0 6px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; font-size:28px; line-height:1.2;">
                  Izabi is live and fully operational
                </h1>
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; color:#9fb3c8; font-size:15px; line-height:1.6;">
                  Your learning command center is ready.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 16px; font-family:Arial,Helvetica,sans-serif; color:#e6edf5; font-size:16px; line-height:1.7;">
                  Hello ${firstName},
                </p>
                <p style="margin:0 0 18px; font-family:Arial,Helvetica,sans-serif; color:#c6d4e1; font-size:16px; line-height:1.7;">
                  We're excited to let you know that Izabi is now live and fully operational.
                </p>
                <p style="margin:0 0 24px; font-family:Arial,Helvetica,sans-serif; color:#c6d4e1; font-size:16px; line-height:1.7;">
                  You can now access the platform at:
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                  <tr>
                    <td style="background:#101b26; border:1px solid #1c2733; border-radius:12px; padding:14px 16px;">
                      <a href="https://izabi.halixe.com/" style="font-family:Arial,Helvetica,sans-serif; color:#67b7ff; font-size:16px; text-decoration:none;">
                        https://izabi.halixe.com/
                      </a>
                    </td>
                  </tr>
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#2f80ed; border-radius:12px;">
                      <a href="https://izabi.halixe.com/" style="display:inline-block; padding:14px 22px; font-family:Arial,Helvetica,sans-serif; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none; letter-spacing:0.3px;">
                        Launch Izabi
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:26px 0 0; font-family:Arial,Helvetica,sans-serif; color:#9fb3c8; font-size:13px; line-height:1.6;">
                  If the button doesn't work, copy and paste the link above into your browser.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px; background:#0c141d; border-top:1px solid #1c2733;">
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; color:#e6edf5; font-size:15px; line-height:1.6;">
                  Victor Oladimeji
                </p>
                <p style="margin:4px 0 0; font-family:Arial,Helvetica,sans-serif; color:#9fb3c8; font-size:12px; line-height:1.6;">
                  Founder, Izabi
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:16px 0 0; font-family:Arial,Helvetica,sans-serif; color:#6e7f92; font-size:11px;">
            You received this email because you signed up for Izabi.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};

const formatAuditDate = (date?: Date | string) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
};

const sanitize = (value?: string) =>
    (value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const severityColor = (severity?: string) => {
    switch (severity) {
        case 'CRITICAL':
            return '#dc2626';
        case 'HIGH':
            return '#ea580c';
        case 'MEDIUM':
            return '#2563eb';
        default:
            return '#64748b';
    }
};

const outcomeColor = (outcome?: string) => {
    return outcome === 'SUCCESS' ? '#16a34a' : '#dc2626';
};

const auditBaseStyles = `
    body { margin: 0; padding: 0; background: #0b1220; color: #e2e8f0; font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .wrapper { width: 100%; background: #0b1220; padding: 32px 16px; }
    .container { max-width: 720px; margin: 0 auto; background: #0f172a; border: 1px solid #1f2937; border-radius: 20px; overflow: hidden; }
    .header { padding: 28px 32px; background: linear-gradient(135deg, rgba(15,23,42,0.95), rgba(2,6,23,0.95)); border-bottom: 1px solid #1f2937; }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #e2e8f0; }
    .brand span { color: #38bdf8; }
    .title { font-size: 22px; font-weight: 700; margin: 8px 0 0; color: #f8fafc; }
    .subtle { color: #94a3b8; font-size: 13px; }
    .section { padding: 24px 32px; border-bottom: 1px solid #1f2937; }
    .label { text-transform: uppercase; letter-spacing: 2px; font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 10px; }
    .card { background: #111c2e; border: 1px solid #1f2937; border-radius: 14px; padding: 16px; }
    .stat-row { display: table; width: 100%; }
    .stat { display: table-cell; padding: 12px 0; }
    .stat-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 6px; }
    .stat-value { font-size: 14px; font-weight: 700; color: #f8fafc; }
    .pill { display: inline-block; padding: 6px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .table { width: 100%; border-collapse: collapse; }
    .table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; padding: 10px 0; border-bottom: 1px solid #1f2937; }
    .table td { font-size: 13px; color: #e2e8f0; padding: 10px 0; border-bottom: 1px solid #1f2937; vertical-align: top; }
    .muted { color: #94a3b8; font-size: 12px; }
    .footer { padding: 20px 32px; background: #0b1220; color: #64748b; font-size: 12px; text-align: center; }

    @media only screen and (max-width: 640px) {
      .wrapper { padding: 12px 8px !important; }
      .container { border-radius: 14px !important; }
      .header, .section, .footer { padding: 18px 16px !important; }
      .title { font-size: 20px !important; line-height: 1.3 !important; }
      .subtle { font-size: 12px !important; }
      .stat-row { display: block !important; }
      .stat { display: block !important; padding: 10px 0 !important; border-bottom: 1px solid #1f2937; }
      .stat:last-child { border-bottom: 0 !important; }
      .table { display: block !important; }
      .table thead { display: none !important; }
      .table tbody, .table tr, .table td { display: block !important; width: 100% !important; }
      .table tr { padding: 8px 0 !important; border-bottom: 1px solid #1f2937; }
      .table td { padding: 6px 0 !important; border-bottom: 0 !important; }
      .table td[data-label]:before {
        content: attr(data-label);
        display: block;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #94a3b8;
        margin-bottom: 3px;
      }
    }
`;
