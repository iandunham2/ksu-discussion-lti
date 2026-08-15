# AI-Monitored Discussion Tool

An LTI 1.1 discussion board for D2L Brightspace. Student posts are analyzed by the **Sapling AI detector** and monitored with real-time typing analytics to help instructors spot potentially AI-generated submissions.

## Features

### For Students
- ✍️ Clean, distraction-free discussion composer
- 🔒 Paste protection in the main editor (typing must be original)
- 📋 Optional "Paste Field" per post for links, images, and pasted references
- 🔐 LTI 1.1 launch authentication from D2L
- ✅ Write new posts and reply to classmates

### For Instructors
- 📊 Dashboard with all posts in the course
- 🎯 Dual-layer detection:
  - **Sapling AI Detection**: content-based AI probability
  - **Typing Pattern Analysis**: behavioral keystroke analytics
- 🚨 Risk scoring (High / Medium / Low)
- 📈 Detailed metrics per post:
  - AI probability percentage
  - Typing suspicion score
  - Correction ratio
  - Paste event detection
  - Suspicious refocuses and WPM spikes
- 🏷️ Per-discussion labels (instructor can rename each module)
- 🔍 Expandable post detail views
- ⚡ Dashboard auto-refreshes every 15 seconds

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **Database**: MongoDB
- **LTI Launch**: LTI 1.1 (OAuth 1.0a signature validation via `ims-lti`)
- **AI Detection**: Sapling API
- **Session Management**: Express-session with MongoDB store

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your LTI key/secret, Sapling key, MongoDB URI, etc.

# Start the development server
node server.js

# Access
curl http://localhost:3000/health
```

## Production Deployment

For admin/operations details, see [`DEVELOPER-NOTES.md`](DEVELOPER-NOTES.md).

### Quick Production Start

```bash
# 1. Configure environment
cp .env.example .env
nano .env

# 2. Install dependencies
npm install --production

# 3. Start the server
node server.js
```

### Render (free tier)

Use the included `render.yaml` blueprint. Set these in the Render dashboard:

- `LTI_CONSUMER_KEY`
- `LTI_CONSUMER_SECRET`
- `SAPLING_API_KEY`
- `MONGODB_URI`
- `SESSION_SECRET` (let Render auto-generate)

## Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=production

# LTI 1.1 credentials (must match the values in D2L)
LTI_CONSUMER_KEY=your_key
LTI_CONSUMER_SECRET=your_secret

# Allowed Brightspace frame ancestors
LTI_FRAME_ANCESTORS=https://your-school.brightspace.com,https://*.view.usg.edu

# Sapling AI detector (free account at https://sapling.ai/ai-content-detector)
SAPLING_API_KEY=your-sapling-api-key

# Database
MONGODB_URI=mongodb://localhost:27017/ksu-discussion

# Session cookie secret
SESSION_SECRET=a-long-random-string
```

See `.env.example` for all available options.

### Discussion mapping (`discussions.json`)

Discussion topic IDs, link titles, instruction HTML, and allowed options are loaded from `discussions.json` at startup. Edit this file to add or change course/topic mappings without touching code.

```json
{
  "topicIdToDisc": {
    "62324565": "3300-disc0"
  },
  "titleToDisc": {
    "Module 1 Discussion": "3340-mod1"
  },
  "instructions": {
    "3300-disc0": "<h3>Discussion 0: Introduce Yourself</h3><p>...</p>"
  },
  "initialPostDue": {
    "4424-disc0": "2026-08-28T03:59:00.000Z"
  },
  "blockedDiscPrefixes": ["3340-"],
  "discOptions": [
    { "value": "3300-disc0", "label": "Discussion 0" },
    { "value": "3300-disc1", "label": "Discussion 1" }
  ]
}
```

`initialPostDue` is optional. When set, the tool will reject new top-level posts after the configured timestamp while still allowing replies until the D2L topic's own due date. Discussions with no `initialPostDue` entry are unaffected.

`discussion-config.js` exposes `resolveDisc`, `discFromTitle`, `getInstructions`, `getInitialPostDue`, and `getDiscOptions`, so the server can be configured for any course without code changes.

