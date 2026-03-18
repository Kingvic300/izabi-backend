import {
    auditBaseStyles,
    formatAuditDate,
    outcomeColor,
    sanitize,
    severityColor,
} from './audit-helpers';

export const getAuditDigestTemplate = ({
    subject,
    description,
    totalEvents,
    grouped,
    events,
}: {
    subject: string;
    description: string;
    totalEvents: number;
    grouped: Record<string, number>;
    events: any[];
}): string => {
    const actionCounts =
        grouped && Object.keys(grouped).length > 0
            ? grouped
            : events.reduce(
                  (acc: Record<string, number>, event) => {
                      const key = event?.action || 'UNKNOWN';
                      acc[key] = (acc[key] || 0) + 1;
                      return acc;
                  },
                  {},
              );

    const severityCounts = events.reduce(
        (acc: Record<string, number>, event) => {
            const key = event?.severity || 'UNKNOWN';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        },
        {},
    );

    const outcomeCounts = events.reduce(
        (acc: Record<string, number>, event) => {
            const key = event?.outcome || 'UNKNOWN';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        },
        {},
    );

    const userCounts = events.reduce(
        (acc: Record<string, number>, event) => {
            const key =
                event?.user?.email || event?.user?.fullName || 'Unknown User';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        },
        {},
    );

    const successCount = outcomeCounts.SUCCESS || 0;
    const failureCount = outcomeCounts.FAILURE || 0;
    const successRate =
        totalEvents > 0 ? Math.round((successCount / totalEvents) * 100) : 0;
    const highImpactCount =
        (severityCounts.CRITICAL || 0) + (severityCounts.HIGH || 0);

    const sortedActions = (
        Object.entries(actionCounts) as Array<[string, number]>
    ).sort((a, b) => b[1] - a[1]);
    const sortedUsers = (
        Object.entries(userCounts) as Array<[string, number]>
    ).sort((a, b) => b[1] - a[1]);

    const actionRows = sortedActions
        .slice(0, 8)
        .map(
            ([action, count]) => `
            <tr>
              <td data-label="Action">${sanitize(action)}</td>
              <td data-label="Count" style="text-align: right;">${count}</td>
            </tr>
        `,
        )
        .join('');

    const userRows = sortedUsers
        .slice(0, 8)
        .map(
            ([user, count]) => `
            <tr>
              <td data-label="User">${sanitize(user)}</td>
              <td data-label="Count" style="text-align: right;">${count}</td>
            </tr>
        `,
        )
        .join('');

    const eventTimes = events
        .map((event) => new Date(event?.createdAt || event?.timestamp || 0))
        .filter((date) => !Number.isNaN(date.getTime()));
    const windowStart =
        eventTimes.length > 0
            ? new Date(Math.min(...eventTimes.map((d) => d.getTime())))
            : undefined;
    const windowEnd =
        eventTimes.length > 0
            ? new Date(Math.max(...eventTimes.map((d) => d.getTime())))
            : undefined;

    const windowLabel =
        windowStart && windowEnd
            ? `${formatAuditDate(windowStart)} → ${formatAuditDate(windowEnd)}`
            : 'N/A';

    const severityPills = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']
        .map((level) => {
            const count = severityCounts[level] || 0;
            if (count === 0) return '';
            return `<span class="pill" style="background: ${severityColor(
                level,
            )}; color: #0b1220; margin: 6px 6px 0 0;">${level} ${count}</span>`;
        })
        .join('');

    const outcomePills = ['SUCCESS', 'FAILURE', 'UNKNOWN']
        .map((level) => {
            const count = outcomeCounts[level] || 0;
            if (count === 0) return '';
            return `<span class="pill" style="background: ${outcomeColor(
                level,
            )}; color: #0b1220; margin: 6px 6px 0 0;">${level} ${count}</span>`;
        })
        .join('');

    const detailRows = events
        .map((event) => {
            const time = formatAuditDate(event?.createdAt || event?.timestamp);
            const user = sanitize(event?.user?.fullName || 'Unknown');
            const email = sanitize(event?.user?.email || 'unknown@izabi.ai');
            const action = sanitize(event?.action || 'N/A');
            const outcome = sanitize(event?.outcome || 'UNKNOWN');
            const severity = sanitize(event?.severity || 'UNKNOWN');
            const route = sanitize(
                `${event?.request?.method || ''} ${
                    event?.request?.route || ''
                }`.trim(),
            );
            const resourceId = sanitize(event?.request?.resourceId || '');
            const statusCode = sanitize(
                String(event?.metadata?.statusCode ?? 'N/A'),
            );
            const ipAddress = sanitize(event?.user?.ipAddress || 'N/A');
            const errorMessage = sanitize(
                event?.metadata?.error || event?.errorMessage || '',
            );
            return `
            <tr>
              <td data-label="Timestamp (UTC)">${time}</td>
              <td data-label="Severity"><span class="pill" style="background: ${severityColor(
                  severity,
              )}; color: #0b1220;">${severity}</span></td>
              <td data-label="User">${user}<div class="muted">${email}</div></td>
              <td data-label="Endpoint">${route || 'N/A'}${
                  resourceId ? `<div class="muted">${resourceId}</div>` : ''
              }</td>
              <td data-label="Outcome"><span class="pill" style="background: ${outcomeColor(
                  outcome,
              )}; color: #0b1220;">${outcome}</span></td>
              <td data-label="Status">${statusCode}</td>
              <td data-label="IP">${ipAddress}</td>
              <td data-label="What Happened">${errorMessage || action}</td>
            </tr>
        `;
        })
        .join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${sanitize(subject)}</title>
  <style>${auditBaseStyles}</style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="brand">IZABI<span>.</span></div>
        <div class="title">${sanitize(subject)}</div>
        <div class="subtle">${sanitize(description)}</div>
        <div class="subtle" style="margin-top: 6px;">UTC Window: ${windowLabel}</div>
      </div>

      <div class="section">
        <div class="label">Daily Snapshot</div>
        <div class="card">
          <div class="stat-row">
            <div class="stat">
              <div class="stat-title">Total Events</div>
              <div class="stat-value">${totalEvents}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Unique Users</div>
              <div class="stat-value">${Object.keys(userCounts).length}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Success Rate</div>
              <div class="stat-value">${successRate}%</div>
            </div>
            <div class="stat">
              <div class="stat-title">High Impact</div>
              <div class="stat-value">${highImpactCount}</div>
            </div>
          </div>
          <div style="margin-top: 12px;">${severityPills}</div>
          <div style="margin-top: 6px;">${outcomePills}</div>
        </div>
      </div>

      <div class="section">
        <div class="label">Top Actions</div>
        <table class="table">
          <thead>
            <tr>
              <th>Action</th>
              <th style="text-align: right;">Count</th>
            </tr>
          </thead>
          <tbody>
            ${actionRows}
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="label">Top Users</div>
        <table class="table">
          <thead>
            <tr>
              <th>User</th>
              <th style="text-align: right;">Count</th>
            </tr>
          </thead>
          <tbody>
            ${userRows}
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="label">Detailed Event Log</div>
        <table class="table">
          <thead>
            <tr>
              <th>Timestamp (UTC)</th>
              <th>Severity</th>
              <th>User</th>
              <th>Endpoint</th>
              <th>Outcome</th>
              <th>Status</th>
              <th>IP</th>
              <th>What Happened</th>
            </tr>
          </thead>
          <tbody>
            ${detailRows}
          </tbody>
        </table>
      </div>

      <div class="footer">
        Confidential report • Izabi Audit System
      </div>
    </div>
  </div>
</body>
</html>
`;
};
