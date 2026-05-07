# LDAP Password Management - Technical Documentation

## Overview

This document describes the password management implementation in Ogun Bridge, including how passwords are set and verified in the LDAP directory server (389 Directory Server).

## Architecture

### Components Involved

| Component | Purpose |
|-----------|---------|
| Backend API | Handles password sync requests |
| LDAP Client | Connects to 389 Directory Server |
| Authentik | Identity provider for SSO |
| PostgreSQL | Local user database |

### Bind DN Configuration

The application connects to LDAP using the following credentials:

```
LDAP_HOST=192.168.0.200
LDAP_PORT=389
LDAP_BIND_DN=cn=seer
LDAP_BIND_PASSWORD=Kali@1403
LDAP_BASE_DN=dc=spectres,dc=co,dc=za
```

**Note:** The Bind DN `cn=seer` is how 389 Directory Server was configured during setup. This is a valid server admin user.

## Password Operations

### 1. Setting Passwords

**Endpoint:** `POST /api/password/sync/:username`

**Flow:**
```
1. Receive new password from request
2. Generate SSHA hash (SHA-1 + salt)
3. Update userPassword attribute in LDAP
4. Set password expiration (optional)
5. Sync to Authentik
```

**Hash Format:** `{SSHA}<digest>==<salt>`

Example stored value:
```
{SSHA}abcdefghijklmno==YXNkZg==
```

**Code Location:** `backend/src/services/ldapClient.js` - `setUserPassword()`

### 2. Verifying Passwords

**Verification Method:** LDAP Bind

The application verifies passwords by attempting to bind to LDAP with the user's credentials. This is the standard and most secure way to verify passwords in LDAP.

**Flow:**
```
1. Create temporary LDAP client
2. Attempt bind with: uid=<username>,ou=people,<baseDN> + password
3. If bind succeeds → password is valid
4. If bind fails (invalid credentials) → password is invalid
```

**Why Bind Instead of Compare:**
- The `compare` operation requires elevated permissions (Directory Manager level)
- The `cn=seer` user only has write permission for their own password, not compare permission
- Bind is the standard way LDAP servers verify passwords
- The server handles the hash comparison internally

**Error Codes:**
| Code | Meaning |
|------|----------|
| 0x31 | Invalid credentials (wrong password) |
| 0x32 | Insufficient rights (for compare operation) |

**Code Location:** `backend/src/services/ldapClient.js` - `verifyPassword()`

## Password Hash Format

### SSHA (Salted SHA-1)

389 Directory Server uses SSHA by default:

```
{SSHA}<base64-digest>==<base64-salt>
```

- **Algorithm:** SHA-1 with random 4-byte salt
- **Format:** `{SSHA}` prefix
- **Security:** Better than plain SHA-1 due to salting

### Legacy: Bcrypt (Not Used)

The original implementation used bcrypt but this was replaced because:
- bcrypt hashes in LDAP don't work with simple bind verification
- SSHA is the LDAP standard and more compatible

## Security Considerations

### 1. Access Control

- The `cn=seer` Bind DN has write permission for user passwords
- Cannot use LDAP compare (requires Directory Manager)
- Verification uses bind which the server handles securely

### 2. Password Storage

- Passwords are NEVER stored in plaintext
- SSHA hash includes random salt per password
- Original password cannot be recovered from the hash

### 3. Transport Security

- LDAP connections should use TLS in production
- Configure `LDAP_PORT=636` for LDAPS

## Troubleshooting

### "Insufficient rights" Error (0x32)

This occurs when trying to use LDAP compare without elevated permissions.

**Solution:** Use bind-based verification (now the default).

### "Invalid credentials" Error (0x31)

The user's password is incorrect. This is expected behavior for wrong passwords.

### Password Verified but Login Fails

1. Check Authentik password sync status
2. Verify LDAP password is set: `ldapsearch -H ldap://<host> -D "cn=seer,..." -w "<pass>" -b "<user-dn>" userPassword`
3. Check password sync logs in the application

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/password/sync/:username` | POST | Set + sync password |
| `/api/password/verify/:username` | POST | Verify password |
| `/api/password/expiration/:username` | GET | Get expiration |
| `/api/password/history/:username` | GET | Get history |

## File Locations

- **LDAP Client:** `backend/src/services/ldapClient.js`
- **Password Routes:** `backend/src/routes/password.js`
- **Auth Routes:** `backend/src/routes/auth.js`
- **Environment:** `.env`

## References

- [389 Directory Server Documentation](https://directory.fedoraproject.org/)
- [LDAP Password Best Practices](https://tools.ietf.org/html/rfc2307)
- [SSHA Algorithm](https://tools.ietf.org/html/rfc2307#section-3)