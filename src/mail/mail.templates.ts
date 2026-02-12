export const getOtpEmailTemplate = (otp: string): string => {
    const otpChars = otp.split('');
    const otpCells = otpChars
        .map(
            (digit, index) => `
        <td class="otp-digit">${digit}</td>
        ${index < otpChars.length - 1 ? '<td class="otp-gap"></td>' : ''}
      `,
        )
        .join('');

    return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify your email</title>

    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #020617;
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI',
          Roboto, sans-serif;
        color: #e5e7eb;
        -webkit-text-size-adjust: 100%;
      }

      .container {
        width: 100%;
        max-width: 600px;
        margin: 24px auto;
        background-color: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 20px;
        overflow: hidden;
      }

      .header {
        padding: 36px;
        text-align: center;
        background-color: #020617;
      }

      .logo {
        font-size: 26px;
        font-weight: 800;
        color: #ffffff;
      }

      .logo span {
        color: #60a5fa;
      }

      .content {
        padding: 40px;
        text-align: center;
      }

      .title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 12px;
        color: #ffffff;
      }

      .text {
        font-size: 15px;
        line-height: 1.6;
        color: #94a3b8;
        margin-bottom: 32px;
      }

      .meta {
        margin-top: 28px;
        font-size: 13px;
        color: #64748b;
      }

      .otp-table {
        width: auto;
        margin: 0 auto;
      }

      .otp-digit {
        width: 48px;
        height: 56px;
        background-color: #020617;
        border: 1px solid #334155;
        border-radius: 10px;
        text-align: center;
        font-size: 28px;
        font-weight: 700;
        color: #e5e7eb;
      }

      .otp-gap {
        width: 8px;
        min-width: 8px;
      }

      .footer {
        padding: 28px;
        background-color: #020617;
        text-align: center;
        font-size: 12px;
        color: #64748b;
      }

      @media only screen and (max-width: 620px) {
        .container {
          margin: 10px auto !important;
          border-radius: 14px !important;
        }

        .header {
          padding: 24px 20px !important;
        }

        .content {
          padding: 28px 18px !important;
        }

        .footer {
          padding: 20px 18px !important;
        }

        .title {
          font-size: 20px !important;
        }

        .text {
          font-size: 14px !important;
          margin-bottom: 24px !important;
        }

        .otp-digit {
          width: 40px !important;
          height: 48px !important;
          font-size: 24px !important;
        }

        .otp-gap {
          width: 6px !important;
          min-width: 6px !important;
        }
      }
    </style>
  </head>

  <body>
    <div class="container">
      <div class="header">
        <div class="logo">IZABI<span>.</span></div>
      </div>

      <div class="content">
        <h1 class="title">Verify your identity</h1>
        <p class="text">
          Use the code below to complete your sign in. This code expires in
          10 minutes.
        </p>

        <table
          align="center"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          class="otp-table"
        >
          <tr>
            ${otpCells}
          </tr>
        </table>

        <p class="meta">
          If you did not request this code, you can safely ignore this email.
        </p>
      </div>

      <div class="footer">
        © ${new Date().getFullYear()} Izabi AI. All rights reserved.
      </div>
    </div>
  </body>
