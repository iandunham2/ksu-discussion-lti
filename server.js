'use strict';

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const lti = require('ims-lti');
const {
    CORRECT_3300_INSTRUCTIONS,
    resolveDisc,
    discFromTitle,
} = require('./discussion-config.js');

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// ======================
// CONFIGURATION
// ======================

const config = {
    lti: {
        consumerKey: process.env.LTI_CONSUMER_KEY || 'ksu-discussion-tool',
        consumerSecret: process.env.LTI_CONSUMER_SECRET || 'dev-secret-change-in-production'
    },
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
    },
    session: {
        secret: process.env.SESSION_SECRET || 'dev-session-secret-change-in-production'
    },
    sapling: {
        apiKey: process.env.SAPLING_API_KEY || ''
    },
    instructorRoles: ['Instructor', 'Administrator', 'TeachingAssistant', 'ContentDeveloper', 'urn:lti:role:ims/lis/Instructor', 'urn:lti:instrole:ims/lis/Administrator']
};

if (isDev) {
    console.warn('⚠️  Running in DEV mode — LTI signature validation relaxed');
}

// ======================
// DATABASE SETUP
// ======================

let db, postsCollection, draftsCollection, outcomesCollection, discussionLabelsCollection, discMappingsCollection;
const mongoClient = new MongoClient(config.mongodb.uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
});

async function connectDatabase() {
    try {
        await mongoClient.connect();
        db = mongoClient.db('ksu-discussion');
        postsCollection = db.collection('posts');
        draftsCollection = db.collection('drafts');
        outcomesCollection = db.collection('outcomes');
        discussionLabelsCollection = db.collection('discussionLabels');
        discMappingsCollection = db.collection('discMappings');

        await postsCollection.createIndex({ contextId: 1, timestamp: -1 });
        await postsCollection.createIndex({ resourceLinkId: 1, timestamp: -1 });
        await postsCollection.createIndex({ parentId: 1 });
        await postsCollection.createIndex({ authorEmail: 1 });
        await draftsCollection.createIndex({ userEmail: 1, resourceLinkId: 1 }, { unique: true });
        await outcomesCollection.createIndex({ userId: 1, resourceLinkId: 1 }, { unique: true });
        await discussionLabelsCollection.createIndex({ resourceLinkId: 1 }, { unique: true });
        await discMappingsCollection.createIndex({ resourceLinkId: 1 }, { unique: true });

        console.log('✅ MongoDB connected');
    } catch (error) {
        console.warn('⚠️  MongoDB connection failed, using in-memory storage:', error.message);
        global.inMemoryPosts = [];
        global.inMemoryDrafts = {};
    }
}

// ======================
// MIDDLEWARE
// ======================

// Trust Render/Heroku reverse proxy for secure cookies
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    frameguard: false // LTI launches in an iframe
}));
app.use(compression());
app.use(morgan('short'));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const sessionConfig = {
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: !isDev,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: isDev ? 'lax' : 'none' // 'none' required for iframe in production
    }
};

if (!isDev) {
    sessionConfig.store = MongoStore.create({
        mongoUrl: config.mongodb.uri,
        dbName: 'ksu-discussion',
        collectionName: 'sessions',
        ttl: 24 * 60 * 60
    });
}

app.use(session(sessionConfig));

// ======================
// LTI TOKEN STORE (Safari ITP workaround)
// iOS Safari blocks third-party cookies in iframes even with SameSite=None.
// We issue a short-lived token after launch and embed it in the redirect URL.
// The client sends it as X-LTI-Token on every request as a session fallback.
// ======================
const ltiTokenStore = new Map(); // token -> { userData, expires }
const LTI_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function createLtiToken(userData) {
    const token = crypto.randomBytes(32).toString('hex');
    ltiTokenStore.set(token, { userData, expires: Date.now() + LTI_TOKEN_TTL_MS });
    return token;
}

function lookupLtiToken(token) {
    if (!token) return null;
    const entry = ltiTokenStore.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expires) { ltiTokenStore.delete(token); return null; }
    return entry.userData;
}

// Purge expired tokens every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of ltiTokenStore) { if (now > v.expires) ltiTokenStore.delete(k); }
}, 10 * 60 * 1000);

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Too many requests' }
});

// ======================
// LTI 1.1 LAUNCH
// ======================

