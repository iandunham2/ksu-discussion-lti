# Technical Requirements for AI Detection Word Processor

**Project**: Academic Integrity Monitoring Tool  
**Contact**: Ian Dunham (idunham@kennesaw.edu)

---

## Infrastructure Requirements

**Web Server**:
- Node.js 20 LTS runtime
- 2 CPU cores, 4 GB RAM minimum
- 20 GB storage
- SSL certificate for *.kennesaw.edu domain (suggested: ai-detection.kennesaw.edu or integrity.kennesaw.edu)
- Standard uptime (8am-10pm ET, Mon-Fri minimum)

**Database**:
- MongoDB (or compatible document database)
- 10 GB storage minimum
- Daily automated backups with 30-day retention
- Two collections: `submissions` (student work, AI results, keystroke logs) and `sessions` (authentication sessions)

**Authentication**:
- KSU Microsoft Azure AD SSO integration (OAuth 2.0 / OpenID Connect)
- Azure AD app registration or use existing KSU tenant app
- Redirect URI: `https://[app-url].kennesaw.edu/auth/callback`
- User attributes needed: email, display name
- Role-based access control (students vs. instructors via email whitelist)

---

## Network & Security

**External API Access**:
- Outbound HTTPS (port 443) to `api.gptzero.me` for AI detection
- Rate limiting: ~10 requests/minute per user
- API key stored as secure environment variable (provided by department, not UITS)

**Security Requirements**:
- HTTPS/TLS 1.2+ for all connections
- Student data encrypted at rest
- Secure session cookies (HttpOnly, Secure, SameSite)
- Application logs retained 90 days
- FERPA-compliant data handling (no student data leaves KSU except GPTZero API calls)

---

## Deployment

**Source Code**: Provided via GitHub or KSU GitLab  
**Runtime**: Node.js with Express.js framework  
**Dependencies**: Managed via npm (package.json included)  
**Configuration**: Environment variables for Azure AD credentials, MongoDB URI, API keys  
**Deployment Method**: Standard Node.js (PM2, Docker, or UITS preference)  
**Estimated Setup Time**: 8-16 hours initial deployment  
**Ongoing Support**: Standard UITS application support, monitoring, backups

---

**All source code, documentation, and security assessments available upon request.**