</html>
`;
};

export const getWelcomeEmailTemplate = (name: string): string => {
    const firstName = name ? name.split(' ')[0] : 'Scholar';
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Izabi</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; -webkit-text-size-adjust: 100%; }
        .container { width: 100%; max-width: 600px; margin: 20px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; }
        .header { padding: 40px; text-align: center; }
        .logo { font-size: 24px; font-weight: 800; color: #fff; text-decoration: none; }
        .logo span { color: #3b82f6; }
        .hero { padding: 0 40px 40px 40px; text-align: center; }
        .h1 { font-size: 32px; font-weight: 800; margin-bottom: 16px; color: #ffffff; letter-spacing: -1px; }
        .hero-text { font-size: 16px; line-height: 1.6; color: #94a3b8; margin-bottom: 32px; }
        .cta-button { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 14px; font-weight: 600; font-size: 16px; box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3); }
        
        .section-title { font-size: 12px; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 24px; }
        .feature-section { padding: 0 40px; }
        .feature-item { display: block; margin-bottom: 20px; padding: 20px; background: #1e293b; border-radius: 16px; text-align: left; }
        .feature-item:last-child { margin-bottom: 0; }
        .feature-icon { font-size: 24px; float: left; margin-right: 16px; }
        .feature-content { overflow: hidden; }
        .feature-title { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 4px; display: block; }
        .feature-desc { font-size: 14px; color: #94a3b8; line-height: 1.4; display: block; }

        .streak-promo { margin: 0 40px 40px 40px; padding: 24px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #3b82f6; border-radius: 16px; text-align: center; }
        .streak-text { color: #3b82f6; font-weight: 700; font-size: 14px; }
        .promo-icon { float: none; display: block; margin: 0 auto 10px auto; }
        .footer-note { margin-top: 10px; }

        .footer { padding: 40px; background-color: #020617; text-align: center; font-size: 13px; color: #475569; border-top: 1px solid #1e293b; }

        @media only screen and (max-width: 620px) {
            .container { margin: 10px auto !important; border-radius: 14px !important; }
            .header, .footer { padding: 24px 18px !important; }
            .hero { padding: 0 18px 24px 18px !important; }
            .feature-section { padding: 0 18px !important; }
            .streak-promo { margin: 0 18px 24px 18px !important; padding: 18px !important; }
            .h1 { font-size: 26px !important; letter-spacing: -0.5px !important; }
            .hero-text { font-size: 15px !important; margin-bottom: 22px !important; }
            .cta-button { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 14px 16px !important; }
            .feature-item { padding: 16px !important; margin-bottom: 14px !important; }
            .feature-icon { font-size: 20px !important; margin-right: 12px !important; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">IZABI<span>.</span></div>
        </div>
        <div class="hero">
            <h1 class="h1">Welcome, ${firstName}!</h1>
            <p class="hero-text">You just unlocked a powerhouse of AI tools designed to help you dominate your exams. From JAMB to University finals, we've got you.</p>
            <a href="https://izabi.onrender.com" class="cta-button">Open My Dashboard</a>
        </div>

        <div class="feature-section">
            <div class="section-title">Your Learning Toolkit</div>
            
            <div class="feature-item">
                <span class="feature-icon">📚</span>
                <div class="feature-content">
                    <span class="feature-title">Smart Summaries</span>
                    <span class="feature-desc">Upload any PDF or image. Izabi extracts key concepts, formulas, and critical dates instantly.</span>
                </div>
            </div>

            <div class="feature-item">
                <span class="feature-icon">🎯</span>
                <div class="feature-content">
                    <span class="feature-title">Exam Simulations</span>
                    <span class="feature-desc">Practice with AI-generated mocks for JAMB, WAEC, and JUPEB tailored to your syllabus.</span>
                </div>
            </div>

            <div class="feature-item">
                <span class="feature-icon">🎙️</span>
                <div class="feature-content">
                    <span class="feature-title">Audio Lessons</span>
                    <span class="feature-desc">Listen to your study takeaways in English or clear Pidgin while you're on the move.</span>
                </div>
            </div>
        </div>

        <div class="streak-promo">
            <span class="feature-icon promo-icon">🦉</span>
            <span class="feature-title">Your Pet is waiting!</span>
            <p class="feature-desc">Meet your Izabi Owl. Level him up and keep him happy by maintaining your daily study streak.</p>
            <div class="streak-text footer-note">Current Streak: 1 Day 🔥</div>
        </div>

        <div class="footer">
            <p>You received this because you signed up for Izabi AI.</p>
            <p class="footer-note">&copy; ${new Date().getFullYear()} Izabi AI. Lagos, Nigeria.</p>
        </div>
    </div>
</body>
</html>
    `;
};

