# Mailserver Configuration - Session Summary
**Date:** February 26, 2026

## Issues Resolved

### 1. Environment File Line Endings
**Problem:** `.env` file had Windows CRLF line endings causing syntax errors
**Solution:**
```bash
sed -i 's/\r$//' .env
```

### 2. LDAP Query Filters Breaking Bash
**Problem:** `&` characters in LDAP filters interpreted as background processes
**Solution:** Added quotes around filter values in `.env`:
```bash
LDAP_QUERY_FILTER_USER="(&(objectClass=inetOrgPerson)(mail=%s))"
LDAP_QUERY_FILTER_ALIAS="(&(objectClass=inetOrgPerson)(mailAlias=%s))"
LDAP_QUERY_FILTER_DOMAIN="(|(&(objectClass=inetOrgPerson)(mail=*@%s))(&(objectClass=inetOrgPerson)(mailAlias=*@%s)))"
```

### 3. SSL Certificate Naming Mismatch
**Problem:** Certificates named `mailserver.spectres.co.za` but container expected `mail.spectres.co.za`
**Solution:** Regenerated with correct hostname:
```bash
openssl req -x509 -newkey rsa:4096 \
  -keyout config/ssl/mail.spectres.co.za-key.pem \
  -out config/ssl/mail.spectres.co.za-cert.pem \
  -days 365 -nodes \
  -subj "/C=ZA/ST=North West/L=Potchefstroom/O=Spectres/CN=mail.spectres.co.za"
```

### 4. Postfix Configuration Conflicts
**Problem:** 
- `spectres.co.za` listed in BOTH `virtual_mailbox_domains` AND `relay_domains`
- LDAP groups file causing protocol errors

**Solution:**
```bash
# Removed from relay_domains
relay_domains =

# Removed problematic LDAP groups lookup
docker exec mailserver postconf -e "virtual_alias_maps = "
docker exec mailserver rm -f /etc/postfix/ldap-groups.cf
```

### 5. VPS Relay Configuration
**Discovery:** Port 25 was held by `socat` forwarding to internal server
```bash
/usr/bin/socat TCP-LISTEN:25,fork,reuseaddr TCP:100.96.233.80:25
```

**Decision:** Kept socat (simpler) instead of switching to Postfix on VPS

**Issue:** socat didn't auto-start after reboot
**Solution:** Created systemd service:
```bash
sudo systemctl enable socat-smtp.service
sudo systemctl start socat-smtp.service
```

### 6. Hostname Resolution Warning
**Problem:** `warning: hostname spectres.co.za does not resolve to address 172.19.0.1`
**Solution:**
```bash
docker exec mailserver bash -c "echo '172.19.0.1 spectres.co.za mail.spectres.co.za' >> /etc/hosts"
```

### 7. SpamAssassin State Directory
**Problem:** `chown: cannot access '/var/mail-state/lib-spamassassin': No such file or directory`
**Solution:**
```bash
mkdir -p /opt/mail-stack/mail-state/lib-spamassassin
sudo chown -R 5000:5000 /opt/mail-stack/mail-state/lib-spamassassin
```

### 8. LDAP Authentication - Missing UID
**Problem:** LDAP users authenticating but failing with "User is missing UID"
```
Error: Couldn't drop privileges: User is missing UID (see mail_uid setting)
```

**Root Cause:** LDAP users don't have `uidNumber` in LDAP, and Dovecot wasn't configured for static UIDs

**Solution:** Added proper Dovecot LDAP configuration via environment variables:
```yaml
# In docker-compose.yml:
- DOVECOT_USER_ATTRS==uid=5000,=gid=5000,=home=/var/mail/%d/%n,=mail=maildir:/var/mail/%d/%n
- DOVECOT_PASS_ATTRS=uid=user,userPassword=password
- DOVECOT_DEFAULT_PASS_SCHEME=PBKDF2
- DOVECOT_AUTH_BIND=yes
```

**Key Learning:** The double `==` in env var becomes single `=` in config file (static value syntax)

### 9. Mailbox Location Inconsistency
**Problem:** LDAP users' mailboxes created at wrong location:
- Expected: `/var/mail/spectres.co.za/username/`
- Actual: `/var/mail/username/`

**Root Cause:** Missing `mail` attribute in `DOVECOT_USER_ATTRS`

