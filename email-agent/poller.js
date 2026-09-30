'use strict';
// poller.js — the always-on half of the email agent.
//
// Every POLL_INTERVAL_MS:
//   1. Mint a Graph access token from the vault's refresh token.
//   2. List the inbox, diff against processedIds + activatedAt.
//   3. Queue draftable messages; if a Devin cloud session isn't already
//      running, spawn one via the v3 API to handle the queue.
//   4. Keep the D2L session cookie warm (whoami ping + rotation merge).
//   5. Write the agentStatus doc the status page renders.
const { mintAccessToken, listInbox, needsDraft } = require('./graph');

const POLL_INTERVAL_MS = Number(process.env.AGENT_POLL_INTERVAL_MS || 15 * 60 * 1000);
const SESSION_STALE_MS = 20 * 60 * 1000;      // re-queue if a session never reports
const DEVIN_API = 'https://api.devin.ai';
const D2L_BASE = 'https://kennesaw.view.usg.edu';

function createPoller({ store, log }) {
    let timer = null;
    let running = false;

    async function d2lKeepalive(status) {
        const cookie = await store.getSecret('d2lCookie');
        if (!cookie) { status.d2lOk = false; status.d2lNote = 'no cookie in vault'; return; }
        try {
            const res = await fetch(`${D2L_BASE}/d2l/api/lp/1.63/users/whoami`, {
                headers: { Cookie: cookie, 'User-Agent': 'email-agent-keepalive' },
                redirect: 'manual'
            });
            if (res.status !== 200) {
                status.d2lOk = false;
                status.d2lNote = `whoami HTTP ${res.status} — needs re-auth`;
                return;
            }
            // Merge rotated d2l* cookies back into the vault
            const jar = new Map();
            for (const pair of cookie.split(';')) {
                const [k, v] = pair.trim().split('=', 2);
                if (k) jar.set(k, v ?? '');
            }
            for (const sc of res.headers.getSetCookie?.() ?? []) {
                const [pair] = sc.split(';');
                const [k, v] = pair.trim().split('=', 2);
                if (k && /^d2l/.test(k)) jar.set(k, v ?? '');
            }
            const merged = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
            if (merged !== cookie) await store.setSecret('d2lCookie', merged);
            status.d2lOk = true;
        } catch (err) {
            status.d2lOk = false;
            status.d2lNote = `whoami error: ${err.message}`;
        }
    }

    async function spawnSession(ids) {
        const prompt =
            `You are Ian Dunham's email draft agent. Do this setup first:\n\n` +
            `mkdir -p ~/repo && cd ~/repo && curl -sL -H "Authorization: Bearer $GH_REPO_TOKEN" ` +
            `https://api.github.com/repos/iandunham2/email-agent/tarball | tar xz --strip-components=1\n` +
            `if ! command -v node >/dev/null; then curl -fsSL ` +
            `https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz | ` +
            `sudo tar -xJ -C /usr/local --strip-components=1; fi\n` +
            `node ~/repo/bin/bootstrap.mjs\n\n` +
            `Then follow ~/repo/AGENT-PROMPT.md exactly. Process these inbox message IDs: ` +
            `${ids.join(', ')}. Report results with node ~/repo/bin/report.mjs.`;

        const res = await fetch(`${DEVIN_API}/v3/organizations/${process.env.DEVIN_ORG_ID}/sessions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.DEVIN_PAT}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt,
                title: `email-tick ${new Date().toISOString()}`,
                tags: ['email-agent'],
                devin_mode: 'lite',
                max_acu_limit: Number(process.env.AGENT_MAX_ACU || 10),
                resumable: false,
                session_secrets: [
                    { key: 'AGENT_API_BASE', value: process.env.AGENT_API_BASE },
                    { key: 'AGENT_SHARED_SECRET', value: process.env.AGENT_SHARED_SECRET },
                    { key: 'GH_REPO_TOKEN', value: process.env.GH_REPO_TOKEN }
                ]
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`spawn session: HTTP ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
        return data.session_id || data.sessionId || data.id;
    }

    async function tick() {
        if (running) return;
        running = true;
        const status = {
            lastPollAt: new Date().toISOString(),
            mailOk: false, d2lOk: false,
            newFound: 0, queued: 0, spawned: false,
            note: null
        };
        try {
            // --- mail ---
            const refresh = await store.getSecret('graphRefresh');
            if (!refresh) {
                status.mailNote = 'no graph refresh token in vault — run seed.mjs';
            } else {
                try {
                    const tokens = await mintAccessToken(refresh);
                    if (tokens.refresh_token && tokens.refresh_token !== refresh) {
                        await store.setSecret('graphRefresh', tokens.refresh_token);
                    }
                    const inbox = await listInbox(tokens.access_token);
                    status.mailOk = true;

                    const state = await store.getState();
                    const processed = new Set(state.processedIds || []);
                    const activatedAt = state.activatedAt;
                    const queue = await store.getQueue();

                    // Expire stale in-flight dispatches back to pending
                    const now = Date.now();
                    for (const [id, meta] of Object.entries(queue.inFlight || {})) {
                        if (now - new Date(meta.at).getTime() > SESSION_STALE_MS) {
                            queue.pending.push(meta.msg);
                            delete queue.inFlight[id];
                        }
                    }

                    const pendingIds = new Set([
                        ...queue.pending.map(m => m.id),
                        ...Object.keys(queue.inFlight || {})
                    ]);
                    for (const msg of inbox) {
                        if (processed.has(msg.id)) continue;
                        if (activatedAt && msg.receivedDateTime < activatedAt) {
                            state.processedIds.push(msg.id);
                            continue;
                        }
                        if (!needsDraft(msg) || pendingIds.has(msg.id)) {
                            if (!needsDraft(msg)) state.processedIds.push(msg.id);
                            continue;
                        }
                        queue.pending.push({
                            id: msg.id,
                            subject: msg.subject,
                            from: msg.from?.emailAddress?.address,
                            receivedDateTime: msg.receivedDateTime
                        });
                        status.newFound++;
                    }

                    // Spawn a session if there's work and none is running
                    const activeAlive = queue.activeSessionId &&
                        now - new Date(queue.activeSince).getTime() < SESSION_STALE_MS;
                    if (queue.pending.length && !activeAlive) {
                        const batch = queue.pending.splice(0, 10);
                        const sessionId = await spawnSession(batch.map(m => m.id));
                        for (const m of batch) queue.inFlight[m.id] = { at: new Date().toISOString(), msg: m };
                        queue.activeSessionId = sessionId;
                        queue.activeSince = new Date().toISOString();
                        status.spawned = true;
                        status.queued = batch.length;
                        log.info(`[email-agent] spawned session ${sessionId} for ${batch.length} message(s)`);
                    } else {
                        status.queued = queue.pending.length;
                    }

                    await store.setState(state);
                    await store.setQueue(queue);
                } catch (err) {
                    status.mailOk = false;
                    status.mailNote = err.message;
                    log.error('[email-agent] mail poll failed:', err.message);
                }
            }

            // --- D2L keepalive ---
            await d2lKeepalive(status);

            // --- status ---
            const prev = await store.getStatus();
            status.draftsToday = prev?.draftsToday || 0;
            status.lastDraftAt = prev?.lastDraftAt || null;
            await store.setStatus(status);
        } catch (err) {
            log.error('[email-agent] tick failed:', err);
            try {
                await store.setStatus({ ...status, note: `tick error: ${err.message}` });
            } catch { /* mongo down — nothing we can do */ }
        } finally {
            running = false;
        }
    }

    return {
        tick,
        start() {
            timer = setInterval(() => tick().catch(err => log.error('[email-agent] tick err:', err)), POLL_INTERVAL_MS);
            timer.unref?.();
            tick().catch(() => {});
            log.info(`[email-agent] poller started, interval ${POLL_INTERVAL_MS / 60000}min`);
        }
    };
}

module.exports = { createPoller };