export const getStreakFreezeTemplate = (
    name: string,
    freezesLeft: number,
): string => {
    const firstName = name ? name.split(' ')[0] : 'Scholar';
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Streak Frozen!</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; -webkit-text-size-adjust: 100%; }
        .container { width: 100%; max-width: 600px; margin: 20px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; }
        .header { padding: 40px; text-align: center; background: linear-gradient(to bottom, #1e293b, #0f172a); }
        .logo { font-size: 24px; font-weight: 800; color: #fff; text-decoration: none; }
        .logo span { color: #3b82f6; }
        .content { padding: 40px; text-align: center; }
        .title { font-size: 28px; font-weight: 800; margin-bottom: 16px; color: #ffffff; letter-spacing: -1px; }
        .text { font-size: 16px; line-height: 1.6; color: #94a3b8; margin-bottom: 32px; }
        .text-small { font-size: 14px; }
        .freeze-icon { font-size: 64px; margin-bottom: 24px; display: block; animation: pulse 2s infinite; }
        .cta-button { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 14px; font-weight: 600; font-size: 16px; margin-bottom: 24px; }
        .stat-box { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; padding: 16px; margin-top: 24px; display: inline-block; }
        .footer { padding: 32px; background-color: #020617; text-align: center; font-size: 13px; color: #475569; }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }

        @media only screen and (max-width: 620px) {
            .container { margin: 10px auto !important; border-radius: 14px !important; }
            .header, .content, .footer { padding: 24px 18px !important; }
            .title { font-size: 24px !important; letter-spacing: -0.5px !important; }
            .text { font-size: 15px !important; margin-bottom: 24px !important; }
            .freeze-icon { font-size: 52px !important; margin-bottom: 16px !important; }
            .cta-button { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 14px 16px !important; margin-bottom: 18px !important; }
            .stat-box { display: block !important; width: 100% !important; box-sizing: border-box !important; margin-top: 16px !important; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">IZABI<span>.</span></div>
        </div>
        <div class="content">
            <span class="freeze-icon">❄️</span>
            <h1 class="title">Streak Frozen!</h1>
            <p class="text">Hey ${firstName}, you missed a day of studying, but don't worry! We used a <strong>Streak Freeze</strong> to save your progress.</p>
            
            <a href="https://izabi.onrender.com/dashboard" class="cta-button">Login to Keep Streak</a>
            
            <p class="text text-small">If you don't study today, you might lose your streak for real!</p>

            <div class="stat-box">
                <strong>Inventory:</strong> ${freezesLeft} Freezes Left
            </div>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Izabi AI. Master your curriculum.</p>
        </div>
    </div>
</body>
</html>
    `;
};

export const getLiveAnnouncementTemplate = (name: string): string => {
    const firstName = name ? name.split(' ')[0] : 'Scholar';
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Izabi is Live!</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; -webkit-text-size-adjust: 100%; }
        .container { width: 100%; max-width: 600px; margin: 20px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; }
        .header { padding: 40px; text-align: center; }
        .logo { font-size: 24px; font-weight: 800; color: #fff; text-decoration: none; }
        .logo span { color: #3b82f6; }
        .hero { padding: 0 40px 40px 40px; text-align: center; }
        .h1 { font-size: 32px; font-weight: 800; margin-bottom: 16px; color: #ffffff; letter-spacing: -1px; }
        .hero-text { font-size: 16px; line-height: 1.6; color: #94a3b8; margin-bottom: 32px; }
        .cta-button { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 18px 36px; border-radius: 14px; font-weight: 700; font-size: 18px; box-shadow: 0 10px 20px -5px rgba(59, 130, 246, 0.4); }
        
        .feature-grid { padding: 0 40px 40px 40px; }
        .feature-card { background: #1e293b; border-radius: 16px; padding: 20px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.05); }
        .feature-title { color: #3b82f6; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; display: block; }
        .feature-body { font-size: 15px; color: #94a3b8; line-height: 1.5; }
        .footer-note { margin-top: 10px; }

        .footer { padding: 40px; background-color: #020617; text-align: center; font-size: 13px; color: #475569; border-top: 1px solid #1e293b; }

        @media only screen and (max-width: 620px) {
            .container { margin: 10px auto !important; border-radius: 14px !important; }
            .header, .footer { padding: 24px 18px !important; }
            .hero { padding: 0 18px 24px 18px !important; }
            .feature-grid { padding: 0 18px 24px 18px !important; }
            .h1 { font-size: 26px !important; letter-spacing: -0.5px !important; }
            .hero-text { font-size: 15px !important; margin-bottom: 22px !important; }
            .cta-button { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 14px 16px !important; font-size: 16px !important; }
            .feature-card { padding: 16px !important; margin-bottom: 12px !important; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">IZABI<span>.</span></div>
        </div>
        <div class="hero">
            <h1 class="h1">We are officially LIVE! 🚀</h1>
            <p class="hero-text">Hey ${firstName}, the wait is over. Izabi AI is now fully operational and ready to help you crush your academic goals with the power of intelligence.</p>
            <a href="https://izabi.vercel.app" class="cta-button">Experience Izabi Now</a>
        </div>

        <div class="feature-grid">
            <div class="feature-card">
                <span class="feature-title">New: Exam Center</span>
                <p class="feature-body">Simulate JAMB, WAEC, and University exams with real-time AI feedback and professional grading.</p>
            </div>
            <div class="feature-card">
                <span class="feature-title">Unlimited Brain Drops</span>
                <p class="feature-body">Turn your class notes into daily AI challenges that adapt as you learn.</p>
            </div>
            <div class="feature-card">
                <span class="feature-title">Multi-Track Streaks</span>
                <p class="feature-body">Track your growth across quizzes, summaries, and guides. Don't break the chain!</p>
            </div>
        </div>

        <div class="footer">
            <p>You're part of the first cohort of elite students using Izabi.</p>
            <p class="footer-note">&copy; ${new Date().getFullYear()} Izabi AI. Master your curriculum.</p>
        </div>
    </div>
</body>
</html>
`;
};

const formatAuditDate = (date?: Date) => {
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
            log?.createdAt,
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
    const summaryRows = Object.entries(grouped)
        .map(
            ([action, count]) => `
            <tr>
              <td data-label="Action">${sanitize(action)}</td>
              <td data-label="Count" style="text-align: right;">${count}</td>
            </tr>
        `,
        )
        .join('');

    const detailRows = events
        .map((event) => {
            const time = formatAuditDate(event?.createdAt);
            const user = sanitize(event?.user?.fullName || 'Unknown');
            const email = sanitize(event?.user?.email || 'unknown@izabi.ai');
            const action = sanitize(event?.action || 'N/A');
            const outcome = sanitize(event?.outcome || 'UNKNOWN');
            return `
            <tr>
              <td data-label="Timestamp (UTC)">${time}</td>
              <td data-label="User">${user}<div class="muted">${email}</div></td>
              <td data-label="Action">${action}</td>
              <td data-label="Outcome"><span class="pill" style="background: ${outcomeColor(
                  outcome,
              )}; color: #0b1220;">${outcome}</span></td>
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
      </div>

      <div class="section">
        <div class="label">Digest Summary</div>
        <div class="card">
          <div class="stat-row">
            <div class="stat">
              <div class="stat-title">Total Events</div>
              <div class="stat-value">${totalEvents}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Generated At</div>
              <div class="stat-value">${formatAuditDate(new Date())}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="label">Summary By Action</div>
        <table class="table">
          <thead>
            <tr>
              <th>Action</th>
              <th style="text-align: right;">Count</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="label">Detailed Event Log</div>
        <table class="table">
          <thead>
            <tr>
              <th>Timestamp (UTC)</th>
              <th>User</th>
              <th>Action</th>
              <th>Outcome</th>
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