**Solution:** 
1. Added `=mail=maildir:/var/mail/%d/%n` to user_attrs
2. Migrated existing mailboxes:
```bash
sudo mv /opt/mail-stack/mail-data/oracle /opt/mail-stack/mail-data/spectres.co.za/
sudo mv /opt/mail-stack/mail-data/neomoruri /opt/mail-stack/mail-data/spectres.co.za/
```

## Key Configuration Files

### docker-compose.yml (LDAP section)
```yaml
# LDAP AUTHENTICATION (ENABLED)
- ACCOUNT_PROVISIONER=LDAP
- LDAP_SERVER_HOST=172.17.0.1
- LDAP_SEARCH_BASE=ou=people,dc=spectres,dc=co,dc=za
- LDAP_BIND_DN=cn=Directory Manager,dc=spectres,dc=co,dc=za
- LDAP_BIND_PW=password

# LDAP Query Filters
- LDAP_QUERY_FILTER_USER="(&(objectClass=inetOrgPerson)(uid=%n))"
- LDAP_QUERY_FILTER_ALIAS="(&(objectClass=inetOrgPerson)(mailAlias=%s))"
- LDAP_QUERY_FILTER_DOMAIN="(|(&(objectClass=inetOrgPerson)(mail=*@%s))(&(objectClass=inetOrgPerson)(mailAlias=*@%s)))"

# Dovecot LDAP (for IMAP auth with static UID/GID)
- DOVECOT_USER_ATTRS==uid=5000,=gid=5000,=home=/var/mail/%d/%n,=mail=maildir:/var/mail/%d/%n
- DOVECOT_PASS_ATTRS=uid=user,userPassword=password
- DOVECOT_DEFAULT_PASS_SCHEME=PBKDF2
- DOVECOT_AUTH_BIND=yes
```

### Generated dovecot-ldap.conf.ext
```conf
base = ou=people,dc=spectres,dc=co,za
default_pass_scheme = PBKDF2
dn = cn=Directory Manager,dc=spectres,dc=co,za
dnpass = password
uris = ldap://172.17.0.1
tls = no
ldap_version = 3
pass_attrs = uid=user,userPassword=password
pass_filter = (&(objectClass=inetOrgPerson)(uid=%n))
user_attrs = =uid=5000,=gid=5000,=home=/var/mail/%d/%n,=mail=maildir:/var/mail/%d/%n
user_filter = (&(objectClass=inetOrgPerson)(uid=%n))
auth_bind = yes
```

## Current Status

✅ **Working:**
- LDAP authentication for IMAP
- Static UID/GID (5000) for all virtual users
- Mailboxes in correct location: `/var/mail/spectres.co.za/username/`
- SSL certificates properly named
- VPS relay via socat (auto-starts on boot)
- Inbound and outbound mail flow

⚠️ **Warnings (non-critical):**
- `virtual_mailbox_domains and relay_domains` warning (addressed by removing from relay_domains)
- SpamAssassin missing decoder warnings (cosmetic)

## Important Notes

1. **Container Persistence:** Manual edits to files inside container are lost on restart. Always configure via:
   - Environment variables in docker-compose.yml
   - Volume-mounted files in `/opt/mail-stack/config/`

2. **LDAP Requirements:** Users don't need `uidNumber` in LDAP when using static UIDs via Dovecot config

3. **Mailbox Structure:** Must be consistent - either `/var/mail/domain/user/` OR `/var/mail/user@domain/`, not mixed

4. **VPS Gateway:** Using socat for simplicity instead of full Postfix relay
   - Inbound: Internet → VPS (socat) → Internal mailserver
   - Outbound: Internal mailserver → VPS (socat) → Internet

## Commands Reference

```bash
# View generated Dovecot LDAP config
docker exec mailserver cat /etc/dovecot/dovecot-ldap.conf.ext

# Test LDAP authentication
docker exec mailserver doveadm auth test username password

# Check user attributes from LDAP
docker exec mailserver doveadm user username@spectres.co.za

# List mailboxes for user
docker exec mailserver doveadm mailbox list -u username@spectres.co.za

# Check Postfix virtual domains
docker exec mailserver postconf virtual_mailbox_domains

# Check mail location
docker exec mailserver doveconf mail_location

# View mail structure
docker exec mailserver ls -la /var/mail/spectres.co.za/
```

## Next Steps

- Monitor LDAP authentication in logs
- Verify all existing users can access their mail
- Test new user creation in LDAP
- Consider adding LDAP group support if needed