// Handle both GET (direct link) and POST (LTI launch) requests
app.all('/lti/launch', async (req, res, next) => {
    console.log(`[LTI Launch] ${req.method} ${req.originalUrl}`);
    console.log(`  Query: ${JSON.stringify(req.query)}`);
    console.log(`  Body: ${req.method === 'POST' ? 'present' : 'none'}`);

    // GET with ?disc= must still go through D2L LTI POST for authentication.
    // Direct GET access would create anonymous sessions and break grade passback.
    if (req.method === 'GET' && req.query.disc) {
        const disc = req.query.disc;
        const is3340 = disc.includes('3340');
        const contextId = is3340 ? '3991603' : '3991591';

        // Create a lightweight session for this user
        // In a real LTI launch we'd get this from the POST body
        // For direct links, we use query params or defaults
        const userData = {
            id: req.query.user_id || 'student-' + Date.now(),
            name: req.query.user_name || 'Student',
            email: req.query.user_email || 'student@kennesaw.edu',
            isInstructor: false,
            contextId: contextId,
            contextTitle: is3340 ? 'COMM 3340' : 'MENT 3300',
            resourceLinkId: req.query.resource_link_id || disc,
            resourceLinkTitle: disc,
            disc: disc,
            outcomeServiceUrl: '',
            resultSourcedId: ''
        };

        // Store disc mapping for this lightweight launch, keyed by the unique-per-link id.
        if (discMappingsCollection && userData.resourceLinkId) {
            await discMappingsCollection.updateOne(
                { resourceLinkId: userData.resourceLinkId },
                { $set: { resourceLinkId: userData.resourceLinkId, disc, resultSourcedId: userData.resultSourcedId, userId: userData.id, updatedAt: new Date().toISOString() } },
                { upsert: true }
            );
        }

        req.session.regenerate((err) => {
            if (err) console.error('Session regenerate error:', err);
            req.session.user = userData;
            req.session.save((err2) => {
                if (err2) console.error('Session save error:', err2);
                const ltiToken = createLtiToken(userData);
                console.log(`[GET Launch] Redirecting to discussion.html with disc=${disc}`);
                res.redirect(`/discussion.html?lti_token=${ltiToken}`);
            });
        });
        return;
    }

    // POST requests go to normal LTI handler
    if (req.method === 'POST') {
        return next();
    }

    // No disc param - show landing page
    res.send(`<!DOCTYPE html>
<html>
<head><title>Discussion Tool</title></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
    <h2>🔒 LTI Discussion Tool</h2>
    <p>This tool must be launched from D2L Brightspace.</p>
    <p>Please return to your D2L course and click the discussion link from there.</p>
</body>
</html>`);
});