### Content Security Policy

The `frame-ancestors` CSP directive is driven by the `LTI_FRAME_ANCESTORS` environment variable (comma-separated list of Brightspace hostnames). If not set, only the tool's own origin can frame it.

```bash
LTI_FRAME_ANCESTORS=https://kennesaw.view.usg.edu,https://*.view.usg.edu
```

## How It Works

### Student Workflow

1. Student clicks the LTI link in a D2L module.
2. D2L launches the student into the tool via an LTI 1.1 POST, passing name, email, role, and course context.
3. Student writes a post in the composer; every keystroke is timestamped.
4. On submit, the text is sent to the Sapling AI detector (if the post is long enough).
5. Keystroke timing, paste attempts, focus/refocus behavior, and the Sapling score are combined into a composite risk score.
6. The post is stored in MongoDB and the student sees the updated thread.

### Instructor Workflow

1. Instructor clicks the same LTI link.
2. The instructor dashboard loads all posts for that course context.
3. Select a module, thread, or risk level to filter.
4. Expand any post to see full text, AI probability, and typing analytics.
5. Click ✏️ Rename to give a discussion link a meaningful display label.

### Risk Scoring

- **High Risk**: Both Sapling AI detection and typing patterns indicate AI use.
- **Medium Risk**: One indicator is suspicious.
- **Low Risk**: Both indicators suggest human authorship.

## Security Features

- 🔐 LTI 1.1 OAuth-signature validation
- 🔒 HTTPS/SSL required in production
- 🛡️ Helmet.js security headers
- 🌐 Configurable frame ancestors and CORS
- 🔑 Secure session management with MongoDB-backed stores
- 👥 Role-based access control (Student/Instructor from LTI roles)
- 📝 Redacted, timestamped logging via `d2l-shared`
- 🗄️ MongoDB with authentication

## API Endpoints

### Student Endpoints

- `GET /discussion?disc=...` — Student discussion view (requires LTI session)
- `GET /api/posts` — Get posts for the current module
- `POST /api/posts` — Submit a new post or reply
- `POST /api/save-draft` — Save a draft
- `GET /api/load-draft` — Load the current user's draft

### Instructor Endpoints

- `GET /instructor.html` — Instructor dashboard (instructor only)
- `GET /api/instructor/posts` — Get posts for the course (instructor only)
- `POST /api/instructor/grade` — Send a grade back to D2L (instructor only)
- `POST /api/instructor/discussion-label` — Rename a discussion link (instructor only)
- `POST /api/instructor/discussion-instructions` — Update instructions for a discussion (instructor only)

### Other Endpoints

- `GET /health` — Render health check
- `GET /` — Dev mode landing page
- `POST /lti/launch` — LTI 1.1 launch handler

## Monitoring

```bash
# View logs (if using PM2)
pm2 logs ksu-discussion-lti

# Or follow Node stdout/stderr directly
node server.js | tee -a app.log
```

## Troubleshooting

See [`INSTRUCTOR-GUIDE.md`](INSTRUCTOR-GUIDE.md) for instructor-facing issues and setup steps.

### Common Issues

**Students see "LTI launch validation failed"**
- Verify that the Consumer Key and Consumer Secret in D2L match the app environment exactly.
- Confirm the LTI link URL is `https://<your-host>/lti/launch`.

**Students can see other modules' posts**
- Verify each module has its own LTI link (each gets a unique `resource_link_id` in D2L).

**Instructor dashboard is empty**
- Confirm the D2L launch sends the instructor role.
- Check that `contextTitle` from the launch matches the course.

**AI detection not running**
- Verify `SAPLING_API_KEY` is set.
- Posts shorter than ~50 characters are not sent to Sapling.

## License

MIT License — See the LICENSE file for details.

## Support

For technical support or questions:
- **KSU IT Issues**: Contact KSU IT Help Desk
- **Application Issues**: [Your contact information]
- **Sapling API**: https://sapling.ai

---

**Version**: 2.3.9  
**Last Updated**: August 5, 2026  
