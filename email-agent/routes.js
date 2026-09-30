'use strict';
// routes.js — status page + authenticated endpoints for cloud sessions.
const express = require('express');
const { mintAccessToken } = require('./graph');

const STALE_MS = 20 * 60 * 1000;

function agentAuth(req, res, next) {
    const expected = process.env.AGENT_SHARED_SECRET;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    next();
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function createRouter({ store, log }) {
    const router = express.Router();

    router.get('/status', async (req, res) => {
        try {
            const s = await store.getStatus();
            const queue = await store.getQueue();
            const state = await store.getState();
            const age = s?.lastPollAt ? Date.now() - new Date(s.lastPollAt).getTime() : null;
            const alive = age !== null && age < STALE_MS;
            const dot = !s ? '⚪' : !alive ? '🔴' : (s.mailOk && s.d2lOk) ? '🟢' : '🟡';
            const pendingN = queue.pending?.length || 0;
            const draftRows = (state.drafts || []).slice(-15).reverse().map(d =>
                `<tr><td>${esc(d.at?.slice(0, 16).replace('T', ' '))}</td><td>${esc(d.sender)}</td>` +
                `<td>${esc(d.subject)}</td><td>${esc(d.action)}</td></tr>`).join('');
            res.type('html').send(`<!doctype html><html><head>
<meta charset="utf-8"><meta http-equiv="refresh" content="60">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email Agent Status</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:640px;margin:2em auto;padding:0 1em;color:#222}
.dot{font-size:3em}.row{display:flex;justify-content:space-between;padding:.4em 0;border-bottom:1px solid #eee}
.lbl{color:#666}table{width:100%;border-collapse:collapse;font-size:.85em;margin-top:1em}
td{padding:.3em;border-bottom:1px solid #eee}.ok{color:#1a7f37}.bad{color:#cf222e}</style>
</head><body>
<div class="dot">${dot}</div>
<h1 style="margin:.2em 0 1em">Email Agent</h1>
<div class="row"><span class="lbl">Last poll</span><span>${s ? esc(s.lastPollAt) : 'never'}${age !== null ? ` (${Math.round(age / 60000)}m ago)` : ''}</span></div>
<div class="row"><span class="lbl">Mail (Graph)</span><span class="${s?.mailOk ? 'ok' : 'bad'}">${s?.mailOk ? 'ok' : esc(s?.mailNote || 'unknown')}</span></div>
<div class="row"><span class="lbl">D2L session</span><span class="${s?.d2lOk ? 'ok' : 'bad'}">${s?.d2lOk ? 'alive' : esc(s?.d2lNote || 'unknown')}</span></div>
<div class="row"><span class="lbl">Pending / in-flight</span><span>${pendingN} / ${Object.keys(queue.inFlight || {}).length}</span></div>
<div class="row"><span class="lbl">Drafts created (all time)</span><span>${(state.drafts || []).filter(d => d.action === 'drafted').length}</span></div>
<div class="row"><span class="lbl">Last draft</span><span>${esc(s?.lastDraftAt || '—')}</span></div>
${s?.note ? `<div class="row"><span class="lbl">Note</span><span class="bad">${esc(s.note)}</span></div>` : ''}
<h3>Recent activity</h3>
<table>${draftRows || '<tr><td>none yet</td></tr>'}</table>
<p style="color:#999;font-size:.8em;margin-top:2em">auto-refreshes every 60s</p>
</body></html>`);
        } catch (err) {
            log.error('[email-agent] status page error:', err);
            res.status(500).send('status unavailable');
        }
    });

    // --- session-materials: everything a spawned Devin session needs ---
    router.get('/session-materials', agentAuth, async (req, res) => {
        try {
            const refresh = await store.getSecret('graphRefresh');
            if (!refresh) return res.status(503).json({ error: 'no graph token seeded' });
            const tokens = await mintAccessToken(refresh);
            if (tokens.refresh_token && tokens.refresh_token !== refresh) {
                await store.setSecret('graphRefresh', tokens.refresh_token);
            }
            const d2lCookie = await store.getSecret('d2lCookie');
            const d2lCfg = await store.getConfig('d2lConfig');
            const state = await store.getState();
            res.json({
                graphAccessToken: tokens.access_token,
                d2lCookie,
                d2lBaseUrl: d2lCfg?.baseUrl || 'https://kennesaw.view.usg.edu/d2l/login',
                d2lUsername: d2lCfg?.username || 'idunham@kennesaw.edu',
                activatedAt: state.activatedAt,
                processedIds: state.processedIds
            });
        } catch (err) {
            log.error('[email-agent] session-materials error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // --- vault write: seed/rotate secrets from the local seed script ---
    router.post('/vault', agentAuth, express.json({ limit: '64kb' }), async (req, res) => {
        try {
            const { secret, config, value } = req.body || {};
            if (secret) await store.setSecret(secret, value);
            else if (config) await store.setConfig(config, value);
            else return res.status(400).json({ error: 'need {secret|config, value}' });
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- report: a session posts its results back ---
    router.post('/report', agentAuth, express.json({ limit: '256kb' }), async (req, res) => {
        try {
            const { drafts = [], processed = [], d2lCookieRotated } = req.body || {};
            const state = await store.getState();
            const queue = await store.getQueue();
            const now = new Date().toISOString();

            for (const id of processed) {
                if (!state.processedIds.includes(id)) state.processedIds.push(id);
                delete queue.inFlight[id];
            }
            let drafted = false;
            for (const d of drafts) {
                state.drafts.push({ ...d, at: d.at || now });
                if (d.action === 'drafted') drafted = true;
            }
            if (d2lCookieRotated) await store.setSecret('d2lCookie', d2lCookieRotated);

            // Session finished — clear active marker so next poll can spawn again
            queue.activeSessionId = null;
            queue.activeSince = null;

            await store.setState(state);
            await store.setQueue(queue);
            const prev = (await store.getStatus()) || {};
            await store.setStatus({
                ...prev,
                lastDraftAt: drafted ? now : prev.lastDraftAt,
                draftsToday: (prev.draftsToday || 0) + drafts.filter(d => d.action === 'drafted').length
            });
            res.json({ ok: true });
        } catch (err) {
            log.error('[email-agent] report error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createRouter };
