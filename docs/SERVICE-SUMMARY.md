# Small Business Infrastructure Stack

A comprehensive self-hosted solution for small to medium businesses with limited technological resources.

---

## Overview

This infrastructure consists of three main stacks that work together to provide enterprise-grade capabilities at a fraction of the cost of commercial solutions:

| Stack | Purpose | Key Services |
|-------|---------|--------------|
| **ALSM** | Identity & Access Management | User sync, password management, LDAP integration |
| **Mail Stack** | Email Services | Full-featured mail server with spam protection |
| **App Stack** | Business Applications | SSO, file storage, automation, media, monitoring |

---

## Service Connections

```
                                    ┌─────────────────┐
                                    │   External      │
                                    │   Users         │
                                    └────────┬────────┘
                                             │
                                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTIK (SSO/IdP)                                │
│                    Central Authentication Gateway                            │
│                    Ports: 9000 (HTTP), 9443 (HTTPS)                          │
└─────────────────────────────┬────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │  Nextcloud  │    │     n8n     │    │  Grafana    │
   │   (Files)   │    │ (Automation)│    │ (Monitoring)│
   └─────────────┘    └─────────────┘    └─────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
   ┌─────────────────────────────────────────────────────────┐
   │                  LDAP Directory Server                 │
   │            (User/Group Authentication Source)           │
   └─────────────────────────┬───────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │  ALSM UI    │    │ Mail Server  │    │  Jellyfin   │
   │   (Port     │    │   (Port      │    │   (Media)   │
   │   3331)     │    │   25,587,993)│    │             │
   └─────────────┘    └─────────────┘    └─────────────┘
```

### Authentication Flow

1. **User Access**: User accesses any service (Nextcloud, n8n, Jellyfin, etc.)
2. **SSO Redirect**: Service redirects to Authentik for authentication
3. **LDAP Verification**: Authentik validates credentials against LDAP directory
4. **Access Granted**: User gains access to requested service
5. **ALSM Management**: Administrators use ALSM to manage users and sync with LDAP

---

## Stack Details

### 1. ALSM (Authentik LDAP Sync Management)

**Ports**: Frontend 3331, Backend 3333

**Purpose**: Unified interface for managing user synchronization between Authentik and LDAP

**Key Features**:
- Bidirectional user/group synchronization between Authentik and LDAP
- Real-time monitoring dashboard with WebSocket updates
- Password management (sync, self-service change, expiration policies)
- Approval workflow for pending changes
- Complete audit logging
- Schema mapping configuration

**Tech Stack**: React 18, Node.js/Express, PostgreSQL, LDAP

### 2. Mail Stack

**Ports**: SMTP 25/587, IMAP 143/993

**Purpose**: Full-featured email server with LDAP authentication

**Key Features**:
- IMAP/SMTP with TLS encryption
- LDAP authentication (users from directory)
- Spam filtering (SpamAssassin)
- Virus scanning (ClamAV)
- DKIM, DMARC, SPF authentication
- Fail2ban intrusion prevention
- Unlimited domains and mailboxes

**Integration**: Uses the same LDAP directory as App Stack - no separate user management needed

### 3. App Stack (Excluding Arr Stack)

#### Identity & Access

| Service | Port | Purpose |
|---------|------|---------|
| **Authentik** | 9000/9443 | SSO/IdP - Single Sign-On for all services |
| **Authentik LDAP** | 3389/6636 | LDAP bridge for external services |

#### Collaboration & Productivity

| Service | Port | Purpose |
|---------|------|---------|
| **Nextcloud** | 8443 | Self-hosted cloud storage, calendar, contacts, office documents |
| **n8n** | 5678 | Workflow automation (similar to Zapier) |

#### Media & Entertainment

| Service | Port | Purpose |
|---------|------|---------|
| **Jellyfin** | 8096 | Self-hosted media server for movies, TV, music |

#### Monitoring & Observability

| Service | Port | Purpose |
|---------|------|---------|
| **Prometheus** | 9190 | Metrics collection and time-series database |
| **Grafana** | 3001 | Dashboards and visualization |
| **Loki** | 3100 | Log aggregation |
| **Promtail** | - | Log shipping to Loki |

#### Utilities

| Service | Port | Purpose |
|---------|------|---------|
| **Webserver** | 8080 | PHP/Apache web server |

---

## Benefits for Small to Medium Businesses

### 1. Cost Reduction

| Commercial Alternative | Self-Hosted Solution | Approximate Savings |
|------------------------|---------------------|---------------------|
| Google Workspace ($12+/user) | Entire stack | 90%+ |
| Okta SSO ($2+/user) | Authentik | 100% |
| Dropbox/OneDrive ($10+/user) | Nextcloud | 80%+ |
| Zapier ($20+/user) | n8n | 80%+ |
| Office 365 Email ($8+/user) | Mail Stack | 85%+ |
| Netflix/Streaming | Jellyfin | 100% |

### 2. No Vendor Lock-In

- All data stays on your infrastructure
- Export capabilities for all services
- Standard protocols (LDAP, IMAP, SMTP, OIDC)
- Avoid annual price increases

### 3. Unified Identity Management

- Single set of credentials for all services
- Centralized user management via ALSM
- Automatic provisioning/deprovisioning
- Password policies enforced across all applications

### 4. Automation Capabilities

With n8n, automate:
- New user onboarding workflows
- Email notifications and alerts
- Data backup routines
- Third-party service integrations
- Business process automation

### 5. Professional Email

- Custom domain email (@yourcompany.com)
- Full control over email data
- No email storage limits
- Professional features: calendars, contacts, documents

### 6. Collaboration Suite

Nextcloud provides:
- File sync and sharing
- Video conferencing
- Calendar and contacts
- Document editing (Collabora)
- Team collaboration tools

### 7. Monitoring & Reliability

Prometheus + Grafana + Loki provide:
- System health dashboards
- Service uptime monitoring
- Log aggregation and searching
- Alert notifications
- Capacity planning

---

## Getting Started

### Prerequisites

- Linux server (2+ cores, 4GB+ RAM, 100GB+ storage)
- Docker and Docker Compose
- Domain name with DNS access

### Basic Setup Sequence

1. **Configure LDAP** - Set up your user directory
2. **Deploy Authentik** - Install SSO/IdP first
3. **Deploy Mail Stack** - Configure email with LDAP auth
4. **Deploy App Stack** - Add desired services
5. **Deploy ALSM** - Set up user management interface

### Network Requirements

| Service | External Port | Protocol |
|---------|---------------|----------|
| HTTP/HTTPS | 80/443 | TCP |
| SMTP | 25 | TCP |
| SMTP Submission | 587 | TCP |
| IMAPS | 993 | TCP |

---

## Security Considerations

- All services behind SSO with LDAP authentication
- Fail2ban protects against brute force
- Regular security updates via container images
- TLS encryption for all external traffic
- Regular backups recommended

---

## Summary

This infrastructure stack provides small to medium businesses with:

- **Enterprise-grade identity management** without enterprise costs
- **Complete data sovereignty** - all information stays on your servers
- **Unified user experience** - single login for all services
- **Scalable architecture** - add services as needed
- **Automation capabilities** - reduce manual work with n8n
- **Professional communication** - custom domain email

For businesses with limited technological resources, this stack offers a practical alternative to expensive SaaS subscriptions while maintaining professional-grade capabilities.
