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

let db, postsCollection, draftsCollection, outcomesCollection;
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

        await postsCollection.createIndex({ contextId: 1, timestamp: -1 });
        await postsCollection.createIndex({ resourceLinkId: 1, timestamp: -1 });
        await postsCollection.createIndex({ parentId: 1 });
        await postsCollection.createIndex({ authorEmail: 1 });
        await draftsCollection.createIndex({ userEmail: 1, contextId: 1 }, { unique: true });
        await outcomesCollection.createIndex({ userId: 1, resourceLinkId: 1 }, { unique: true });

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

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Too many requests' }
});

// ======================
// LTI 1.1 LAUNCH
// ======================

app.post('/lti/launch', (req, res) => {
    const provider = new lti.Provider(config.lti.consumerKey, config.lti.consumerSecret);

    provider.valid_request(req, (err, isValid) => {
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
            resourceLinkId: req.body.resource_link_id || 'default',
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

        // Store in session
        req.session.user = {
            id: ltiData.userId,
            name: ltiData.userName,
            email: ltiData.userEmail,
            isInstructor,
            contextId: ltiData.contextId,
            contextTitle: ltiData.contextTitle,
            resourceLinkId: ltiData.resourceLinkId,
            resourceLinkTitle: ltiData.resourceLinkTitle,
            outcomeServiceUrl: ltiData.outcomeServiceUrl,
            resultSourcedId: ltiData.resultSourcedId
        };

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

        req.session.save((err) => {
            if (err) console.error('Session save error:', err);
            if (isInstructor) {
                res.redirect('/instructor.html');
            } else {
                res.redirect('/discussion.html');
            }
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

    req.session.user = {
        id: ltiData.userId,
        name: ltiData.userName,
        email: ltiData.userEmail,
        isInstructor,
        contextId: ltiData.contextId,
        contextTitle: ltiData.contextTitle,
        resourceLinkId: ltiData.resourceLinkId,
        resourceLinkTitle: ltiData.resourceLinkTitle
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
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated. Please launch from D2L.' });
    }
    next();
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

app.get('/api/user', requireAuth, (req, res) => {
    res.json({
        name: req.session.user.name,
        email: req.session.user.email,
        isInstructor: req.session.user.isInstructor,
        contextId: req.session.user.contextId,
        contextTitle: req.session.user.contextTitle,
        resourceLinkTitle: req.session.user.resourceLinkTitle
    });
});

// ======================
// API: Discussion Posts
// ======================

app.get('/api/posts', requireAuth, async (req, res) => {
    try {
        const resourceLinkId = req.session.user.resourceLinkId;
        let posts;

        if (postsCollection) {
            posts = await postsCollection
                .find({ resourceLinkId })
                .sort({ timestamp: -1 })
                .toArray();
        } else {
            posts = (global.inMemoryPosts || [])
                .filter(p => p.resourceLinkId === resourceLinkId)
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
            resourceLinkId: req.session.user.resourceLinkId,
            resourceLinkTitle: req.session.user.resourceLinkTitle,
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
            text: typeof text === 'string' ? text.substring(0, 50000) : '',
            scratchPad: typeof scratchPad === 'string' ? scratchPad.substring(0, 50000) : '',
            savedAt: new Date().toISOString()
        };

        if (draftsCollection) {
            await draftsCollection.updateOne(
                { userEmail: req.session.user.email, contextId: req.session.user.contextId },
                { $set: draft },
                { upsert: true }
            );
        } else {
            const key = `${req.session.user.email}:${req.session.user.contextId}`;
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
                contextId: req.session.user.contextId
            });
        } else {
            const key = `${req.session.user.email}:${req.session.user.contextId}`;
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
        const contextId = req.session.user.contextId;
        let posts;

        if (postsCollection) {
            posts = await postsCollection
                .find({ contextId })
                .sort({ timestamp: -1 })
                .toArray();
        } else {
            posts = (global.inMemoryPosts || [])
                .filter(p => p.contextId === contextId)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        res.json(posts);
    } catch (error) {
        console.error('Error loading instructor posts:', error);
        res.status(500).json({ error: 'Failed to load posts' });
    }
});

// ======================
// API: Grade Passback
// ======================

app.post('/api/instructor/grade', requireInstructor, async (req, res) => {
    try {
        const { authorId, score, feedback } = req.body;
        const resourceLinkId = req.session.user.resourceLinkId;

        if (typeof score !== 'number' || score < 0 || score > 100) {
            return res.status(400).json({ error: 'Score must be between 0 and 100' });
        }

        // Find the student's outcomes data
        let outcomesData;
        if (outcomesCollection) {
            outcomesData = await outcomesCollection.findOne({ userId: authorId, resourceLinkId });
        } else {
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

        // Store grade locally
        if (postsCollection) {
            await postsCollection.updateMany(
                { authorId, resourceLinkId },
                { $set: { grade: score, gradeFeedback: feedback || '', gradedAt: new Date().toISOString(), gradedBy: req.session.user.name } }
            );
        }

        console.log(`Grade sent to D2L: ${outcomesData.userName} = ${score}/100 for ${resourceLinkId}`);
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

const allowedFiles = ['discussion.html', 'instructor.html', 'styles.css', 'script.js', 'discussion.js', 'test-launch.html'];

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
