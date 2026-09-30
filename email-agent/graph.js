'use strict';
// Microsoft Graph helpers: refresh-token minting and inbox listing.
// Uses the Microsoft Office first-party public client (v1 token endpoint) —
// no app registration or admin consent required.
const GRAPH = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = 'https://login.microsoftonline.com/organizations/oauth2/token';
const CLIENT_ID = process.env.GRAPH_CLIENT_ID || 'd3590ed6-52b3-4102-aeff-aad2292ab01c'; // Microsoft Office
const RESOURCE = 'https://graph.microsoft.com';

async function mintAccessToken(refreshToken) {
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            resource: RESOURCE
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`token refresh: ${data.error} ${data.error_description || ''}`.slice(0, 300));
    return data; // { access_token, refresh_token, expires_in }
}

async function listInbox(accessToken, top = 50) {
    const res = await fetch(
        `${GRAPH}/me/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc` +
        `&$select=id,subject,from,receivedDateTime,conversationId,internetMessageId`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(`inbox list: HTTP ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
    return data.value;
}

const SELF = (process.env.AGENT_SELF_ADDRESS || 'idunham@kennesaw.edu').toLowerCase();

// Conservative prefilter — ambiguous mail still goes to a Devin session for
// judgment; we only skip obvious automation senders here.
function needsDraft(msg) {
    const from = (msg.from?.emailAddress?.address || '').toLowerCase();
    if (!from || from === SELF) return false;
    if (/(?:no-?reply|donotreply|mailer-?daemon|postmaster|notifications@|newsletter|digest@|bounce)/i.test(from)) return false;
    return true;
}

module.exports = { mintAccessToken, listInbox, needsDraft, SELF };
