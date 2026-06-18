# AI Detection Word Processor

A sophisticated academic integrity tool that combines GPTZero AI content detection with real-time typing pattern analysis to identify potentially AI-generated student submissions.

## Features

### For Students
- ✍️ Clean, distraction-free writing interface
- 🔒 Paste protection to ensure original typing
- 🔐 Shibboleth SSO authentication (KSU login)
- ✅ Simple submission process

### For Instructors
- 📊 Comprehensive dashboard with all submissions
- 🎯 Dual-layer detection:
  - **GPTZero AI Detection**: Content-based analysis
  - **Typing Pattern Analysis**: Behavioral analysis
- 🚨 Risk scoring (High/Medium/Low)
- 📈 Detailed metrics:
  - AI probability percentage
  - Typing suspicion score
  - Average typing delays
  - Paste event detection
  - Complete keystroke logs
- 🔍 Expandable detailed views
- ⚡ Auto-refresh every 10 seconds

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **Database**: MongoDB
- **Authentication**: Shibboleth SSO
- **AI Detection**: GPTZero API
- **Session Management**: Express-session with MongoDB store

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Start development server (no Shibboleth)
node server.js

# Access application
# Student interface: http://localhost:3000
# Instructor dashboard: http://localhost:3000/instructor.html
```

## Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment instructions for Kennesaw State University infrastructure.

### Quick Production Start

```bash
# 1. Configure environment
cp .env.example .env
nano .env  # Edit with your settings

# 2. Install dependencies
npm install --production

# 3. Start with PM2
pm2 start server-production.js --name ai-detection
pm2 save
```

## Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Server
PORT=3000
NODE_ENV=production

# GPTZero API
GPTZERO_API_KEY=your_api_key_here

# Database
MONGODB_URI=mongodb://localhost:27017/ai-detection

# Shibboleth
SHIBBOLETH_ENABLED=true

# Instructor Access
INSTRUCTOR_EMAILS=prof@kennesaw.edu,ta@kennesaw.edu
```

See `.env.example` for all available options.

## How It Works

### Student Workflow
1. Student logs in via KSU Shibboleth SSO
2. Student types assignment in the word processor
3. Every keystroke is timestamped (invisible to student)
4. Student clicks "Submit Work"
5. Text is analyzed by GPTZero API
6. Typing patterns are analyzed for anomalies
7. All data is stored in database
8. Student receives confirmation

### Instructor Workflow
1. Instructor logs in via KSU Shibboleth SSO
2. Instructor accesses dashboard at `/instructor.html`
3. Dashboard shows all submissions with risk scores
4. Instructor can expand any submission to see:
   - Full text
   - Complete keystroke log with timestamps
   - Typing analytics (delays, bursts, patterns)
   - GPTZero AI detection results
5. Dashboard auto-refreshes every 10 seconds

### Detection Methodology

**AI Content Detection (GPTZero)**:
- Analyzes text for AI-generated patterns
- Returns probability score (0-100%)
- Checks perplexity and burstiness

**Typing Pattern Analysis**:
- Tracks inter-keystroke delays
- Detects paste events
- Identifies burst typing (rapid text entry)
- Calculates consistency metrics
- Flags suspicious patterns

**Combined Risk Scoring**:
- **High Risk**: Both AI detection AND typing patterns indicate AI use
- **Medium Risk**: One indicator suggests AI use
- **Low Risk**: Both indicators show human authorship

## Security Features

- 🔐 Shibboleth SSO authentication
- 🔒 HTTPS/SSL required in production
- 🛡️ Helmet.js security headers
- 🔑 Secure session management
- 👥 Role-based access control (Student/Instructor)
- 📝 Comprehensive logging
- 🗄️ MongoDB with authentication

## API Endpoints

### Student Endpoints
- `GET /` - Student writing interface (authenticated)
- `POST /api/submit-work` - Submit assignment (authenticated)
- `POST /api/check-ai` - GPTZero API proxy (authenticated)

### Instructor Endpoints
- `GET /instructor.html` - Instructor dashboard (instructor only)
- `GET /api/submissions` - Get all submissions (instructor only)

### Authentication Endpoints
- `GET /api/user` - Get current user info
- `GET /logout` - Logout and clear session

## Database Schema

### Submissions Collection

```javascript
{
  _id: ObjectId,
  studentEmail: "jdoe12@students.kennesaw.edu",
  studentDisplayName: "John Doe",
  studentName: "John Doe",  // From input field
  text: "The assignment text...",
  keystrokeLog: [
    { key: "T", timestamp: 1713105600000 },
    { key: "h", timestamp: 1713105600150 },
    ...
  ],
  aiResults: {
    documents: [{
      completely_generated_prob: 0.05,
      average_generated_prob: 0.03,
      ...
    }]
  },
  typingAnalytics: {
    avgDelay: 521,
    suspicionScore: 12,
    pasteCount: 0,
    burstCount: 0,
    ...
  },
  timestamp: "2026-04-14T14:51:00.000Z",
  courseId: "CS-1301-001",
  assignmentId: "essay-1",
  sessionId: "abc123...",
  sessionStartTime: "2026-04-14T14:45:00.000Z"
}
```

## Monitoring

### View Logs

```bash
# PM2 logs
pm2 logs ai-detection

# Follow logs in real-time
pm2 logs ai-detection --lines 100 -f
```

### Monitor Performance

```bash
# PM2 monitoring dashboard
pm2 monit

# Application status
pm2 status
```

## Troubleshooting

### Common Issues

**Students can't submit**:
- Check Shibboleth authentication
- Verify MongoDB connection
- Check GPTZero API key validity

**Instructor dashboard empty**:
- Verify instructor email in INSTRUCTOR_EMAILS
- Check MongoDB for submissions: `db.submissions.find()`
- Check browser console for errors

**API errors**:
- Verify GPTZero API key
- Check API rate limits
- Review server logs

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed troubleshooting.

## License

MIT License - See LICENSE file for details

## Support

For technical support or questions:
- **KSU IT Issues**: Contact KSU IT Help Desk
- **Application Issues**: [Your contact information]
- **GPTZero API**: support@gptzero.me

## Acknowledgments

- GPTZero for AI detection API
- Kennesaw State University IT Department
- Shibboleth Consortium

---

**Version**: 1.0.0  
**Last Updated**: April 14, 2026  
**Maintained by**: [Your Name/Department]
# Deployed Thu Jun 18 15:29:10 CDT 2026