app.post('/lti/launch', (req, res) => {
    const provider = new lti.Provider(config.lti.consumerKey, config.lti.consumerSecret);

    console.log('LTI LAUNCH PARAMS:', JSON.stringify(Object.fromEntries(
        Object.entries(req.body).filter(([k]) => !k.startsWith('oauth_signature'))
    ), null, 2));
    provider.valid_request(req, async (err, isValid) => {
        if (!isValid && !isDev) {
            console.error('LTI validation failed:', err);
            return res.status(401).send('LTI launch validation failed. Please launch from D2L.');
        }

        if (!isValid && isDev) {
            console.warn('⚠️  LTI validation failed in dev mode — proceeding anyway');
        }

        // Extract LTI parameters
        const ltiData = {
            userId: req.body.user_id,
            userName: req.body.lis_person_name_full || req.body.user_id,
            userEmail: req.body.lis_person_contact_email_primary || `${req.body.user_id}@kennesaw.edu`,
            roles: req.body.roles || '',
            contextId: req.body.context_id || 'default',
            contextTitle: req.body.context_title || 'Discussion',
            resourceLinkId: req.body.ext_d2l_link_id || req.body.resource_link_id || 'default',
            resourceLinkTitle: req.body.resource_link_title || 'Discussion Board',
            consumerKey: req.body.oauth_consumer_key,
            returnUrl: req.body.launch_presentation_return_url || '',
            // LTI Outcomes Service (for grade passback)
            outcomeServiceUrl: req.body.lis_outcome_service_url || '',
            resultSourcedId: req.body.lis_result_sourcedid || ''
        };

        // Determine if user is instructor
        const isInstructor = config.instructorRoles.some(role =>
            ltiData.roles.toLowerCase().includes(role.toLowerCase())
        );

        // Store outcomes data for grade passback (students only)
        if (!isInstructor && ltiData.outcomeServiceUrl && ltiData.resultSourcedId) {
            const outcomesDoc = {
                userId: ltiData.userId,
                userName: ltiData.userName,
                userEmail: ltiData.userEmail,
                resourceLinkId: ltiData.resourceLinkId,
                outcomeServiceUrl: ltiData.outcomeServiceUrl,
                resultSourcedId: ltiData.resultSourcedId,
                updatedAt: new Date().toISOString()
            };
            if (outcomesCollection) {
                outcomesCollection.updateOne(
                    { userId: ltiData.userId, resourceLinkId: ltiData.resourceLinkId },
                    { $set: outcomesDoc },
                    { upsert: true }
                ).catch(e => console.error('Failed to store outcomes data:', e));
            } else {
                global.inMemoryOutcomes = global.inMemoryOutcomes || {};
                global.inMemoryOutcomes[`${ltiData.userId}:${ltiData.resourceLinkId}`] = outcomesDoc;
            }
        }

        let dbDisc = null;
        if (!isInstructor && ltiData.resultSourcedId && discMappingsCollection) {
            const mapping = await discMappingsCollection.findOne({ resultSourcedId: ltiData.resultSourcedId });
            if (mapping) dbDisc = mapping.disc;
        }

        // Query param takes highest priority — allows unique URLs like ?disc=3340-mod5
        let disc = req.query.disc || null;

        // ext_d2l_link_id is the D2L content topic ID — unique per placed link, most reliable
        const TOPIC_ID_TO_DISC = {
            '62324565': '3300-disc0', '62324566': '3300-disc1', '62324567': '3300-disc2',
            '62324568': '3300-disc3', '62324569': '3300-disc4', '62324570': '3300-disc5',
            '62324571': '3300-disc6', '62324572': '3300-disc7', '62324573': '3300-disc8',
            '61805440': '3340-mod1',  '61805441': '3340-mod2',  '61805442': '3340-mod3',
            '61805443': '3340-mod4',  '61805444': '3340-mod5',  '61805445': '3340-mod6',
            '61805446': '3340-mod7',  '61805447': '3340-mod8',  '61805448': '3340-mod9',
            '61805449': '3340-mod10', '61805450': '3340-mod11', '61805451': '3340-mod13',
            '61805452': '3340-mod15',
        };
        if (!disc && req.body.ext_d2l_link_id) {
            disc = TOPIC_ID_TO_DISC[String(req.body.ext_d2l_link_id)] || null;
        }

        // Title map fallback — covers per-topic LTI links (MENT 3300 + COMM 3340)
        if (!disc) {
            const titleMap = {
                'Discussion 0: Introduce Yourself':                      '3300-disc0',
                'Discussion 1: Choose Your Podcast Topic':               '3300-disc1',
                'Discussion 1: Podcasts You Watch':                      '3300-disc1',
                'Discussion 2: Peer Critique \u2014 Episode 2':          '3300-disc2',
                'Discussion 2: Peer Critique \u2014 Episode 1':          '3300-disc2',
                'Discussion 3: The Sound of Podcasting':                 '3300-disc3',
                'Discussion 4: Peer Critique \u2014 Episode 3':          '3300-disc4',
                'Discussion 5: Brand Identity in the Wild':              '3300-disc5',
                'Discussion 6: Peer Critique \u2014 Episode 5':          '3300-disc6',
                'Discussion 7: Episode Structure Analysis':              '3300-disc7',
                'Discussion 8: Capstone Showcase & Final Peer Critique': '3300-disc8',
                'Module 1 Discussion':  '3340-mod1',  'Module 2 Discussion':  '3340-mod2',
                'Module 3 Discussion':  '3340-mod3',  'Module 4 Discussion':  '3340-mod4',
                'Module 5 Discussion':  '3340-mod5',  'Module 6 Discussion':  '3340-mod6',
                'Module 7 Discussion':  '3340-mod7',  'Module 8 Discussion':  '3340-mod8',
                'Module 9 Discussion':  '3340-mod9',  'Module 10 Discussion': '3340-mod10',
                'Module 11 Discussion': '3340-mod11', 'Module 13 Discussion': '3340-mod13',
                'Module 15 Discussion': '3340-mod15',
            };
            disc = titleMap[ltiData.resourceLinkTitle] || null;
        }

        if (disc) {
            console.log(`[LTI Launch] Resolved disc=${disc} (title="${ltiData.resourceLinkTitle}", ext_d2l_link_id=${req.body.ext_d2l_link_id || 'n/a'}, query.disc=${req.query.disc || 'n/a'})`);
        } else {
            console.warn(`[LTI Launch] Could not resolve disc title="${ltiData.resourceLinkTitle}" ext_d2l_link_id=${req.body.ext_d2l_link_id || 'n/a'}`);
        }

        // Persist mapping keyed by resourceLinkId (unique per placed D2L link)
        if (disc && !isInstructor && ltiData.resourceLinkId && discMappingsCollection) {
            discMappingsCollection.updateOne(
                { resourceLinkId: ltiData.resourceLinkId },
                { $set: { resourceLinkId: ltiData.resourceLinkId, disc, resultSourcedId: ltiData.resultSourcedId, userId: ltiData.userId, updatedAt: new Date().toISOString() } },
                { upsert: true }
            ).catch(e => console.error('Failed to auto-save disc mapping:', e));
        }

        // Fall back to DB mapping (for shared-link courses)
        if (!disc && !isInstructor && ltiData.resourceLinkId && discMappingsCollection) {
            const mapping = await discMappingsCollection.findOne({ resourceLinkId: ltiData.resourceLinkId });
            if (mapping) disc = mapping.disc;
        }

        const userData = {
            id: ltiData.userId,
            name: ltiData.userName,
            email: ltiData.userEmail,
            isInstructor,
            contextId: ltiData.contextId,
            contextTitle: ltiData.contextTitle,
            resourceLinkId: ltiData.resourceLinkId,
            resourceLinkTitle: ltiData.resourceLinkTitle,
            outcomeServiceUrl: ltiData.outcomeServiceUrl,
            resultSourcedId: ltiData.resultSourcedId,
            disc,
        };

        req.session.regenerate((err) => {
            if (err) console.error('Session regenerate error:', err);
            req.session.user = userData;
            req.session.save((err2) => {
                if (err2) console.error('Session save error:', err2);
                const ltiToken = createLtiToken(userData);
                if (isInstructor) {
                    res.redirect(`/instructor.html?lti_token=${ltiToken}`);
                } else if (!disc && ltiData.resultSourcedId) {
                    res.redirect(`/pick-discussion.html?lti_token=${ltiToken}`);
                } else {
                    res.redirect(`/discussion.html?lti_token=${ltiToken}`);
                }
            });
        });
    });
});

