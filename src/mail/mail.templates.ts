
export const getOtpEmailTemplate = (otp: string): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Izabi Verification</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #09090b; color: #e4e4e7; }
        .container { max-width: 600px; margin: 40px auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(90deg, #18181b 0%, #09090b 100%); padding: 30px; text-align: center; border-bottom: 1px solid #27272a; }
        .logo { font-size: 24px; font-weight: 800; letter-spacing: 2px; color: #fff; text-decoration: none; }
        .logo span { color: #3b82f6; }
        .content { padding: 40px 30px; text-align: center; }
        .h1 { font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #ffffff; }
        .text { font-size: 15px; line-height: 1.6; color: #a1a1aa; margin-bottom: 24px; }
        .otp-container { margin: 30px 0; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; padding: 20px; text-align: center; display: inline-block; min-width: 200px; }
        .otp-code { font-size: 32px; font-weight: 700; color: #3b82f6; letter-spacing: 8px; font-family: 'Courier New', monospace; }
        .footer { padding: 30px; background-color: #09090b; text-align: center; font-size: 12px; color: #52525b; border-top: 1px solid #27272a; }
        .footer-link { color: #52525b; text-decoration: underline; margin: 0 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">IZABI<span>.</span></div>
        </div>
        <div class="content">
            <h1 class="h1">Verify Your Account</h1>
            <p class="text">Welcome to Izabi. To complete your registration and access the platform, please use the verification code below.</p>
            
            <div class="otp-container">
                <div class="otp-code">${otp}</div>
            </div>

            <p class="text" style="font-size: 13px;">This code is valid for <strong>10 minutes</strong>. If you did not request this verification, please ignore this email.</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Izabi AI. All rights reserved.</p>
            <p>
                <a href="#" class="footer-link">Privacy Policy</a>
                <a href="#" class="footer-link">Terms of Service</a>
            </p>
        </div>
    </div>
</body>
</html>
  `;
};

export const getWelcomeEmailTemplate = (name: string): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Izabi</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #09090b; color: #e4e4e7; }
        .container { max-width: 600px; margin: 40px auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(90deg, #18181b 0%, #09090b 100%); padding: 30px; text-align: center; border-bottom: 1px solid #27272a; }
        .logo { font-size: 24px; font-weight: 800; letter-spacing: 2px; color: #fff; text-decoration: none; }
        .logo span { color: #3b82f6; }
        .content { padding: 40px 30px; text-align: center; }
        .h1 { font-size: 24px; font-weight: 700; margin-bottom: 16px; color: #ffffff; }
        
        .hero-text { font-size: 16px; line-height: 1.6; color: #a1a1aa; margin-bottom: 24px; max-width: 400px; margin-left: auto; margin-right: auto; }
        
        .cta-button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 24px 0; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); letter-spacing: 0.5px; }
        
        .feature-grid { display: table; width: 100%; margin-top: 30px; border-top: 1px solid #27272a; padding-top: 30px; }
        .feature-item { display: table-cell; width: 33%; padding: 10px; vertical-align: top; }
        .feature-icon { font-size: 24px; margin-bottom: 10px; display: block; }
        .feature-title { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 4px; display: block; }
        .feature-desc { font-size: 12px; color: #71717a; line-height: 1.4; display: block; }

        .footer { padding: 30px; background-color: #09090b; text-align: center; font-size: 12px; color: #52525b; border-top: 1px solid #27272a; }
        .footer-link { color: #52525b; text-decoration: underline; margin: 0 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">IZABI<span>.</span></div>
        </div>
        <div class="content">
            <h1 class="h1">Welcome aboard, ${name}!</h1>
            <p class="hero-text">Your journey to smarter studying starts here. Izabi transforms your documents into interactive study materials in seconds.</p>
            
            <a href="https://izabi.onrender.com" class="cta-button">Start Studying Now</a>

            <div class="feature-grid">
                <div class="feature-item">
                    <span class="feature-icon">🚀</span>
                    <span class="feature-title">Fast Uploads</span>
                    <span class="feature-desc">Process PDFs instantly</span>
                </div>
                <div class="feature-item">
                    <span class="feature-icon">🧠</span>
                    <span class="feature-title">AI Summaries</span>
                    <span class="feature-desc">Get the key points</span>
                </div>
                <div class="feature-item">
                    <span class="feature-icon">⚡</span>
                    <span class="feature-title">Smart Quizzes</span>
                    <span class="feature-desc">Test your knowledge</span>
                </div>
            </div>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Izabi AI. All rights reserved.</p>
            <p>
                <a href="#" class="footer-link">Privacy Policy</a>
                <a href="#" class="footer-link">Terms of Service</a>
            </p>
        </div>
    </div>
</body>
</html>
  `;
};
