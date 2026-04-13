# LocalMail SMTP Integration

## Problem

When connecting ALSM to LocalMail SMTP (port 2525), the test connection would timeout or fail with:

```
535 Invalid AUTH PLAIN format
```

### Root Cause

Nodemailer (used by ALSM) sends AUTH credentials differently than expected by LocalMail:

- **Nodemailer AUTH LOGIN**: Sends username in the username field, API key in the password field
- **LocalMail expected**: API key in the password field only

Additionally, when using AUTH PLAIN, nodemailer may send the API key in the username field rather than password.

## Solution Applied

Updated `/home/ghost/projects/localmail/localmail-api/src/smtp/auth.ts` to accept API keys in multiple locations:

1. **Password field** (standard) - API key as password
2. **Username field** - API key as username (nodemailer AUTH LOGIN style)
3. **Username contains key** - API key as part of username string

### Code Changes

```typescript
// Now checks both username AND password fields for API key
if (password === keys.dev_key || username === keys.dev_key) {
  return { success: true, mode: 'sandbox', username };
}
```

## Database Configuration

The `mail_settings` table in ALSM's PostgreSQL database stores SMTP config:

```sql
UPDATE mail_settings SET 
  host = '192.168.0.200',
  port = 2525,
  username = 'alsm@spectres.co.za',
  password = 'lm_dev_<your-key>'
WHERE id = 1;
```

## Firewall Note

Port 2525 needed to be opened for Docker containers to reach the host:

```bash
sudo ufw allow 2525/tcp
```

## Testing

After applying the fix:

```bash
# Test from host
swaks -s localhost -p 2525 --tls --auth LOGIN \
  --auth-user alsm@spectres.co.za \
  --auth-password lm_dev_<your-key> \
  -f alsm@spectres.co.za \
  -t test@example.com

# Test from Docker container
docker exec alsm-backend nc -zv 192.168.0.200 2525
```

## Related Files

- LocalMail API: `/home/ghost/projects/localmail/localmail-api/`
- SMTP Auth: `/home/ghost/projects/localmail/localmail-api/src/smtp/auth.ts`
- ALSM Backend: `/home/ghost/projects/alsm/backend/`
- SMTP Config: ALSM database `mail_settings` table

## Current Config

```yaml
smtp:
  host: 0.0.0.0
  port: 2525
  keys:
    dev_key: "lm_dev_test1234567890123456789012345678"
    prod_key: "lm_prod_test1234567890123456789012345678"
```

## Date

Fixed: 2026-04-13
