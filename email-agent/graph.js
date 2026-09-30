'use strict';
// Microsoft Graph helpers: refresh-token minting and inbox listing.
// Uses Microsoft's public client (Azure CLI) — no app registration required.
const GRAPH = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token';
const CLIENT_ID = process.env.GRAPH_CLIENT_ID || '04b07795-8ddb-461a-bbee-02f9e1bf7b46'; // Azure CLI
const SCOPES = 'https://graph.microsoft.com/Mail.Read Mail.ReadWrite offline_access';

async function mintAccessToken(refreshToken) {
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            scope: SCOPES
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
