import nodemailer from 'nodemailer'
import { logger } from '../utils/logger.js'
import { getMailConfig } from '../routes/mail.js'

export function createTransporterFromConfig(config) {
  if (!config.host || !config.user) {
    logger.warn('SMTP not configured - missing host or user')
    return null
  }
  
  logger.info('Creating SMTP transporter', { 
    host: config.host, 
    port: config.port, 
    secure: config.secure,
    user: config.user,
    fromAddress: config.fromAddress 
  })
  
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    tls: {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    auth: {
      user: config.user,
      pass: config.password,
    },
  })
}

export async function sendPasswordCreationEmail(to, username, name, altEmail = null) {
  const config = await getMailConfig()
  const transporter = createTransporterFromConfig(config)
  
  if (!transporter) {
    logger.warn('SMTP not configured - skipping email send')
    return { success: false, error: 'SMTP not configured' }
  }

  const fromName = config.fromName || 'ALSM'
  const fromAddress = config.fromAddress || 'noreply@spectres.co.za'
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
    const recipientAddress = altEmail || to
    
    logger.info('Preparing password creation email', { 
      to: recipientAddress, 
      username,
      name: name || username,
      altEmailUsed: !!altEmail 
    })
    
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: recipientAddress,
      subject: `Welcome to Spectres.co.za - Create Your Account`,
      text: textContent,
      html: htmlContent,
    })

    logger.info('Password creation email sent', { 
      to: recipientAddress, 
      messageId: info.messageId, 
      altEmailUsed: !!altEmail 
    })
    return { success: true, messageId: info.messageId }
  } catch (error) {
    logger.error('Failed to send password creation email', { 
      error: error.message, 
      to,
      username 
    })
    return { success: false, error: error.message }
  }
}

export async function sendBulkPasswordEmails(users) {
  logger.info('Starting bulk password email batch', { userCount: users.length })
  
  const results = []
  let successCount = 0
  let failCount = 0
  
  for (const user of users) {
    const result = await sendPasswordCreationEmail(
      user.email,
      user.username,
      user.name,
      user.altEmail
    )
    if (result.success) successCount++
    else failCount++
    
    results.push({
      username: user.username,
      ...result
    })
  }
  
  logger.info('Bulk password email batch complete', { 
    total: users.length, 
    success: successCount, 
    failed: failCount 
  })
  
  return results
}

export async function sendPasswordResetEmail(to, username, resetToken) {
  const config = await getMailConfig()
  const transporter = createTransporterFromConfig(config)
  
  if (!transporter) {
    logger.warn('SMTP not configured - skipping password reset email')
    return { success: false, error: 'SMTP not configured' }
  }

  const fromName = config.fromName || 'ALSM'
  const fromAddress = config.fromAddress || 'noreply@spectres.co.za'
  const appUrl = process.env.APP_URL || 'https://alsm.spectres.co.za'
  const resetUrl = `${appUrl}/reset-password/${resetToken}`

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset Request</h1>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p>Hello ${username},</p>
    <p>We received a request to reset your password. Click the button below to create a new password:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">Reset Password</a>
    </div>
    <p style="font-size: 14px; color: #666;">
      This link will expire in 1 hour.<br>
      If you didn't request a password reset, please ignore this email.
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 12px; color: #999;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #667eea;">${resetUrl}</a>
    </p>
  </div>
</body>
</html>
`

  const textContent = `
Password Reset Request

Hello ${username},

We received a request to reset your password. Copy and paste this link into your browser:

${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, please ignore this email.
`

  try {
    logger.info('Preparing password reset email', { 
      to, 
      username,
      resetTokenPrefix: resetToken?.substring(0, 8) + '...'
    })
    
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: to,
      subject: 'Reset Your ALSM Password',
      text: textContent,
      html: htmlContent,
    })

    logger.info('Password reset email sent', { 
      to, 
      messageId: info.messageId,
      username 
    })
    return { success: true, messageId: info.messageId }
  } catch (error) {
    logger.error('Failed to send password reset email', { 
      error: error.message, 
      to,
      username 
    })
    return { success: false, error: error.message }
  }
}
