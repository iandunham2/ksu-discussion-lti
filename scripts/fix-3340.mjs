#!/usr/bin/env node
// One-off maintenance script: flip the 13 COMM 3340 discussion topics from
// TopicType 3 (plain URL link) to TopicType 5 (External Learning Tool / LTI placement)
// in D2L (Brightspace) for course offering 3991603.
//
// SECURITY: this is intentionally a local script, NOT an HTTP route.
//   - The D2L session credential is read from an environment variable, never a
//     URL/query param, so it does not leak into server logs, browser history,
//     proxies, or Referer headers.
//   - It is run manually by an operator who owns the session, then exits. It is
//     never deployed or exposed as an endpoint, so there is no CSRF surface and
//     no standing credential-replay capability in the running service.
//
// Usage:
//   D2L_SESSION_VAL=xxxx [D2L_SECURITY_TOKEN=yyyy] node scripts/fix-3340.mjs [--apply]
//
//   Without --apply (default) the script only reads each topic and prints its
//   current state (a dry run / "check"). Pass --apply to actually PUT the change.
//
// Requires Node 18+ (global fetch).

const COURSE_ID = '3991603';
const API_BASE = `https://kennesaw.view.usg.edu/d2l/api/le/1.67/${COURSE_ID}/content/topics`;
const DELAY_MS = 300;
const TARGET_TYPE = 5;
const OLD_TYPE = 3;

// topicId -> expected disc param (for human-readable reporting only)
const TOPICS = [
  ['61805440', '3340-mod1'],
  ['61805441', '3340-mod2'],
  ['61805442', '3340-mod3'],
  ['61805443', '3340-mod4'],
  ['61805444', '3340-mod5'],
  ['61805445', '3340-mod6'],
  ['61805446', '3340-mod7'],
  ['61805447', '3340-mod8'],
  ['61805448', '3340-mod9'],
  ['61805449', '3340-mod10'],
  ['61805450', '3340-mod11'],
  ['61805451', '3340-mod13'],
  ['61805452', '3340-mod15'],
];

const sessionVal = process.env.D2L_SESSION_VAL;
const securityToken = process.env.D2L_SECURITY_TOKEN || '';
const apply = process.argv.includes('--apply');

if (typeof fetch !== 'function') {
  console.error('This script requires Node 18+ (global fetch is unavailable).');
  process.exit(1);
}
if (!sessionVal) {
  console.error('Missing required env var D2L_SESSION_VAL (value of the d2lSessionVal cookie).');
  console.error('Run: D2L_SESSION_VAL=... [D2L_SECURITY_TOKEN=...] node scripts/fix-3340.mjs [--apply]');
  process.exit(1);
}

const cookie = `d2lSessionVal=${sessionVal}` + (securityToken ? `; d2lSecurityToken=${securityToken}` : '');

function authHeaders(extra = {}) {
  const h = { Cookie: cookie, ...extra };
  if (securityToken) h['X-Csrf-Token'] = securityToken;
  return h;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTopic(id) {
  const res = await fetch(`${API_BASE}/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${id} -> HTTP ${res.status}`);
  return res.json();
}

async function putTopic(id, body) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PUT ${id} -> HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  // D2L may return the updated entity or 200 with empty body; tolerate both.
  return res.json().catch(() => ({}));
}

function row(cols) {
  return cols.map((c) => String(c).padEnd(16)).join(' ');
}

async function main() {
  console.log(`COMM 3340 topic fix — course ${COURSE_ID}`);
  console.log(`Mode: ${apply ? 'APPLY (will PUT changes)' : 'DRY RUN (read only — pass --apply to write)'}`);
  console.log('');
  console.log(row(['topicId', 'disc', 'before', 'after', 'status']));
  console.log('-'.repeat(80));

  let fixed = 0;
  let already = 0;
  let errors = 0;

  for (const [id, disc] of TOPICS) {
    let before = '?';
    let after = '?';
    let status = '';
    try {
      const topic = await getTopic(id);
      before = topic.TopicType;

      if (topic.TopicType === TARGET_TYPE) {
        after = topic.TopicType;
        status = 'already-correct';
        already++;
      } else if (topic.TopicType === OLD_TYPE) {
        if (apply) {
          // Preserve every existing field; only change TopicType. This keeps
          // Url (with ?disc=...), ToolId, ToolItemId, ActivityType, etc. intact.
          const updated = { ...topic, TopicType: TARGET_TYPE };
          await putTopic(id, updated);
          // Re-read to confirm the persisted value.
          await sleep(DELAY_MS);
          const verify = await getTopic(id);
          after = verify.TopicType;
          status = after === TARGET_TYPE ? 'fixed' : 'put-but-unverified';
          if (after === TARGET_TYPE) fixed++; else errors++;
        } else {
          after = `${TARGET_TYPE} (pending)`;
          status = 'would-fix';
        }
      } else {
        after = topic.TopicType;
        status = `unexpected-type`;
        errors++;
      }
    } catch (err) {
      status = `ERROR: ${err.message}`;
      errors++;
    }
    console.log(row([id, disc, before, after, status]));
    await sleep(DELAY_MS);
  }

  console.log('-'.repeat(80));
  console.log(`Done. fixed=${fixed} already-correct=${already} errors/other=${errors}`);
  if (!apply) console.log('No changes were written. Re-run with --apply to perform the fix.');
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
