'use strict';
// index.js — wire the email agent into the LTI server.
// Enabled only when EMAIL_AGENT_ENABLED=true and the required env vars exist.
const { stores } = require('./store');
const { createPoller } = require('./poller');
const { createRouter } = require('./routes');

const REQUIRED = ['AGENT_SHARED_SECRET', 'AGENT_VAULT_KEY', 'AGENT_API_BASE'];

function initEmailAgent(app, db, log) {
    if (process.env.EMAIL_AGENT_ENABLED !== 'true') {
        log.info('[email-agent] disabled (EMAIL_AGENT_ENABLED not set)');
        return;
    }
    const missing = REQUIRED.filter(k => !process.env[k]);
    if (missing.length) {
        log.error(`[email-agent] missing env vars: ${missing.join(', ')} — not starting`);
        return;
    }
    const store = stores(db);
    app.use('/agent', createRouter({ store, log }));
    createPoller({ store, log }).start();
    log.info('[email-agent] enabled');
}

module.exports = { initEmailAgent };
