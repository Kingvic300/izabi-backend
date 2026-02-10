export const getOtpEmailTemplate = (otp: string): string => {
  const otpCells = otp
    .split('')
    .map(
      (digit) => `
        <td
          style="
            width: 48px;
            height: 56px;
            background-color: #020617;
            border: 1px solid #334155;
            border-radius: 10px;
            text-align: center;
            font-size: 28px;
            font-weight: 700;
            color: #e5e7eb;
            font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI',
              Roboto, sans-serif;
          "
        >
          ${digit}
        </td>
        <td style="width: 8px;"></td>
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
      }

      .container {
        max-width: 600px;
        margin: 40px auto;
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

      .footer {
        padding: 28px;
        background-color: #020617;
        text-align: center;
        font-size: 12px;
        color: #64748b;
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
        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; }
        .container { max-width: 600px; margin: 20px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; }
        .header { padding: 40px; text-align: center; }
        .logo { font-size: 24px; font-weight: 800; color: #fff; text-decoration: none; }
        .logo span { color: #3b82f6; }
        .hero { padding: 0 40px 40px 40px; text-align: center; }
        .h1 { font-size: 32px; font-weight: 800; margin-bottom: 16px; color: #ffffff; letter-spacing: -1px; }
        .hero-text { font-size: 16px; line-height: 1.6; color: #94a3b8; margin-bottom: 32px; }
        .cta-button { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 14px; font-weight: 600; font-size: 16px; box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3); }
        
        .section-title { font-size: 12px; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 24px; }
        
        .feature-row { display: table; width: 100%; padding: 0 40px 40px 40px; }
        .feature-item { display: block; margin-bottom: 20px; padding: 20px; background: #1e293b; border-radius: 16px; text-align: left; }
        .feature-icon { font-size: 24px; float: left; margin-right: 16px; }
        .feature-content { overflow: hidden; }
        .feature-title { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 4px; display: block; }
        .feature-desc { font-size: 14px; color: #94a3b8; line-height: 1.4; display: block; }

        .streak-promo { margin: 0 40px 40px 40px; padding: 24px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #3b82f6; border-radius: 16px; text-align: center; }
        .streak-text { color: #3b82f6; font-weight: 700; font-size: 14px; }

        .footer { padding: 40px; background-color: #020617; text-align: center; font-size: 13px; color: #475569; border-top: 1px solid #1e293b; }
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

        <div style="padding: 0 40px;">
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
            <span class="feature-icon" style="float: none; display: block; margin: 0 auto 10px auto;">🦉</span>
            <span class="feature-title">Your Pet is waiting!</span>
            <p class="feature-desc">Meet your Izabi Owl. Level him up and keep him happy by maintaining your daily study streak.</p>
            <div class="streak-text" style="margin-top: 10px;">Current Streak: 1 Day 🔥</div>
        </div>

        <div class="footer">
            <p>You received this because you signed up for Izabi AI.</p>
            <p style="margin-top: 10px;">&copy; ${new Date().getFullYear()} Izabi AI. Lagos, Nigeria.</p>
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
        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; }
        .container { max-width: 600px; margin: 20px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; }
        .header { padding: 40px; text-align: center; background: linear-gradient(to bottom, #1e293b, #0f172a); }
        .logo { font-size: 24px; font-weight: 800; color: #fff; text-decoration: none; }
        .logo span { color: #3b82f6; }
        .content { padding: 40px; text-align: center; }
        .title { font-size: 28px; font-weight: 800; margin-bottom: 16px; color: #ffffff; letter-spacing: -1px; }
        .text { font-size: 16px; line-height: 1.6; color: #94a3b8; margin-bottom: 32px; }
        .freeze-icon { font-size: 64px; margin-bottom: 24px; display: block; animation: pulse 2s infinite; }
        .cta-button { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 14px; font-weight: 600; font-size: 16px; margin-bottom: 24px; }
        .stat-box { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; padding: 16px; margin-top: 24px; display: inline-block; }
        .footer { padding: 32px; background-color: #020617; text-align: center; font-size: 13px; color: #475569; }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
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
            
            <p class="text" style="font-size: 14px;">If you don't study today, you might lose your streak for real!</p>

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
        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; }
        .container { max-width: 600px; margin: 20px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; }
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

        .footer { padding: 40px; background-color: #020617; text-align: center; font-size: 13px; color: #475569; border-top: 1px solid #1e293b; }
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
            <p style="margin-top: 10px;">&copy; ${new Date().getFullYear()} Izabi AI. Master your curriculum.</p>
        </div>
    </div>
</body>
</html>
`;
};
