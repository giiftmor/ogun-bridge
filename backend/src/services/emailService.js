import nodemailer from 'nodemailer'
import { logger } from '../utils/logger.js'
import { getServiceConfig, SERVICE_SMTP } from '../services/config.js'

// HTML escape function to prevent XSS
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function createTransporterFromConfig(config) {
  if (!config || !config.host || !config.user) {
    logger.warn('SMTP not configured - missing host or user')
    return null
  }
  
  const isSecure = config.port === 465 || config.secure
  const requireTLS = config.requireTLS !== false && !isSecure
  
  logger.info('Creating SMTP transporter', { 
    host: config.host, 
    port: config.port, 
    secure: isSecure,
    requireTLS: requireTLS,
    user: config.user,
    fromAddress: config.fromAddress 
  })
  
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: isSecure,
    requireTLS: requireTLS,
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

// Service icon SVG paths
const serviceIcons = {
  mail: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6L12 13L2 6"/></svg>',
  vpn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  media: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>',
  cloud: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 1 9 20h9a5 5 0 0 0 0-10z"/></svg>',
  authentik: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  default: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>',
}

function getServiceIcon(icon) {
  return serviceIcons[icon] || serviceIcons.default
}

function buildServiceCardsHtml(services) {
  if (!services || services.length === 0) {
    return '<p style="color: #666; font-size: 14px;">No services available yet. Services will be accessible once you are added to appropriate groups.</p>'
  }
  
  const cards = services.map(service => {
    const icon = getServiceIcon(service.icon)
    const urlDisplay = service.url || 'Contact admin for access'
    const hasLink = !!service.url
    const accessMethod = service.accessMethod || 'Credentials from admin'
    
    return '<div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 16px; margin-bottom: 12px;">' +
      '<div style="display: flex; align-items: center; margin-bottom: 8px;">' +
        '<span style="color: #667eea; margin-right: 10px;">' + icon + '</span>' +
        '<span style="font-weight: 600; color: #1a1a1a;">' + escapeHtml(service.name) + '</span>' +
      '</div>' +
      '<p style="margin: 0 0 8px 0; color: #666; font-size: 13px;">' + escapeHtml(service.description || '') + '</p>' +
      (hasLink ? '<p style="margin: 0 0 6px 0; font-size: 13px;"><strong>URL:</strong> <a href="' + escapeHtml(service.url) + '" style="color: #667eea; word-break: break-all;">' + escapeHtml(urlDisplay) + '</a></p>' : '') +
      '<p style="margin: 0; font-size: 12px; color: #888;"><strong>Access:</strong> ' + escapeHtml(accessMethod) + '</p>' +
    '</div>'
  }).join('')
  
  return cards
}

export async function getMailConfig() {
  const dbConfig = await getServiceConfig(SERVICE_SMTP)
  
  // Merge with legacy mail_settings table for backward compatibility
  try {
    const pool = (await import('../lib/db.js')).default
    const result = await pool.query('SELECT * FROM mail_settings WHERE id = 1')
    if (result.rows.length > 0) {
      const legacy = result.rows[0]
      // DB config takes precedence, then legacy, then env vars (handled in getServiceConfig)
      return {
        host: dbConfig.host || legacy.host || 'smtp.example.com',
        port: dbConfig.port || legacy.port || 587,
        secure: dbConfig.secure ?? legacy.secure ?? false,
        requireTLS: dbConfig.requireTLS ?? legacy.require_tls ?? true,
        user: dbConfig.username || legacy.username || '',
        password: dbConfig.password || legacy.password || '',
        fromName: dbConfig.fromName || legacy.from_name || 'Spectres',
        fromAddress: dbConfig.fromAddress || legacy.from_address || 'noreply@spectres.co.za',
      }
    }
  } catch (error) {
    logger.warn('Failed to load legacy mail_settings, using DB config only', { error: error.message })
  }
  
  return {
    host: dbConfig.host || 'smtp.example.com',
    port: dbConfig.port || 587,
    secure: dbConfig.secure ?? false,
    requireTLS: true,
    user: dbConfig.username || '',
    password: dbConfig.password || '',
    fromName: dbConfig.fromName || 'Spectres',
    fromAddress: dbConfig.fromAddress || 'noreply@spectres.co.za',
  }
}

export async function sendPasswordCreationEmail(to, username, name, token = null, altEmail = null, services = []) {
  const config = await getMailConfig()
  const transporter = await createTransporterFromConfig(config)
  
  if (!transporter) {
    logger.warn('SMTP not configured - skipping email send')
    return { success: false, error: 'SMTP not configured' }
  }

  const fromName = config.fromName || 'Spectres'
  const fromAddress = config.fromAddress || 'noreply@spectres.co.za'
  const appUrl = process.env.APP_URL || 'https://ogun.spectres.co.za'
  const logoUrl = appUrl + '/spectres-logo.png'

  // Build create password URL with token if provided
  const createPasswordUrl = token 
    ? appUrl + '/create-password/' + token
    : appUrl + '/create-password'

  const serviceCardsHtml = buildServiceCardsHtml(services)

  const htmlContent = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'</head>' +
'<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">' +
  '<div style="background: #1a1a1a; padding: 25px 30px; border-radius: 10px 10px 0 0; text-align: center;">' +
    '<img src="' + logoUrl + '" alt="Spectres" style="height: 50px; display: block; margin: 0 auto;">' +
  '</div>' +
  '<div style="background: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">' +
    '<p>Hi ' + escapeHtml(name || username) + ',</p>' +
    '<p>Welcome to Spectres. An account has been created for you on our systems.</p>' +
    '<div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 3px solid #667eea;">' +
      '<p style="margin: 0 0 10px 0;"><strong>Your Account Details:</strong></p>' +
      '<p style="margin: 5px 0;"><strong>Username:</strong> ' + escapeHtml(username) + '</p>' +
      '<p style="margin: 5px 0;"><strong>Email:</strong> ' + escapeHtml(to) + '</p>' +
    '</div>' +
    '<p style="margin-bottom: 10px;"><strong>Services you will have access to:</strong></p>' +
    serviceCardsHtml +
    '<div style="text-align: center; margin: 30px 0;">' +
      '<a href="' + createPasswordUrl + '" style="background: #1a1a1a; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Create Your Password</a>' +
    '</div>' +
    '<p style="font-size: 14px; color: #666;">' +
      'If the button doesn\'t work, copy and paste this link into your browser:<br>' +
      '<a href="' + createPasswordUrl + '" style="color: #667eea;">' + createPasswordUrl + '</a>' +
    '</p>' +
    '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">' +
    '<p style="font-size: 12px; color: #999;">' +
      'If you didn\'t request this email, please contact your system administrator.' +
    '</p>' +
  '</div>' +
  '<div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">' +
    '<p>© 2026 Spectres - All rights reserved</p>' +
  '</div>' +
'</body>' +
'</html>'

  const textContent = 'Hi ' + (name || username) + ',\n\n' +
    'Welcome to Spectres. An account has been created for you on our systems.\n\n' +
    'Your Account Details:\n' +
    '- Username: ' + username + '\n' +
    '- Email: ' + to + '\n\n' +
    'What you can access:\n' +
    '- Email: webmail.spectres.co.za\n' +
    '- Media Server: jellyfin.spectres.co.za\n' +
    '- Cloud Storage: nc.spectres.co.za\n\n' +
    'Go to ' + createPasswordUrl + ' to create your password.\n\n' +
    'If you didn\'t request this email, please contact your system administrator.\n'

  try {
    const info = await transporter.sendMail({
      from: '"' + fromName + '" <' + fromAddress + '>',
      to: to,
      subject: 'Welcome to Spectres',
      text: textContent,
      html: htmlContent,
    })

    logger.info('Password creation email sent', { 
      to, 
      messageId: info.messageId,
      username 
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
  const results = []
  let successCount = 0
  let failCount = 0

  for (const user of users) {
    const result = await sendPasswordCreationEmail(
      user.email,
      user.username,
      user.name,
      null,
      user.altEmail
    )

    if (result.success) {
      successCount++
    } else {
      failCount++
    }
    
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

export async function sendPasswordResetEmail(to, username, resetToken, options = {}) {
  const config = await getMailConfig()
  const transporter = await createTransporterFromConfig(config)
  
  if (!transporter) {
    logger.warn('SMTP not configured - skipping password reset email')
    return { success: false, error: 'SMTP not configured' }
  }

  const fromName = config.fromName || 'Spectres'
  const fromAddress = config.fromAddress || 'noreply@spectres.co.za'
  const appUrl = process.env.APP_URL || 'https://ogun.spectres.co.za'
  const logoUrl = appUrl + '/spectres-logo.png'

  const isTempPassword = options.temporaryPassword && options.isInvitation

  let subject
  let htmlContent
  let textContent

  if (isTempPassword) {
    subject = 'Your Temporary Password - Spectres'
    const tempPassword = options.temporaryPassword

    htmlContent = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'</head>' +
'<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">' +
  '<div style="background: #1a1a1a; padding: 25px 30px; border-radius: 10px 10px 0 0; text-align: center;">' +
    '<img src="' + logoUrl + '" alt="Spectres" style="height: 50px; display: block; margin: 0 auto;">' +
  '</div>' +
  '<div style="background: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">' +
    '<p>Hello ' + escapeHtml(username) + ',</p>' +
    '<p>Your Spectres account has been created. Here is your temporary password:</p>' +
    '<div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 3px solid #667eea; text-align: center; font-family: monospace; font-size: 18px; letter-spacing: 2px;">' +
      tempPassword +
    '</div>' +
    '<p style="color: #dc2626; font-weight: bold;">You must change your password on first login.</p>' +
    '<div style="text-align: center; margin: 30px 0;">' +
      '<a href="' + appUrl + '/self-service-password" style="display: inline-block; background: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: 600;">Change Password</a>' +
    '</div>' +
    '<p style="font-size: 14px; color: #666;">' +
      'Go to the link above and use your temporary password to log in. You will be prompted to create a new password.' +
    '</p>' +
    '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">' +
    '<p style="font-size: 12px; color: #999;">' +
      'If you didn\'t request this account, please contact your system administrator.' +
    '</p>' +
  '</div>' +
  '<div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">' +
    '<p>© 2026 Spectres - All rights reserved</p>' +
  '</div>' +
'</body>' +
'</html>'

    textContent = 'Your Account Has Been Created\n\n' +
      'Hello ' + escapeHtml(username) + ',\n\n' +
      'Your Spectres account has been created. Here is your temporary password:\n\n' +
      tempPassword + '\n\n' +
      'You must change your password on first login.\n\n' +
      'Go to: ' + appUrl + '/self-service-password\n\n' +
      'If you didn\'t request this account, please contact your system administrator.\n'
  } else {
    subject = 'Reset Your Spectres Password'
    const resetUrl = appUrl + '/reset-password/' + resetToken

    htmlContent = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'</head>' +
'<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">' +
  '<div style="background: #1a1a1a; padding: 25px 30px; border-radius: 10px 10px 0 0; text-align: center;">' +
    '<img src="' + logoUrl + '" alt="Spectres" style="height: 50px; display: block; margin: 0 auto;">' +
  '</div>' +
  '<div style="background: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">' +
    '<p>Hello ' + escapeHtml(username) + ',</p>' +
    '<p>We received a request to reset your Spectres password. Click the button below to create a new password:</p>' +
    '<div style="text-align: center; margin: 30px 0;">' +
      '<a href="' + resetUrl + '" style="display: inline-block; background: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: 600;">Reset Password</a>' +
    '</div>' +
    '<p style="font-size: 14px; color: #666;">' +
      'This link will expire in 1 hour.<br>' +
      'If you didn\'t request a password reset, please ignore this email.' +
    '</p>' +
    '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">' +
    '<p style="font-size: 12px; color: #999;">' +
      'If the button doesn\'t work, copy and paste this link into your browser:<br>' +
      '<a href="' + resetUrl + '" style="color: #667eea;">' + resetUrl + '</a>' +
    '</p>' +
  '</div>' +
  '<div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">' +
    '<p>© 2026 Spectres - All rights reserved</p>' +
  '</div>' +
'</body>' +
'</html>'

    textContent = 'Password Reset Request\n\n' +
      'Hello ' + escapeHtml(username) + ',\n\n' +
      'We received a request to reset your Spectres password. Copy and paste this link into your browser:\n\n' +
      resetUrl + '\n\n' +
      'This link will expire in 1 hour.\n\n' +
      'If you didn\'t request a password reset, please ignore this email.\n'
  }

  try {
    logger.info('Sending password email', { 
      to, 
      username,
      isTempPassword: isTempPassword || false
    })

    const info = await transporter.sendMail({
      from: '"' + fromName + '" <' + fromAddress + '>',
      to: to,
      subject: subject,
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

export async function sendPasswordExpirationEmail(to, username, daysRemaining, expirationDate) {
  const config = await getMailConfig()
  const transporter = await createTransporterFromConfig(config)
  
  if (!transporter) {
    logger.warn('SMTP not configured - skipping expiration email')
    return { success: false, error: 'SMTP not configured' }
  }

  const fromName = config.fromName || 'Spectres'
  const fromAddress = config.fromAddress || 'noreply@spectres.co.za'
  const appUrl = process.env.APP_URL || 'https://ogun.spectres.co.za'
  const logoUrl = appUrl + '/spectres-logo.png'

  const urgencyColor = daysRemaining <= 1 ? '#dc2626' : (daysRemaining <= 3 ? '#ea580c' : '#ca8a04')
  const urgencyLabel = daysRemaining <= 1 ? 'URGENT' : (daysRemaining <= 3 ? 'WARNING' : 'NOTICE')
  const formattedDate = new Date(expirationDate).toLocaleDateString('en-ZA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const htmlContent = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'</head>' +
'<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">' +
  '<div style="background: #1a1a1a; padding: 25px 30px; border-radius: 10px 10px 0 0; text-align: center;">' +
    '<img src="' + logoUrl + '" alt="Spectres" style="height: 50px; display: block; margin: 0 auto;">' +
  '</div>' +
  '<div style="background: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">' +
    '<div style="background: ' + urgencyColor + '; color: white; padding: 12px 20px; border-radius: 6px; margin-bottom: 20px; text-align: center; font-weight: bold;">' +
      urgencyLabel + ': Password Expires in ' + daysRemaining + ' Day' + (daysRemaining === 1 ? '' : 's') +
    '</div>' +
    '<p>Hello ' + escapeHtml(username) + ',</p>' +
    '<p>Your Spectres account password will expire on <strong>' + formattedDate + '</strong>.</p>' +
    '<p>After this date, you will be unable to access Spectres services until you reset your password.</p>' +
    '<div style="text-align: center; margin: 30px 0;">' +
      '<a href="' + appUrl + '/self-service-password" style="display: inline-block; background: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: 600;">Change Password Now</a>' +
    '</div>' +
    '<p style="font-size: 14px; color: #666;">' +
      'Go to the link above and use your current password to log in. You will be prompted to create a new password.' +
    '</p>' +
    '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">' +
    '<p style="font-size: 12px; color: #999;">' +
      'If you need assistance, please contact your system administrator.' +
    '</p>' +
  '</div>' +
  '<div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">' +
    '<p>&copy; 2026 Spectres - All rights reserved</p>' +
  '</div>' +
'</body>' +
'</html>'

  const textContent = urgencyLabel + ': Password Expires in ' + daysRemaining + ' Day' + (daysRemaining === 1 ? '' : 's') + '\n\n' +
    'Hello ' + escapeHtml(username) + ',\n\n' +
    'Your Spectres account password will expire on ' + formattedDate + '.\n\n' +
    'After this date, you will be unable to access Spectres services until you reset your password.\n\n' +
    'Go to: ' + appUrl + '/self-service-password\n\n' +
    'If you need assistance, please contact your system administrator.\n'

  try {
    const info = await transporter.sendMail({
      from: '"' + fromName + '" <' + fromAddress + '>',
      to: to,
      subject: urgencyLabel + ': Your Spectres Password Expires in ' + daysRemaining + ' Day' + (daysRemaining === 1 ? '' : 's'),
      text: textContent,
      html: htmlContent,
    })

    logger.info('Password expiration email sent', { 
      to, 
      messageId: info.messageId,
      username,
      daysRemaining
    })
    return { success: true, messageId: info.messageId }
  } catch (error) {
    logger.error('Failed to send password expiration email', {
      error: error.message,
      to,
      username,
      daysRemaining
    })
    return { success: false, error: error.message }
  }
}
