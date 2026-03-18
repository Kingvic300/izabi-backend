import {
    auditBaseStyles,
    formatAuditDate,
    outcomeColor,
    sanitize,
    severityColor,
} from './audit-helpers';

export const getAuditAlertTemplate = (log: any): string => {
    const severity = sanitize(log?.severity || 'UNKNOWN');
    const outcome = sanitize(log?.outcome || 'UNKNOWN');
    const action = sanitize(log?.action || 'N/A');
    const route = sanitize(
        `${log?.request?.method || ''} ${log?.request?.route || ''}`.trim(),
    );
    const user = log?.user || {};
    const userName = sanitize(user.fullName || 'Unknown User');
    const userEmail = sanitize(user.email || 'unknown@izabi.ai');
    const userRole = sanitize(user.role || 'unknown');
    const userPlan = sanitize(user.plan || 'unknown');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Audit Alert</title>
  <style>${auditBaseStyles}</style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="brand">IZABI<span>.</span></div>
        <div class="title">Security Audit Alert</div>
        <div class="subtle">Immediate attention required • ${formatAuditDate(
            log?.createdAt || log?.timestamp,
        )}</div>
      </div>

      <div class="section">
        <div class="label">Event Summary</div>
        <div class="card">
          <div class="stat-row">
            <div class="stat">
              <div class="stat-title">Severity</div>
              <div class="stat-value">
                <span class="pill" style="background: ${severityColor(
                    severity,
                )}; color: #0b1220;">${severity}</span>
              </div>
            </div>
            <div class="stat">
              <div class="stat-title">Outcome</div>
              <div class="stat-value">
                <span class="pill" style="background: ${outcomeColor(
                    outcome,
                )}; color: #0b1220;">${outcome}</span>
              </div>
            </div>
            <div class="stat">
              <div class="stat-title">Action</div>
              <div class="stat-value">${action}</div>
            </div>
          </div>
          <div class="muted" style="margin-top: 10px;">
            Route: ${route || 'N/A'}
          </div>
        </div>
      </div>

      <div class="section">
        <div class="label">User Profile</div>
        <div class="card">
          <div class="stat-row">
            <div class="stat">
              <div class="stat-title">User</div>
              <div class="stat-value">${userName}</div>
              <div class="muted">${userEmail}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Role</div>
              <div class="stat-value">${userRole}</div>
              <div class="muted">Plan: ${userPlan}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Last Activity</div>
              <div class="stat-value">${formatAuditDate(
                  user.lastActivity,
              )}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="label">Request Context</div>
        <div class="card">
          <div class="muted">IP Address</div>
          <div class="stat-value">${sanitize(
              user.ipAddress || 'N/A',
          )}</div>
          <div class="muted" style="margin-top: 10px;">User Agent</div>
          <div class="stat-value">${sanitize(
              user.userAgent || 'N/A',
          )}</div>
        </div>
      </div>

      <div class="footer">
        This is an automated security notification from Izabi Audit.
      </div>
    </div>
  </div>
</body>
</html>
`;
};
