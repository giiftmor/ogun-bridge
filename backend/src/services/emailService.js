import nodemailer from 'nodemailer'
import { logger } from '../utils/logger.js'

let transporter = null

export function getMailTransporter() {
  if (transporter) return transporter

  const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    requireTLS: true,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  }

  if (!smtpConfig.host || !smtpConfig.auth.user) {
    logger.warn('SMTP not configured - emails will not be sent')
    return null
  }

  transporter = nodemailer.createTransport(smtpConfig)
  logger.info('SMTP transporter initialized')
  return transporter
}

export async function sendPasswordCreationEmail(to, username, name, altEmail = null) {
  const transporter = getMailTransporter()
  
  if (!transporter) {
    logger.warn('SMTP not configured - skipping email send')
    return { success: false, error: 'SMTP not configured' }
  }

  const fromName = process.env.SMTP_FROM_NAME || 'ALSM'
  const fromAddress = process.env.SMTP_FROM_ADDRESS || 'noreply@spectres.co.za'
  const appUrl = process.env.APP_URL || 'https://alsm.spectres.co.za'

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to ALSM</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p>Hi ${name || username},</p>
    
    <p>An account has been created for you on the Spectres.co.za systems. Here's what you need to know:</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
      <p style="margin: 0 0 10px 0;"><strong>Your Account Details:</strong></p>
      <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
      <p style="margin: 5px 0;"><strong>Email:</strong> ${to}</p>
    </div>
    
    <p><strong>What you can access:</strong></p>
    <ul>
      <li><strong>Email</strong> - webmail.spectres.co.za</li>
      <li><strong>Media Server</strong> - jellyfin.spectres.co.za</li>
      <li><strong>Cloud Storage</strong> - nc.spectres.co.za</li>
      <li><strong>VPN</strong> - Contact admin for access</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${appUrl}/profile" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Create Your Password</a>
    </div>
    
    <p style="font-size: 14px; color: #666;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      ${appUrl}/profile
    </p>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999;">
      If you didn't request this email, please contact your system administrator.
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>© 2026 Spectres.co.za - All rights reserved</p>
  </div>
</body>
</html>
`

  const textContent = `
Hi ${name || username},

An account has been created for you on the Spectres.co.za systems.

Your Account Details:
- Username: ${username}
- Email: ${to}

What you can access:
- Email: webmail.spectres.co.za
- Media Server: jellyfin.spectres.co.za
- Cloud Storage: nc.spectres.co.za
- VPN: Contact admin for access

Create your password by visiting: ${appUrl}/profile

If you didn't request this email, please contact your system administrator.

© 2026 Spectres.co.za
`

  try {
    // Send to altEmail if set, otherwise fallback to primary email
    const recipientAddress = altEmail || to
    
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: recipientAddress,
      subject: `Welcome to Spectres.co.za - Create Your Account`,
      text: textContent,
      html: htmlContent,
    })

    logger.info('Password creation email sent', { to: recipientAddress, messageId: info.messageId, altEmailUsed: !!altEmail })
    return { success: true, messageId: info.messageId }
  } catch (error) {
    logger.error('Failed to send password creation email', { error: error.message, to })
    return { success: false, error: error.message }
  }
}

export async function sendBulkPasswordEmails(users) {
  const results = []
  
  for (const user of users) {
    const result = await sendPasswordCreationEmail(
      user.email,
      user.username,
      user.name,
      user.altEmail
    )
    results.push({
      username: user.username,
      ...result
    })
  }
  
  return results
}