// Test launch route (bypasses OAuth signature for testing)
app.post('/lti/test-launch', (req, res) => {
    const testSecret = req.body.test_secret;
    if (testSecret !== config.lti.consumerSecret) {
        return res.status(401).send('Invalid test secret.');
    }

    const ltiData = {
        userId: req.body.user_id || 'test-user',
        userName: req.body.lis_person_name_full || 'Test User',
        userEmail: req.body.lis_person_contact_email_primary || 'test@kennesaw.edu',
        roles: req.body.roles || 'Student',
        contextId: req.body.context_id || 'test-course',
        contextTitle: req.body.context_title || 'Test Course',
        resourceLinkId: req.body.resource_link_id || 'test-discussion',
        resourceLinkTitle: req.body.resource_link_title || 'Test Discussion'
    };

    const isInstructor = config.instructorRoles.some(role =>
        ltiData.roles.toLowerCase().includes(role.toLowerCase())
    );

    // Test launches have no D2L title map or disc mapping to resolve against, so derive a
    // disc from the (optional) disc field or fall back to resourceLinkId. Without this, posts
    // would save with disc=null and GET /api/posts (strict isolation guard) would never return
    // them, making submissions appear to vanish on refresh.
    const disc = req.body.disc || ltiData.resourceLinkId;

    req.session.user = {
        id: ltiData.userId,
        name: ltiData.userName,
        email: ltiData.userEmail,
        isInstructor,
        contextId: ltiData.contextId,
        contextTitle: ltiData.contextTitle,
        resourceLinkId: ltiData.resourceLinkId,
        resourceLinkTitle: ltiData.resourceLinkTitle,
        disc
    };

    req.session.save(() => {
        res.redirect(isInstructor ? '/instructor.html' : '/discussion.html');
    });
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dev-mode direct login (no LTI needed)
if (isDev) {
    app.get('/dev/login', (req, res) => {
        const role = req.query.role || 'student';
        req.session.user = {
            id: role === 'instructor' ? 'dev-instructor' : 'dev-student',
            name: role === 'instructor' ? 'Dr. Dev Instructor' : 'Dev Student',
            email: role === 'instructor' ? 'instructor@kennesaw.edu' : 'student@kennesaw.edu',
            isInstructor: role === 'instructor',
            contextId: 'dev-course-101',
            contextTitle: 'DEV — CCSE 1000',
            resourceLinkId: 'dev-discussion-1',
            resourceLinkTitle: 'Week 1 Discussion'
        };
        req.session.save(() => {
            res.redirect(role === 'instructor' ? '/instructor.html' : '/discussion.html');
        });
    });
}

// ======================
// AUTH MIDDLEWARE
// ======================

function requireAuth(req, res, next) {
    if (req.session.user) return next();
    // Safari ITP fallback: session cookie may have been blocked — check token header
    const token = req.headers['x-lti-token'];
    const userData = lookupLtiToken(token);
    if (userData) {
        req.session.user = userData; // hydrate session for this request
        return next();
    }
    return res.status(401).json({ error: 'Not authenticated. Please launch from D2L.' });
}

function requireInstructor(req, res, next) {
    if (!req.session.user || !req.session.user.isInstructor) {
        return res.status(403).json({ error: 'Instructor access required' });
    }
    next();
}

// ======================
// API: User Info
// ======================

app.get('/api/user', requireAuth, async (req, res) => {
    let instructions = null;
    const discKey = req.session.user.disc;

    // Use hardcoded correct instructions for 3300 (override any incorrect DB entries)
    if (discKey && discKey.startsWith('3300-disc')) {
        instructions = CORRECT_3300_INSTRUCTIONS[discKey] || null;
    }

    // Fallback to DB for other courses or if no hardcoded instructions
    if (!instructions && discussionLabelsCollection && discKey) {
        const doc = await discussionLabelsCollection.findOne({ resourceLinkId: discKey });
        if (doc && doc.instructions) instructions = doc.instructions;
    }

    res.json({
        name: req.session.user.name,
        email: req.session.user.email,
        isInstructor: req.session.user.isInstructor,
        contextId: req.session.user.contextId,
        contextTitle: req.session.user.contextTitle,
        resourceLinkTitle: req.session.user.resourceLinkTitle,
        disc: req.session.user.disc || null,
        instructions
    });
});

// Instructor sets active disc via query param (?disc=3340-mod3 on /api/user or explicit POST)
app.post('/api/instructor/set-disc', requireInstructor, (req, res) => {
    const { disc } = req.body;
    req.session.user.disc = disc || null;
    req.session.save();
    res.json({ success: true, disc: req.session.user.disc });
});

// List all distinct disc values that have posts (for instructor dropdown)
app.get('/api/instructor/disc-list', requireInstructor, async (req, res) => {
    try {
        const contextTitle = req.session.user.contextTitle;
        let discs;
        // Course-wide dashboard: list distinct disc values across the whole course
        // (by contextTitle), not just the instructor's single launched link.
        if (postsCollection) {
            discs = await postsCollection.distinct('disc', { contextTitle });
        } else {
            const all = (global.inMemoryPosts || []).filter(p => p.contextTitle === contextTitle);
            discs = [...new Set(all.map(p => p.disc).filter(Boolean))];
        }
        // Attach labels from discussionLabels
        let labeled = discs.filter(Boolean).map(d => ({ disc: d, label: d }));
        if (discussionLabelsCollection) {
            const docs = await discussionLabelsCollection.find({ resourceLinkId: { $in: discs.filter(Boolean) } }).toArray();
            const map = Object.fromEntries(docs.map(d => [d.resourceLinkId, d.label]));
            labeled = labeled.map(d => ({ disc: d.disc, label: map[d.disc] || d.disc }));
        }
        res.json(labeled);
    } catch (e) {
        res.status(500).json({ error: 'Failed to list discussions' });
    }
});

// Student sets their disc mapping on first launch (stored by resultSourcedId)
app.post('/api/set-disc', requireAuth, async (req, res) => {
    try {
        const { disc } = req.body;
        if (!disc || typeof disc !== 'string') return res.status(400).json({ error: 'disc is required' });
        const resourceLinkId = req.session.user.resourceLinkId;
        if (!resourceLinkId) return res.status(400).json({ error: 'No resourceLinkId in session' });
        if (discMappingsCollection) {
            await discMappingsCollection.updateOne(
                { resourceLinkId },
                { $set: { resourceLinkId, disc, resultSourcedId: req.session.user.resultSourcedId, userId: req.session.user.id, updatedAt: new Date().toISOString() } },
                { upsert: true }
            );
        }
        req.session.user.disc = disc;
        req.session.save();
        res.json({ success: true, disc });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save disc' });
    }
});

// ======================
// API: Discussion Posts
// ======================

app.get('/api/posts', requireAuth, async (req, res) => {
    try {
        const resourceLinkId = req.session.user.resourceLinkId;
        const disc = req.session.user.disc;

        // STRICT ISOLATION: Every discussion must have a disc identifier
        // If disc is not set, return empty array (student must go through proper LTI launch)
        if (!disc) {
            console.log(`[Posts] Rejecting request - no disc in session for user ${req.session.user.id}`);
            return res.json([]);
        }

        // Query by course context + disc — resourceLinkId is often shared across topics
        const query = { contextId: req.session.user.contextId, disc };
        let posts;

        if (postsCollection) {
            posts = await postsCollection
                .find(query)
                .sort({ timestamp: -1 })
                .toArray();
        } else {
            posts = (global.inMemoryPosts || [])
                .filter(p => p.contextId === req.session.user.contextId && p.disc === disc)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        // For students, strip AI detection data from other posts
        if (!req.session.user.isInstructor) {
            posts = posts.map(p => {
                const { aiResults, typingAnalytics, compositeScore, compositeRisk, ...safe } = p;
                return safe;
            });
        }

        res.json(posts);
    } catch (error) {
        console.error('Error loading posts:', error);
        res.status(500).json({ error: 'Failed to load posts' });
    }
});

app.post('/api/posts', requireAuth, apiLimiter, async (req, res) => {
    try {
        const { text, parentId, typingAnalytics, sessionTimeline } = req.body;

        if (!text || typeof text !== 'string' || text.trim().length < 10) {
            return res.status(400).json({ error: 'Post must be at least 10 characters' });
        }

        if (text.length > 50000) {
            return res.status(400).json({ error: 'Post too long (max 50,000 characters)' });
        }

        // Run AI detection
        let aiResults = null;
        if (text.trim().length >= 50) {
            aiResults = await runAIDetection(text);
        }

        // Server-side re-derivation of analytics
        const safeAnalytics = typingAnalytics || {};
        const focusChanges = Array.isArray(safeAnalytics.focusChanges) ? safeAnalytics.focusChanges : [];
        const patterns = Array.isArray(safeAnalytics.suspiciousPatterns) ? safeAnalytics.suspiciousPatterns : [];
        const injections = Array.isArray(safeAnalytics.suspectedInjections) ? safeAnalytics.suspectedInjections : [];

        safeAnalytics.suspiciousRefocusCount = focusChanges
            .filter(f => f.type === 'focus' && (f.textGrowthAfterReturn || 0) > 20).length;
        safeAnalytics.wpmSpikeCount = patterns.filter(p => p.type === 'wpm_spike').length;
        safeAnalytics.injectionCount = injections.length;

        const backspaces = typeof safeAnalytics.backspaceCount === 'number' ? safeAnalytics.backspaceCount : 0;
        const deletes = typeof safeAnalytics.deleteCount === 'number' ? safeAnalytics.deleteCount : 0;
        safeAnalytics.correctionRatio = parseFloat(((backspaces + deletes) / Math.max(text.length, 1)).toFixed(3));

        // Compute composite risk score
        const aiProb = aiResults?.documents?.[0]?.completely_generated_prob || 0;
        const typingSuspicion = safeAnalytics.suspicionScore || 0;
        let compositeScore = 0;
        compositeScore += aiProb * 35;
        compositeScore += (typingSuspicion / 100) * 25;
        compositeScore += Math.min(safeAnalytics.suspiciousRefocusCount * 5, 15);
        compositeScore += Math.min(safeAnalytics.injectionCount * 5, 10);
        if (safeAnalytics.correctionRatio < 0.01 && (safeAnalytics.totalKeystrokes || 0) > 100) {
            compositeScore += 8;
        } else if (safeAnalytics.correctionRatio < 0.03 && (safeAnalytics.totalKeystrokes || 0) > 100) {
            compositeScore += 4;
        }
        compositeScore += Math.min(safeAnalytics.wpmSpikeCount * 2.5, 5);
        compositeScore += Math.min((safeAnalytics.pasteAttempts || 0) * 1, 2);
        compositeScore = Math.min(100, Math.round(compositeScore));
        const compositeRisk = compositeScore >= 60 ? 'high' : compositeScore >= 30 ? 'medium' : 'low';

        const post = {
            id: crypto.randomBytes(16).toString('hex'),
            contextId: req.session.user.contextId,
            contextTitle: req.session.user.contextTitle,
            resourceLinkId: req.session.user.resourceLinkId,
            resourceLinkTitle: req.session.user.resourceLinkTitle,
            disc: req.session.user.disc || null,
            parentId: parentId || null,
            authorId: req.session.user.id,
            authorName: req.session.user.name,
            authorEmail: req.session.user.email,
            text: text.trim(),
            wordCount: text.trim().split(/\s+/).length,
            timestamp: new Date().toISOString(),
            aiResults,
            typingAnalytics: safeAnalytics,
            sessionTimeline: Array.isArray(sessionTimeline) ? sessionTimeline : [],
            compositeScore,
            compositeRisk
        };

        if (postsCollection) {
            await postsCollection.insertOne(post);
        } else {
            global.inMemoryPosts.push(post);
        }

        console.log(`Post from ${req.session.user.name} (${compositeRisk} risk, score ${compositeScore})`);

        // Return sanitized version to student
        const { aiResults: _, typingAnalytics: __, compositeScore: _s, compositeRisk: _r, ...safePost } = post;
        res.json({ success: true, post: safePost });
    } catch (error) {
        console.error('Post creation error:', error);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// ======================
// API: Drafts
// ======================

app.post('/api/save-draft', requireAuth, apiLimiter, async (req, res) => {
    try {
        const { text, scratchPad } = req.body;

        const draft = {
            userEmail: req.session.user.email,
            contextId: req.session.user.contextId,
            resourceLinkId: req.session.user.resourceLinkId,
            text: typeof text === 'string' ? text.substring(0, 50000) : '',
            scratchPad: typeof scratchPad === 'string' ? scratchPad.substring(0, 50000) : '',
            savedAt: new Date().toISOString()
        };

        if (draftsCollection) {
            await draftsCollection.updateOne(
                { userEmail: req.session.user.email, resourceLinkId: req.session.user.resourceLinkId },
                { $set: draft },
                { upsert: true }
            );
        } else {
            const key = `${req.session.user.email}:${req.session.user.resourceLinkId}`;
            global.inMemoryDrafts[key] = draft;
        }

        res.json({ success: true, savedAt: draft.savedAt });
    } catch (error) {
        console.error('Save draft error:', error);
        res.status(500).json({ error: 'Failed to save draft' });
    }
});

app.get('/api/load-draft', requireAuth, async (req, res) => {
    try {
        let draft;

        if (draftsCollection) {
            draft = await draftsCollection.findOne({
                userEmail: req.session.user.email,
                resourceLinkId: req.session.user.resourceLinkId
            });
        } else {
            const key = `${req.session.user.email}:${req.session.user.resourceLinkId}`;
            draft = global.inMemoryDrafts[key] || null;
        }

        if (!draft) return res.json({ found: false });

        res.json({
            found: true,
            text: draft.text,
            scratchPad: draft.scratchPad || '',
            savedAt: draft.savedAt
        });
    } catch (error) {
        console.error('Load draft error:', error);
        res.status(500).json({ error: 'Failed to load draft' });
    }
});

// ======================
// API: AI Detection (Sapling)
// ======================

async function runAIDetection(text) {
    if (isDev && !config.sapling.apiKey) {
        // Mock response in dev mode
        const fakeProb = Math.random() * 0.3;
        return {
            documents: [{
                completely_generated_prob: fakeProb,
                average_generated_prob: fakeProb * 0.8,
                class: fakeProb > 0.5 ? 'ai' : 'human',
                sentences: []
            }]
        };
    }

    if (!config.sapling.apiKey) return null;

    return new Promise((resolve) => {
        const https = require('https');
        const postData = JSON.stringify({ key: config.sapling.apiKey, text });

        const options = {
            hostname: 'api.sapling.ai',
            path: '/api/v1/aidetect',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const apiReq = https.request(options, (apiRes) => {
            let data = '';
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    // Normalize Sapling response to match expected format
                    // Sapling returns { score: 0-1, sentence_scores: [...] }
                    const aiScore = result.score || 0;
                    resolve({
                        documents: [{
                            completely_generated_prob: aiScore,
                            average_generated_prob: aiScore,
                            class: aiScore > 0.5 ? 'ai' : 'human',
                            sentences: (result.sentence_scores || []).map(s => ({
                                sentence: s.sentence,
                                generated_prob: s.score
                            }))
                        }],
                        provider: 'sapling'
                    });
                } catch (e) {
                    console.error('Sapling parse error:', e.message);
                    resolve(null);
                }
            });
        });

        apiReq.on('error', (e) => { console.error('Sapling API error:', e.message); resolve(null); });
        apiReq.setTimeout(10000, () => { apiReq.destroy(); resolve(null); });
        apiReq.write(postData);
        apiReq.end();
    });
}

// ======================
// API: Instructor endpoints
// ======================

app.get('/api/instructor/posts', requireInstructor, async (req, res) => {
    try {
        const resourceLinkId = req.session.user.resourceLinkId;
        const contextTitle = req.session.user.contextTitle;
        const disc = req.session.user.disc;
        // Group by contextTitle (the stable course identifier) so an instructor sees all
        // discussions within their course. D2L can issue different context_ids for the same
        // course, so contextId is unreliable for course-wide grouping (see DEVELOPER-NOTES).
        // If a specific disc is selected, additionally filter by disc value.
        console.log('[instructor/posts] contextTitle:', contextTitle, 'resourceLinkId:', resourceLinkId, 'disc:', disc);
        const query = disc ? { contextTitle, disc } : { contextTitle };
        let posts;

        if (postsCollection) {
            posts = await postsCollection
                .find(query)
                .sort({ timestamp: -1 })
                .toArray();
        } else {
            posts = (global.inMemoryPosts || [])
                .filter(p => p.contextTitle === contextTitle && (!disc || p.disc === disc))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        // Attach instructor-defined label for this discussion.
        let moduleLabel = p => p.resourceLinkTitle || contextTitle || 'Untitled Discussion';
        if (discussionLabelsCollection && disc) {
            const labelDoc = await discussionLabelsCollection.findOne({ resourceLinkId: disc });
            if (labelDoc) moduleLabel = () => labelDoc.label;
        }
        posts = posts.map(p => ({ ...p, moduleLabel: moduleLabel(p) }));

        res.json(posts);
    } catch (error) {
        console.error('Error loading instructor posts:', error);
        res.status(500).json({ error: 'Failed to load posts' });
    }
});

// Set a custom display name for a discussion (module), keyed by resourceLinkId.
app.post('/api/instructor/discussion-label', requireInstructor, async (req, res) => {
    try {
        const { resourceLinkId, label, instructions } = req.body;
        const contextTitle = req.session.user.contextTitle;

        if (!resourceLinkId || typeof label !== 'string' || !label.trim()) {
            return res.status(400).json({ error: 'resourceLinkId and a non-empty label are required' });
        }

        if (!postsCollection || !discussionLabelsCollection) {
            return res.status(503).json({ error: 'Database unavailable' });
        }

        // Ensure the discussion belongs to the instructor's course before renaming.
        const owned = await postsCollection.findOne({ resourceLinkId, contextTitle });
        if (!owned) {
            return res.status(403).json({ error: 'This discussion does not belong to your course.' });
        }

        const setFields = { resourceLinkId, contextTitle, label: label.trim(), updatedAt: new Date().toISOString() };
        if (instructions !== undefined) setFields.instructions = instructions;

        await discussionLabelsCollection.updateOne(
            { resourceLinkId },
            { $set: setFields },
            { upsert: true }
        );

        res.json({ success: true, resourceLinkId, label: label.trim() });
    } catch (error) {
        console.error('Error setting discussion label:', error);
        res.status(500).json({ error: 'Failed to save label' });
    }
});

// Pre-populate instructions without requiring an active student post (setup use only).
app.post('/api/instructor/set-instructions', requireInstructor, async (req, res) => {
    try {
        const { resourceLinkId, instructions, label } = req.body;
        if (!resourceLinkId || !instructions) {
            return res.status(400).json({ error: 'resourceLinkId and instructions are required' });
        }
        if (!discussionLabelsCollection) {
            return res.status(503).json({ error: 'Database unavailable' });
        }
        const setFields = { resourceLinkId, instructions, updatedAt: new Date().toISOString() };
        if (label) setFields.label = label;
        await discussionLabelsCollection.updateOne(
            { resourceLinkId },
            { $set: setFields },
            { upsert: true }
        );
        res.json({ success: true, resourceLinkId });
    } catch (error) {
        console.error('Error setting instructions:', error);
        res.status(500).json({ error: 'Failed to save instructions' });
    }
});

// ======================
// API: Grade Passback
// ======================

app.post('/api/instructor/grade', requireInstructor, async (req, res) => {
    try {
        const { authorId, score, feedback } = req.body;
        const resourceLinkId = req.session.user.resourceLinkId;
        const disc = req.session.user.disc;

        if (typeof score !== 'number' || score < 0 || score > 100) {
            return res.status(400).json({ error: 'Score must be between 0 and 100' });
        }

        // Find the student's outcomes record (resultSourcedId + outcomeServiceUrl) for THIS disc.
        // discMappings is keyed by resourceLinkId (unique per placed link), so resolve the set of
        // links that belong to this disc, then look up the student's per-link outcome record.
        // Using the instructor's resourceLinkId would send grades to the wrong gradebook item when
        // multiple discussion links exist in the course.
        let outcomesData;
        if (outcomesCollection && discMappingsCollection && disc) {
            const discLinkIds = await discMappingsCollection.distinct('resourceLinkId', { disc });
            if (discLinkIds.length) {
                outcomesData = await outcomesCollection.findOne({
                    userId: authorId,
                    resourceLinkId: { $in: discLinkIds }
                });
            }
        }
        // Fallback: find by userId + the instructor's resourceLinkId (works if only one discussion)
        if (!outcomesData && outcomesCollection) {
            outcomesData = await outcomesCollection.findOne({ userId: authorId, resourceLinkId });
        } else if (!outcomesData) {
            outcomesData = (global.inMemoryOutcomes || {})[`${authorId}:${resourceLinkId}`];
        }

        if (!outcomesData || !outcomesData.outcomeServiceUrl || !outcomesData.resultSourcedId) {
            return res.status(400).json({ error: 'Grade passback not available for this student. They must launch the tool from D2L first.' });
        }

        // Send grade to D2L via LTI Outcomes Service
        const normalizedScore = score / 100; // LTI expects 0.0-1.0
        const success = await sendLTIGrade(
            outcomesData.outcomeServiceUrl,
            outcomesData.resultSourcedId,
            normalizedScore
        );

        if (!success) {
            return res.status(500).json({ error: 'Failed to send grade to D2L. Please try again.' });
        }

        // Store grade locally on the student's posts for this discussion. Match by disc when
        // known (the instructor's resourceLinkId may differ from the student's link), otherwise
        // fall back to the student's own resourceLinkId from their outcomes record.
        if (postsCollection) {
            const gradeQuery = disc
                ? { authorId, disc }
                : { authorId, resourceLinkId: outcomesData.resourceLinkId || resourceLinkId };
            await postsCollection.updateMany(
                gradeQuery,
                { $set: { grade: score, gradeFeedback: feedback || '', gradedAt: new Date().toISOString(), gradedBy: req.session.user.name } }
            );
        }

        console.log(`Grade sent to D2L: ${outcomesData.userName} = ${score}/100 for ${disc || resourceLinkId}`);
        res.json({ success: true, message: `Grade of ${score}/100 sent to D2L gradebook` });
    } catch (error) {
        console.error('Grade submission error:', error);
        res.status(500).json({ error: 'Failed to submit grade' });
    }
});

function sendLTIGrade(serviceUrl, sourcedId, score) {
    return new Promise((resolve) => {
        const oauthSign = require('oauth-sign');
        const https = require('https');
        const http = require('http');
        const url = require('url');

        const messageId = crypto.randomBytes(16).toString('hex');
        const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader>
    <imsx_POXRequestHeaderInfo>
      <imsx_version>V1.0</imsx_version>
      <imsx_messageIdentifier>${messageId}</imsx_messageIdentifier>
    </imsx_POXRequestHeaderInfo>
  </imsx_POXHeader>
  <imsx_POXBody>
    <replaceResultRequest>
      <resultRecord>
        <sourcedGUID>
          <sourcedId>${sourcedId}</sourcedId>
        </sourcedGUID>
        <result>
          <resultScore>
            <language>en</language>
            <textString>${score.toFixed(4)}</textString>
          </resultScore>
        </result>
      </resultRecord>
    </replaceResultRequest>
  </imsx_POXBody>
</imsx_POXEnvelopeRequest>`;

        const parsedUrl = url.parse(serviceUrl);
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = crypto.randomBytes(16).toString('hex');

        const oauthParams = {
            oauth_consumer_key: config.lti.consumerKey,
            oauth_nonce: nonce,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_version: '1.0',
            oauth_body_hash: crypto.createHash('sha1').update(xmlBody).digest('base64')
        };

        const signature = oauthSign.hmacsign(
            'POST',
            serviceUrl,
            oauthParams,
            config.lti.consumerSecret
        );

        const authHeader = `OAuth oauth_consumer_key="${encodeURIComponent(oauthParams.oauth_consumer_key)}",` +
            `oauth_nonce="${encodeURIComponent(nonce)}",` +
            `oauth_signature="${encodeURIComponent(signature)}",` +
            `oauth_signature_method="HMAC-SHA1",` +
            `oauth_timestamp="${timestamp}",` +
            `oauth_version="1.0",` +
            `oauth_body_hash="${encodeURIComponent(oauthParams.oauth_body_hash)}"`;

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/xml',
                'Content-Length': Buffer.byteLength(xmlBody),
                'Authorization': authHeader
            }
        };

        const transport = parsedUrl.protocol === 'https:' ? https : http;
        const apiReq = transport.request(options, (apiRes) => {
            let data = '';
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => {
                const success = data.includes('success') && apiRes.statusCode >= 200 && apiRes.statusCode < 300;
                if (!success) {
                    console.error('LTI grade passback failed:', apiRes.statusCode, data.substring(0, 500));
                }
                resolve(success);
            });
        });

        apiReq.on('error', (e) => {
            console.error('LTI grade passback error:', e.message);
            resolve(false);
        });
        apiReq.setTimeout(15000, () => { apiReq.destroy(); resolve(false); });
        apiReq.write(xmlBody);
        apiReq.end();
    });
}

// ======================
// STATIC FILES
// ======================

const allowedFiles = ['discussion.html', 'instructor.html', 'pick-discussion.html', 'styles.css', 'script.js', 'discussion.js', 'test-launch.html'];

app.get('/:file', (req, res, next) => {
    const file = req.params.file;
    if (allowedFiles.includes(file)) {
        return res.sendFile(path.join(__dirname, file));
    }
    next();
});

app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect(req.session.user.isInstructor ? '/instructor.html' : '/discussion.html');
    }
    if (isDev) {
        return res.send(`
            <h2>KSU Discussion LTI — Dev Mode</h2>
            <p><a href="/dev/login?role=student">Login as Student</a></p>
            <p><a href="/dev/login?role=instructor">Login as Instructor</a></p>
        `);
    }
    res.status(403).send('Please launch this tool from D2L.');
});

// ======================
// START
// ======================

async function start() {
    await connectDatabase();
    app.listen(PORT, () => {
        console.log(`✅ KSU Discussion LTI running on port ${PORT}`);
        console.log(`   Environment: ${isDev ? 'development' : 'production'}`);
        if (isDev) {
            console.log(`   Dev login: http://localhost:${PORT}/dev/login?role=student`);
            console.log(`   Instructor: http://localhost:${PORT}/dev/login?role=instructor`);
        }
    });
}

start();
