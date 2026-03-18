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
        .logo { font-size: 28px; font-weight: 800; color: #fff; text-decoration: none; }
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
