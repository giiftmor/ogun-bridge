# Authentik LDAP Sync Management UI - Project Scope

## Document Version
- **Version**: 2.0.0
- **Date**: February 25, 2026
- **Author**: System Documentation
- **Project Name**: Authentik LDAP Sync Management UI (ALSM-UI)
- **Status**: Production - Phase 2 Complete

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Project Overview](#project-overview)
3. [Current System Architecture](#current-system-architecture)
4. [Problem Statement](#problem-statement)
5. [Solution Overview](#solution-overview)
6. [Project Scope](#project-scope)
7. [Prerequisites](#prerequisites)
8. [Technical Requirements](#technical-requirements)
9. [Implementation Phases](#implementation-phases)
10. [Deliverables](#deliverables)
11. [Success Criteria](#success-criteria)
12. [Risk Assessment](#risk-assessment)

---

## Executive Summary

### What We're Building
A comprehensive web-based management interface for the Authentik LDAP Sync Service that provides:
- Real-time monitoring and visualization of user/group synchronization
- Schema mapping and validation tools
- Enhanced log viewing with intelligent filtering
- Controlled bidirectional synchronization with approval workflows
- Version control system for user data changes

### Why We're Building It
**Current Pain Points:**
1. **Invalid Attribute Syntax errors** - No visibility into why users fail to sync
2. **Manual debugging** - Need to parse raw logs and check LDAP manually
3. **One-way sync only** - Cannot safely propagate changes from LDAP back to Authentik
4. **No change tracking** - No audit trail or rollback capability
5. **Configuration complexity** - YAML editing is error-prone

### Business Value
- **Reduced debugging time**: From hours to minutes
- **Improved reliability**: Catch errors before they break sync
- **Enhanced security**: Approval workflows prevent unauthorized changes
- **Better audit compliance**: Complete change history with rollback
- **Operational efficiency**: Self-service for common tasks

---

## Project Overview

### Vision
Create a production-ready administrative interface that makes managing identity synchronization between Authentik and LDAP as easy as using a modern SaaS dashboard.

### Mission
Eliminate the complexity of LDAP synchronization while maintaining enterprise-grade security, auditability, and control.

### Core Principles
1. **Safety First**: All destructive operations require approval
2. **Transparency**: Every change is logged and auditable
3. **User-Friendly**: Technical complexity hidden behind intuitive UI
4. **Production-Ready**: Built for reliability and scale
5. **Developer Experience**: Clean code, good documentation, easy to extend

---

## Current System Architecture

### Existing Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Current Infrastructure                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐           ┌──────────────────┐           │
│  │  Authentik   │◄──────────│  Sync Service    │           │
│  │   (Docker)   │    API    │  (Node.js)       │           │
│  │  Port 9000   │           │  Port 3002       │           │
│  └──────────────┘           └────────┬─────────┘           │
│         │                             │                      │
│         │ SAML/OIDC                  │ LDAP Write          │
│         ▼                             ▼                      │
│  ┌──────────────┐           ┌──────────────────┐           │
│  │  Nextcloud   │           │   389 Directory  │           │
│  │   (SAML)     │◄──────────│     Server       │           │
│  └──────────────┘   LDAP    │   Port 389       │           │
│                     Read     └────────┬─────────┘           │
│                                       │                      │
│                              LDAP Read Only                  │
│                                       │                      │
│                      ┌────────────────┼────────────┐        │
│                      ▼                ▼            ▼         │
│              ┌────────────┐  ┌────────────┐  ┌──────────┐  │
│              │ Mailserver │  │  Jellyfin  │  │  Future  │  │
│              │   (LDAP)   │  │   (LDAP)   │  │   Apps   │  │
│              └────────────┘  └────────────┘  └──────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Current Sync Flow
1. **Every 5 minutes** (configurable):
   - Fetch all users from Authentik API
   - Fetch all users from 389 DS LDAP
   - Compare lists
   - Create new users in LDAP
   - Update changed users
   - (Optional) Delete removed users
   - Sync group memberships
   - Log results

### Current Limitations
- ❌ No UI for monitoring
- ❌ No schema validation before sync
- ❌ Errors only visible in logs
- ❌ No way to preview changes
- ❌ One-way sync only (Authentik → LDAP)
- ❌ No change approval workflow
- ❌ No rollback capability
- ❌ Manual log analysis required

---

## Problem Statement

### Primary Issues

#### 1. Invalid Attribute Syntax Error (CURRENT)
```
ldap-sync  | 2026-02-16T16:46:29.718Z [error]: Failed to create LDAP user 
{"username":"akadmin","error":"Invalid Attribute Syntax"}
```

**Root Causes:**
- Missing required LDAP attributes (sn, cn, mail)
- Empty fields from Authentik
- No pre-sync validation
- No visibility into what's being sent to LDAP

#### 2. No Operational Visibility
- Can't see current sync status without checking logs
- No dashboard for system health
- No alerts for failures
- Difficult to diagnose issues

#### 3. Configuration Complexity
- YAML editing required for mapping changes
- No validation until sync runs
- Errors discovered too late
- No way to test changes safely

#### 4. One-Way Synchronization
- Changes in LDAP don't sync back to Authentik
- Manual intervention required for LDAP-side changes
- Risk of data inconsistency
- No way to leverage LDAP tools for bulk operations

#### 5. No Change Control
- No approval process for changes
- No audit trail
- No rollback capability
- Can't track who made what changes

---

## Solution Overview

### Architecture

For the complete system architecture diagram and component details, see [TECHNICAL-ARCHITECTURE-v2.md](./TECHNICAL-ARCHITECTURE-v2.md).

### Key Components

#### 1. React Frontend (Port 3331)
- Modern, responsive UI built with React 18
- Real-time updates via WebSocket
- Component library: shadcn/ui + Tailwind CSS
- State management: Zustand
- Data fetching: React Query

> **Note:** For detailed component specifications, database schema, and API details, see [TECHNICAL-ARCHITECTURE-v2.md](./TECHNICAL-ARCHITECTURE-v2.md).

---

## Project Scope

### In Scope

#### Phase 1: Core UI & Diagnostics (Week 1)
✅ **Dashboard**
- System status overview
- Sync statistics
- Recent activity feed
- Health metrics

✅ **User Browser**
- List all Authentik users
- List all LDAP users
- Side-by-side comparison
- Search and filter

✅ **Schema Mapper**
- Visual field mapping interface
- Attribute validation
- Preview LDAP entry before sync
- Test mapping with live data

✅ **Enhanced Log Viewer**
- Real-time log streaming
- Intelligent log cleaning/formatting
- Filter by severity, user, timestamp
- Search functionality
- Stack trace expansion
- Error highlighting
- Export logs

#### Phase 2: Change Detection (Week 2)
✅ **LDAP Change Listener**
- Monitor LDAP for modifications
- Detect field-level changes
- Track create/update/delete operations
- Generate change events

✅ **Diff Engine**
- Compare Authentik vs LDAP state
- Identify conflicts
- Calculate change deltas
- Generate change proposals

✅ **Change Queue**
- Queue pending changes
- Categorize by risk level
- Associate with source system
- Track change metadata

✅ **Notification System**
- Email alerts for pending approvals
- Webhook support
- In-app notifications
- Configurable alert rules

#### Phase 3: Approval Workflow (Week 3)
🔄 **Approval Interface** - IN PROGRESS
- Review pending changes
- Approve/reject/edit
- Bulk operations
- Comment on changes

❌ **Role-Based Access** - NOT IMPLEMENTED
- Admin: full control
- Reviewer: approve changes
- Viewer: read-only access
- Custom roles

❌ **Version Control** - NOT IMPLEMENTED
- Snapshot user state before changes
- Track all modifications
- Store complete history
- Enable point-in-time recovery

❌ **Rollback System** - NOT IMPLEMENTED
- One-click rollback to previous version
- Preview rollback changes
- Rollback with approval
- Batch rollback support

#### Phase 4: Polish & Production (Week 4)
❌ **Auto-Fix Suggestions** - NOT IMPLEMENTED
- AI-powered error analysis
- Suggest field mappings
- Auto-generate missing values
- One-click fixes

❌ **Conflict Resolution** - NOT IMPLEMENTED
- Visual conflict comparison
- Choose Authentik/LDAP/Manual
- Merge strategies
- Conflict resolution rules

❌ **Configuration Management** - NOT IMPLEMENTED
- Edit sync-config.yaml from UI
- Validate before saving
- Test configuration
- Backup/restore configs

❌ **Documentation** - PARTIAL
- User guide - NOT IMPLEMENTED
- API documentation - IN README.md
- Troubleshooting guide - NOT IMPLEMENTED
- Video tutorials - NOT IMPLEMENTED

### Implemented Beyond Scope
✅ **Password synchronization** - IMPLEMENTED
   - Password sync to LDAP + Authentik
   - Self-service password change
   - Password expiration policies
   - Password history via audit logs

### Out of Scope (Future Enhancements)
❌ Multi-tenant support
❌ LDAP schema designer
❌ Advanced RBAC with custom attributes
❌ Integration with external ticketing systems
❌ Machine learning for change prediction
❌ Multi-language support (i18n)
❌ Mobile apps
❌ Bulk user operations
❌ CSV/JSON export
❌ MFA integration
❌ Session management

---

## Prerequisites

### System Requirements

#### Server
- **OS**: Ubuntu 24.04 LTS (or compatible)
- **CPU**: 2+ cores
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 20GB free space
- **Network**: Static IP or reliable DHCP

#### Software Dependencies
```yaml
Required (must be running):
  - Docker Engine: 24.0+
  - Docker Compose: 2.0+
  - Node.js: 18+ (for development)
  - npm: 9+
  
Running Services:
  - Authentik: latest
  - 389 Directory Server: latest
  - Authentik LDAP Sync Service: 1.0.0+
  
Optional (for development):
  - Git: 2.40+
  - VS Code or similar IDE
```

#### Network Requirements
```yaml
Ports Required:
  - 3331: React UI (HTTP)
  - 3333: Backend API (HTTP + WebSocket)
  - 9000: Authentik (HTTP)
  - 389: LDAP (TCP)
  
Firewall Rules:
  - Allow: Docker network → LDAP (389)
  - Allow: Docker network → Authentik (9000)
  - Allow: Management UI → Backend API (3333)
  - Allow: Users → Frontend (3331)
```

### Access Requirements

#### Credentials Needed
1. **Authentik API Token**
   - Scope: Read/Write Users & Groups
   - Never expires (or set appropriate expiry)
   
2. **LDAP Bind Credentials**
   - DN: cn=Directory Manager,dc=spectres,dc=co,dc=za
   - Password: (existing Directory Manager password)
   
3. **Database Access**
   - SQLite files in `/app/data`
   - File permissions: 644

#### User Accounts
Create these Authentik users for testing:
- Admin user (for UI access)
- Test user 1 (for sync testing)
- Test user 2 (for conflict testing)

### Knowledge Requirements

#### For Administrators
- Basic Docker concepts
- YAML configuration
- LDAP basics (DN, attributes)
- REST API concepts
- Command line comfort

#### For Developers
- JavaScript/Node.js (intermediate)
- React (intermediate)
- REST API design
- LDAP protocol
- Git workflow
- Docker multi-stage builds

---

## Technical Requirements

### Functional Requirements

#### FR-1: User Management
- **FR-1.1**: Display all users from Authentik
- **FR-1.2**: Display all users from LDAP
- **FR-1.3**: Show sync status for each user
- **FR-1.4**: Enable user search and filtering
- **FR-1.5**: Display user details (all attributes)
- **FR-1.6**: Highlight users with sync errors

#### FR-2: Schema Mapping
- **FR-2.1**: Display current field mappings
- **FR-2.2**: Enable mapping modification via UI
- **FR-2.3**: Validate mappings before saving
- **FR-2.4**: Preview LDAP entry for any user
- **FR-2.5**: Test mapping with live data
- **FR-2.6**: Export mapping configuration

#### FR-3: Log Management
- **FR-3.1**: Stream logs in real-time
- **FR-3.2**: Parse and format log entries
- **FR-3.3**: Filter logs by level, user, time
- **FR-3.4**: Search log content
- **FR-3.5**: Expand/collapse stack traces
- **FR-3.6**: Export logs to file

#### FR-4: Change Control
- **FR-4.1**: Detect changes in both systems
- **FR-4.2**: Queue changes for approval
- **FR-4.3**: Display pending approvals
- **FR-4.4**: Enable approve/reject actions
- **FR-4.5**: Comment on changes
- **FR-4.6**: Track approval history

#### FR-5: Version Control
- **FR-5.1**: Snapshot user state before changes
- **FR-5.2**: Display version history
- **FR-5.3**: Compare versions
- **FR-5.4**: Rollback to previous version
- **FR-5.5**: Bulk rollback support

#### FR-6: Monitoring
- **FR-6.1**: Display system health status
- **FR-6.2**: Show sync statistics
- **FR-6.3**: Alert on failures
- **FR-6.4**: Track sync performance
- **FR-6.5**: Display recent activity

### Non-Functional Requirements

#### NFR-1: Performance
- **NFR-1.1**: UI loads in < 2 seconds
- **NFR-1.2**: Real-time log latency < 500ms
- **NFR-1.3**: API responses < 1 second
- **NFR-1.4**: Support 1000+ users
- **NFR-1.5**: Handle 100+ concurrent changes

#### NFR-2: Security
- **NFR-2.1**: Authentication required for all access
- **NFR-2.2**: Role-based authorization
- **NFR-2.3**: Encrypt sensitive data at rest
- **NFR-2.4**: Use HTTPS in production
- **NFR-2.5**: Audit all modifications
- **NFR-2.6**: Secure credential storage

#### NFR-3: Reliability
- **NFR-3.1**: 99.9% uptime
- **NFR-3.2**: Graceful error handling
- **NFR-3.3**: Data integrity validation
- **NFR-3.4**: Transaction rollback on failure
- **NFR-3.5**: Automatic retry for transient errors

#### NFR-4: Maintainability
- **NFR-4.1**: Comprehensive logging
- **NFR-4.2**: Code coverage > 80%
- **NFR-4.3**: API documentation
- **NFR-4.4**: Configuration via environment
- **NFR-4.5**: Database migrations

#### NFR-5: Usability
- **NFR-5.1**: Responsive design (mobile-friendly)
- **NFR-5.2**: Accessible (WCAG 2.1 AA)
- **NFR-5.3**: Intuitive navigation
- **NFR-5.4**: Helpful error messages
- **NFR-5.5**: Contextual help/tooltips

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

#### Objectives
- Set up development environment
- Build core UI framework
- Implement basic monitoring
- Fix current sync error

#### Tasks

**Day 1-2: Environment Setup**
- [ ] Create project repository
- [ ] Set up Docker development environment
- [ ] Configure React app with Vite
- [ ] Install dependencies (see Tech Stack)
- [ ] Set up ESLint + Prettier
- [ ] Create project structure

**Day 3-4: Core UI**
- [ ] Build Dashboard skeleton
- [ ] Implement User Browser
- [ ] Create Schema Mapper interface
- [ ] Add Log Viewer component
- [ ] Implement real-time updates

**Day 5-7: Integration**
- [ ] Build Management API
- [ ] Connect to Authentik API
- [ ] Connect to LDAP
- [ ] Implement WebSocket for logs
- [ ] Test end-to-end flow

#### Deliverables
- ✅ Working UI accessible at http://localhost:3331
- ✅ Dashboard showing live stats
- ✅ User browser with search
- ✅ Schema mapper with validation
- ✅ Real-time log viewer
- ✅ Fixed akadmin sync error

#### Success Criteria
- [ ] Can view all Authentik users
- [ ] Can see which users have sync errors
- [ ] Can test schema mappings
- [ ] Logs update in real-time
- [ ] akadmin user syncs successfully

---

### Phase 2: Change Detection (Week 2)

#### Objectives
- Implement LDAP monitoring
- Build change detection engine
- Create change queue
- Add notification system

#### Tasks

**Day 8-10: LDAP Monitoring**
- [ ] Build LDAP change listener
- [ ] Implement periodic polling
- [ ] Detect field-level changes
- [ ] Track modification timestamps

**Day 11-12: Diff Engine**
- [ ] Compare Authentik vs LDAP
- [ ] Identify conflicts
- [ ] Calculate deltas
- [ ] Generate change proposals

**Day 13-14: Change Queue**
- [ ] Design database schema
- [ ] Implement queue management
- [ ] Add change categorization
- [ ] Build notification system

#### Deliverables
- ✅ LDAP change detection working
- ✅ Change queue populated
- ✅ Email notifications sent
- ✅ Change history tracked

#### Success Criteria
- [ ] Detects LDAP changes within 5 minutes
- [ ] Correctly identifies conflicts
- [ ] Sends notifications for new changes
- [ ] Stores complete change history

---

### Phase 3: Approval Workflow (Week 3)

#### Objectives
- Build approval interface
- Implement version control
- Add rollback capability
- Create role-based access

#### Tasks

**Day 15-17: Approval UI**
- [ ] Create approval queue view
- [ ] Build change review interface
- [ ] Implement approve/reject actions
- [ ] Add comment system
- [ ] Enable bulk operations

**Day 18-19: Version Control**
- [ ] Design version schema
- [ ] Implement snapshots
- [ ] Build version comparison
- [ ] Create history viewer

**Day 20-21: Rollback & RBAC**
- [ ] Implement rollback logic
- [ ] Add role management
- [ ] Create permission system
- [ ] Build audit trail

#### Deliverables
- ✅ Approval interface functional
- ✅ Version control working
- ✅ Rollback tested
- ✅ RBAC implemented

#### Success Criteria
- [ ] Can approve/reject changes from UI
- [ ] Version history shows all changes
- [ ] Rollback restores previous state
- [ ] Roles enforce proper permissions

---

### Phase 4: Production Ready (Week 4)

#### Objectives
- Add auto-fix features
- Implement conflict resolution
- Complete documentation
- Prepare for deployment

#### Tasks

**Day 22-23: Auto-Fix**
- [ ] Build error analyzer
- [ ] Implement fix suggestions
- [ ] Add one-click fixes
- [ ] Create fix templates

**Day 24-25: Conflict Resolution**
- [ ] Build conflict UI
- [ ] Implement merge strategies
- [ ] Add resolution rules
- [ ] Test edge cases

**Day 26-28: Documentation & Deployment**
- [ ] Write user guide
- [ ] Create API docs
- [ ] Record video tutorials
- [ ] Build deployment scripts
- [ ] Production testing

#### Deliverables
- ✅ Auto-fix working for common errors
- ✅ Conflict resolution tested
- ✅ Complete documentation
- ✅ Deployment guide
- ✅ Production-ready release

#### Success Criteria
- [ ] 90%+ of errors have auto-fix
- [ ] Conflicts resolve without data loss
- [ ] Documentation covers all features
- [ ] Successfully deploys to production

---

## Deliverables

### Code Deliverables

```
authentik-ldap-sync-ui/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API clients
│   │   ├── store/           # State management
│   │   └── utils/           # Utility functions
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── backend/                  # Node.js API server
│   ├── src/
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── models/          # Database models
│   │   ├── middleware/      # Express middleware
│   │   ├── utils/           # Utility functions
│   │   └── index.js         # Entry point
│   ├── data/                # SQLite databases
│   └── package.json
│
├── shared/                   # Shared code
│   ├── types/               # TypeScript types
│   └── constants/           # Shared constants
│
├── docker/
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── docker-compose.yml
│
├── docs/
│   ├── USER-GUIDE.md
│   ├── API-DOCUMENTATION.md
│   ├── DEPLOYMENT.md
│   └── TROUBLESHOOTING.md
│
├── scripts/
│   ├── setup.sh            # Initial setup
│   ├── deploy.sh           # Production deployment
│   └── test.sh             # Run tests
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── LICENSE
```

### Documentation Deliverables

1. **USER-GUIDE.md**: Complete user documentation
2. **API-DOCUMENTATION.md**: REST API reference
3. **DEPLOYMENT.md**: Step-by-step deployment guide
4. **TROUBLESHOOTING.md**: Common issues and solutions
5. **ARCHITECTURE.md**: System architecture details
6. **CONTRIBUTING.md**: Development guidelines

### Video Deliverables

1. **Getting Started** (5 min): Setup and first login
2. **User Management** (10 min): Browse and manage users
3. **Schema Mapping** (15 min): Configure field mappings
4. **Approval Workflow** (10 min): Review and approve changes
5. **Troubleshooting** (10 min): Diagnose and fix issues

---

## Success Criteria

### Technical Success Metrics

#### Reliability
- [ ] System uptime > 99.9%
- [ ] Zero data loss incidents
- [ ] < 1% failed syncs
- [ ] All errors logged and alertable

#### Performance
- [ ] Page load time < 2 seconds
- [ ] API response time < 1 second
- [ ] Real-time updates < 500ms delay
- [ ] Support 1000+ users without degradation

#### Quality
- [ ] Code coverage > 80%
- [ ] Zero critical security issues
- [ ] All user stories tested
- [ ] Documentation complete

### User Success Metrics

#### Usability
- [ ] Users can diagnose errors in < 5 minutes
- [ ] 90% of tasks completable without documentation
- [ ] < 5% support tickets related to UI
- [ ] Positive user feedback (>4/5 rating)

#### Productivity
- [ ] 80% reduction in manual troubleshooting time
- [ ] 90% of changes approved within 24 hours
- [ ] Zero manual YAML edits required
- [ ] 95% of errors auto-fixed

### Business Success Metrics

#### Adoption
- [ ] 100% of administrators use UI daily
- [ ] < 1 hour training time required
- [ ] Zero resistance to using new system
- [ ] Positive ROI within 1 month

#### Impact
- [ ] 50% reduction in sync-related incidents
- [ ] 75% faster issue resolution
- [ ] Improved audit compliance
- [ ] Enhanced security posture

---

## Risk Assessment

### Technical Risks

#### Risk 1: Database Corruption
- **Probability**: Low
- **Impact**: High
- **Mitigation**: 
  - Regular automated backups
  - Transaction rollback on errors
  - Validation before writes
  - Recovery procedures documented

#### Risk 2: LDAP Connection Loss
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**:
  - Automatic retry with backoff
  - Connection pooling
  - Health checks
  - Graceful degradation

#### Risk 3: Change Conflicts
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**:
  - Conflict detection algorithm
  - Manual resolution UI
  - Change locking
  - Clear conflict rules

#### Risk 4: Performance Degradation
- **Probability**: Low
- **Impact**: Medium
- **Mitigation**:
  - Pagination for large datasets
  - Caching strategy
  - Database indexing
  - Performance monitoring

### Project Risks

#### Risk 5: Scope Creep
- **Probability**: High
- **Impact**: High
- **Mitigation**:
  - Clear phase boundaries
  - Feature freeze dates
  - Prioritization framework
  - Regular scope reviews

#### Risk 6: Timeline Slippage
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**:
  - Daily standups
  - Clear milestones
  - Buffer time in schedule
  - MVP-first approach

#### Risk 7: Skill Gaps
- **Probability**: Low
- **Impact**: Medium
- **Mitigation**:
  - Comprehensive documentation
  - Code comments
  - Pair programming
  - Knowledge sharing sessions

### Security Risks

#### Risk 8: Unauthorized Access
- **Probability**: Low
- **Impact**: Critical
- **Mitigation**:
  - Strong authentication
  - Role-based access control
  - Audit logging
  - Regular security reviews

#### Risk 9: Data Exposure
- **Probability**: Low
- **Impact**: Critical
- **Mitigation**:
  - Encryption at rest
  - HTTPS in production
  - Secure credential storage
  - Least privilege principle

---

## Appendix

### Tech Stack Details

The complete tech stack is documented in [README.md](./README.md#tech-stack).

### Environment Variables

Environment variables are documented in [README.md](./README.md#environment-variables).

### Database Schema

The complete PostgreSQL database schema is documented in [TECHNICAL-ARCHITECTURE-v2.md](./TECHNICAL-ARCHITECTURE-v2.md#database-design).

---

## Optional Improvements

These features are **not required** for core functionality but can enhance the system. See [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md#optional-improvements) for the complete list.

### Priority Additions
1. **Keyboard Shortcuts** - Press `/` to focus search, `Esc` to close modals
2. **Role-Based Access Control** - Admin/Reviewer/Viewer roles
3. **Multi-Language Support** - i18n for internationalization
4. **Export Functionality** - CSV/JSON export for data
5. **Form Validation** - react-hook-form + zod

### Future Considerations
- Version control and rollback
- Conflict resolution UI  
- MFA integration
- Audit log retention policies
- LDAP group hierarchy visualization
- Calendar-based sync scheduling

---

## Next Steps

For the latest implementation status and next steps, see [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md).

---

**Document Control**
- Version: 2.1.0 (March 10, 2026)
- Previous Version: 2.0.0 (February 25, 2026)
- Next Review: Monthly
- Owner: Development Team
- Status: **Phase 1-2 Complete, Phase 3-4 Pending**

> **Note:** For the current implementation status, see [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md).

---

*End of Project Scope Document*
