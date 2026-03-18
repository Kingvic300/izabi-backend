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
        font-size: 30px;
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
