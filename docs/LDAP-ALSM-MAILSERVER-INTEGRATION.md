# LDAP, ALSM, Mailserver Integration Issue

**Date:** March 22, 2026  
**Project:** Spectres HUB | Infrastructure  
**Status:** ✅ Resolved

## Issue Summary

When integrating LDAP (Directory Server), ALSM (Authentik LDAP Sync Manager), and Docker Mailserver, several authentication and configuration issues were encountered.

## Issues Discovered

### 1. Password Scheme Mismatch
- **Problem:** LDAP was using PBKDF2-SHA512
- **Mailserver (Dovecot)** was expecting SSHA512
- **Mailserver logs:** `Unknown scheme PBKDF2-SHA512`

### 2. LDAP Host Configuration
- **Problem:** Mailserver LDAP config pointed to wrong IP (172.18.0.1 instead of 192.168.0.200)
- **Fixed by:** Updating `/opt/mail-stack/.env`
  ```
  LDAP_SERVER_HOST=ldap://192.168.0.200
  ```

### 3. memberOf Plugin Disabled
- **Problem:** LDAP memberOf plugin was disabled by default
- **Fixed by:** Enabling via ldapmodify
  ```bash
  ldapmodify -x -H ldap://192.168.0.200 -D "cn=Directory Manager" -w "Kali@1403"
  dn: cn=MemberOf Plugin,cn=plugins,cn=config
  changetype: modify
  replace: nsslapd-pluginEnabled
  nsslapd-pluginEnabled: on
  ```
- **Note:** After enabling, existing users needed group membership refresh (delete + re-add members)

### 4. SMTP Authentication
- **Problem:** SMTP credentials needed valid LDAP password
- **Oracle user password** had wrong scheme (PBKDF2-SHA512)
- **Fixed by:** Syncing oracle password to SSHA512

### 5. Network Connectivity
- **Problem:** ALSM backend couldn't reach mailserver
- **Fixed by:** Connecting ALSM to mail-network
  ```bash
  docker network connect mail-network alsm-backend
  ```

### 6. Environment Variables
- **Problem:** SMTP_HOST needed to be mailserver IP (172.18.0.2)
- **Fixed by:** Added SMTP_* env vars to docker-compose.yml

## Solutions Applied

- ✅ Changed LDAP password scheme to SSHA512 (matching mailserver)
- ✅ Fixed mailserver LDAP host configuration
- ✅ Enabled memberOf plugin in LDAP
- ✅ Connected ALSM backend to mail-network
- ✅ Configured SMTP credentials properly

## Files Modified

| File | Change |
|------|--------|
| `/opt/mail-stack/.env` | LDAP_SERVER_HOST |
| `backend/src/services/ldapClient.js` | SSHA512 hashing |
| `backend/src/services/syncService.js` | memberOf handling |
| `backend/src/routes/invite.js` | altEmail from Authentik |
| `docker-compose.yml` | SMTP env vars |

## Key Commands

```bash
# Enable memberOf plugin
ldapmodify -x -H ldap://192.168.0.200 -D "cn=Directory Manager" -w "PASSWORD"
dn: cn=MemberOf Plugin,cn=plugins,cn=config
changetype: modify
replace: nsslapd-pluginEnabled
nsslapd-pluginEnabled: on

# Refresh memberOf for users
ldapmodify -x -H ldap://192.168.0.200 -D "cn=seer" -w "Kali@1403"
dn: cn=GROUPNAME,ou=groups,dc=spectres,dc=co,dc=za
changetype: modify
delete: member
member: uid=USER,ou=people,dc=spectres,dc=co,dc=za
-
add: member
member: uid=USER,ou=people,dc=spectres,dc=co,dc=za

# Connect ALSM to mail network
docker network connect mail-network alsm-backend
```
