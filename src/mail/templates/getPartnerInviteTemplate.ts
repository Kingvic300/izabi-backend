export const getPartnerInviteTemplate = (
    inviterName: string,
    acceptUrl: string,
): string => {
    const firstName = inviterName ? inviterName.split(' ')[0] : 'A fellow scholar';
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Accountability Partner Invite</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; -webkit-text-size-adjust: 100%; }
        .container { width: 100%; max-width: 600px; margin: 20px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; }
        .header { padding: 40px; text-align: center; background: linear-gradient(to bottom, #1e293b, #0f172a); }
        .logo { font-size: 28px; font-weight: 800; color: #fff; text-decoration: none; }
        .logo span { color: #3b82f6; }
        .content { padding: 40px; text-align: center; }
        .title { font-size: 28px; font-weight: 800; margin-bottom: 16px; color: #ffffff; letter-spacing: -1px; }
        .text { font-size: 16px; line-height: 1.6; color: #94a3b8; margin-bottom: 32px; }
        .icon { font-size: 64px; margin-bottom: 24px; display: block; }
        .cta-button { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 14px; font-weight: 600; font-size: 16px; margin-bottom: 24px; }
        .footer { padding: 32px; background-color: #020617; text-align: center; font-size: 13px; color: #475569; }

        @media only screen and (max-width: 620px) {
            .container { margin: 10px auto !important; border-radius: 14px !important; }
            .header, .content, .footer { padding: 24px 18px !important; }
            .title { font-size: 24px !important; letter-spacing: -0.5px !important; }
            .text { font-size: 15px !important; margin-bottom: 24px !important; }
            .icon { font-size: 52px !important; margin-bottom: 16px !important; }
            .cta-button { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 14px 16px !important; margin-bottom: 18px !important; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">IZABI<span>.</span></div>
        </div>
        <div class="content">
            <span class="icon">🤝</span>
            <h1 class="title">You've Been Invited!</h1>
            <p class="text">${firstName} wants you to be their <strong>Accountability Partner</strong> on Izabi. Team up, set a shared goal, and keep each other consistent.</p>

            <a href="${acceptUrl}" class="cta-button">Accept Invite</a>

            <p class="text" style="font-size: 14px;">This invite expires in 7 days.</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Izabi AI. Master your curriculum.</p>
        </div>
    </div>
</body>
</html>
    `;
};
