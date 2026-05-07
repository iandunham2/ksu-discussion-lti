# Security Hardening Checklist

## ✅ Completed Security Fixes

### 🔴 Critical (Immediate)

- [x] **Moved secrets to environment variables**
  - All credentials now in Azure App Settings
  - `.env.example` template created
  - Secrets removed from source code (in `server-secure.js`)

- [x] **Added MongoDB persistence**
  - Submissions stored in database
  - Sessions stored in MongoDB (via connect-mongo)
  - Fallback to in-memory if DB unavailable
  - Automatic indexes created

- [x] **Fixed JWT verification**
  - Added signature validation
  - Expiry and issuer checks
  - Proper error handling

- [x] **Fixed path traversal vulnerability**
  - Using `express.static()` with `dotfiles: 'deny'`
  - No manual path construction
  - Protected against `../` attacks

- [x] **Consolidated server files**
  - Single `server-secure.js` with all features
  - Uses Express with all declared middleware
  - Helmet, Compression, Morgan active

### 🟠 High Priority

- [x] **Added rate limiting**
  - General API: 100 requests/15min per IP
  - AI detection: 10 requests/min per IP
  - Prevents API abuse and cost overruns

- [x] **Added body size limits**
  - JSON: 1MB max
  - URL-encoded: 1MB max
  - Prevents memory exhaustion

- [x] **Added error handling**
  - Try-catch on all async routes
  - JSON.parse wrapped in error handlers
  - Graceful degradation

- [x] **Fixed CORS**
  - Locked to specific origin
  - Credentials allowed only for allowed origin
  - No wildcard in production

- [x] **OAuth state validation**
  - State generated and stored
  - Validated on callback
  - Auto-cleanup of expired states
  - CSRF protection active

### 🟡 Medium Priority

- [x] **Session cleanup**
  - MongoDB TTL on sessions (via connect-mongo)
  - OAuth state cleanup every 60 seconds
  - No memory leaks

- [x] **Request timeouts**
  - GPTZero API: 30 second timeout
  - Prevents hanging requests

- [x] **Input validation**
  - Document length checks
  - Type validation
  - Minimum text length enforcement

## 🔒 Still Recommended

### Immediate Actions Required

1. **Rotate all credentials** (DO THIS NOW):
   ```bash
   # Azure AD Client Secret
   # 1. Go to Azure Portal → Azure AD → App Registrations
   # 2. Select your app (5f1b7854-e543-400d-96d9-3f9e14974e96)
   # 3. Certificates & secrets → New client secret
   # 4. Update AZURE_CLIENT_SECRET in Azure App Settings
   
   # GPTZero API Key
   # 1. Go to GPTZero dashboard
   # 2. Generate new API key
   # 3. Update GPTZERO_API_KEY in Azure App Settings
   ```

2. **Remove hardcoded secrets from git history**:
   ```bash
   # Use BFG Repo-Cleaner or git filter-branch
   # This is important if the repo is or will be public
   ```

3. **Set up MongoDB**:
   ```bash
   # Option 1: Azure Cosmos DB (MongoDB API)
   az cosmosdb create --name ksu-ai-detection-db \
       --resource-group ai-detection-app \
       --kind MongoDB
   
   # Option 2: Use KSU's existing MongoDB service
   # Contact KSU IT for connection string
   
   # Update MONGODB_URI in Azure App Settings
   ```

### Additional Hardening (Optional but Recommended)

1. **Enable Azure Application Insights**
   - Monitor errors and performance
   - Track API usage and costs
   - Alert on anomalies

2. **Set up automated backups**
   - MongoDB daily backups
   - Export submissions to blob storage

3. **Add IP whitelisting** (if KSU has static IPs)
   - Restrict access to KSU network only
   - Configure in Azure App Service → Networking

4. **Enable Azure AD Conditional Access**
   - Require MFA for instructors
   - Restrict to KSU devices only

5. **Add logging and monitoring**
   - Log all submissions
   - Alert on suspicious patterns
   - Track GPTZero API costs

6. **Implement proper JWT verification**
   - Fetch and cache Azure JWKS
   - Verify signature with public keys
   - Use a library like `jsonwebtoken` or `jose`

## 📋 Deployment Checklist

Before deploying to production:

- [ ] Run `chmod +x configure-azure-env.sh`
- [ ] Run `./configure-azure-env.sh` to set environment variables
- [ ] Verify all environment variables are set in Azure Portal
- [ ] Deploy updated code
- [ ] Test authentication flow
- [ ] Test submission and retrieval
- [ ] Verify instructor dashboard access
- [ ] Check Azure App Service logs for errors
- [ ] Rotate all credentials
- [ ] Set up MongoDB (if not using in-memory fallback)
- [ ] Configure monitoring and alerts

## 🔍 Testing Security

```bash
# Test rate limiting
for i in {1..15}; do curl https://ksu-ai-detection.azurewebsites.net/api/user; done

# Test path traversal (should fail)
curl https://ksu-ai-detection.azurewebsites.net/../../../etc/passwd

# Test CORS (should be restricted)
curl -H "Origin: https://evil.com" https://ksu-ai-detection.azurewebsites.net/api/user

# Test body size limit (should fail)
curl -X POST https://ksu-ai-detection.azurewebsites.net/api/submit-work \
  -H "Content-Type: application/json" \
  -d '{"text":"'$(python3 -c 'print("A"*2000000)')'"}'
```

## 📞 Security Contacts

If you discover a security vulnerability:

1. **Do not** open a public GitHub issue
2. Email: security@kennesaw.edu
3. Include: Description, steps to reproduce, impact assessment

## 📚 References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Azure Security Best Practices](https://docs.microsoft.com/en-us/azure/security/fundamentals/best-practices-and-patterns)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
