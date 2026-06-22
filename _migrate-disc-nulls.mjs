import { MongoClient } from 'mongodb';
import * as fs from 'node:fs';

const uri = fs.readFileSync('/Users/idunham/CascadeProjects/windsurf-project-2/.env', 'utf-8')
  .split('\n').find(l => l.startsWith('MONGODB_URI='))?.split('=').slice(1).join('=').trim();

const client = new MongoClient(uri);
await client.connect();
const db = client.db('ksu-discussion');
const posts = db.collection('posts');

// D2L topic ID → disc key (3300 only)
const TOPIC_ID_TO_DISC = {
  '62324565': '3300-disc0',
  '62324566': '3300-disc1',
  '62324567': '3300-disc2',
  '62324568': '3300-disc3',
  '62324569': '3300-disc4',
  '62324570': '3300-disc5',
  '62324571': '3300-disc6',
  '62324572': '3300-disc7',
  '62324573': '3300-disc8',
};

// Also map by resourceLinkTitle fallback
const TITLE_TO_DISC = {
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
};

const nullPosts = await posts.find({
  $or: [{ disc: null }, { disc: 'null' }],
  resourceLinkId: 'usgq-41152027_3991591'
}).toArray();

// Sort by MongoDB ObjectId creation time (first 4 bytes = unix timestamp)
nullPosts.sort((a, b) => {
  const ta = parseInt(String(a._id).slice(0, 8), 16);
  const tb = parseInt(String(b._id).slice(0, 8), 16);
  return ta - tb;
});

console.log(`Found ${nullPosts.length} MENT 3300 posts with null disc\n`);

// Keyword-based disc assignment
function guessDisc(content) {
  const c = (content || '').toLowerCase();
  // disc0: introductions — "my name is", self-intro patterns
  if (c.match(/\bmy name is\b|\bi am a .*(student|major|minor)\b|\bintroduce\b/)) return '3300-disc0';
  // disc2: peer critique — video links, episode analysis, "for discussion one/two"
  if (c.match(/\bvideo link\b|youtube\.com|youtu\.be|\bfor discussion (one|two|1|2)\b|\bhost episode\b|\bsolo (talking head|episode)\b|\bepisode [12]\b|\bframing\b|\baudio quality\b|\bpeer critique\b|\bwatched.*episode\b|\bepisode.*watched\b|\bfor this discussion\b|\bi decided to (analyze|watch|choose)\b/)) return '3300-disc2';
  // disc1: podcast topic choice — broad catch for topic posts
  if (c.match(/\bpodcast topic\b|\bmy podcast (will|would|is going|revolves|focuses|is about)\b|\bpodcast (idea|concept|title)\b|\bniche\b|\bfor my podcast\b|\bi want my podcast\b|\bmy podcast\b|\bi (have |'ve |have )decided (to do|on) my podcast\b|\bthe topic of my podcast\b|\bi also had the idea\b|\bpreviously.*discussion post\b|\bi want.*podcast.*focus\b|\bhello.*podcast\b/)) return '3300-disc1';
  // disc2 fallback: "I forgot to add my name" orphan reply — known to be about a disc2 parent
  if (c.match(/\bi forgot to add my name\b/)) return '3300-disc2';
  return null;
}

// Build parent→disc map first (top-level posts get disc, replies inherit)
const discMap = {};

// First pass: assign top-level posts
for (const p of nullPosts) {
  if (!p.parentId) {
    const content = p.content || p.text || '';
    const disc = guessDisc(content);
    discMap[String(p._id)] = disc;
    const ts = new Date(parseInt(String(p._id).slice(0, 8), 16) * 1000).toISOString().slice(0, 10);
    console.log(`[${ts}] TOP-LEVEL → ${disc || 'UNKNOWN'}: ${content.slice(0, 80)}`);
  }
}

// Second pass: replies inherit parent disc
for (const p of nullPosts) {
  if (p.parentId) {
    const parentDisc = discMap[String(p.parentId)];
    discMap[String(p._id)] = parentDisc || null;
  }
}

// For replies with unknown disc, look up parent from DB
const unknownReplies = nullPosts.filter(p => p.parentId && !discMap[String(p._id)]);
for (const p of unknownReplies) {
  const parentPost = await posts.findOne({ _id: p.parentId });
  if (parentPost && parentPost.disc && !['null', null].includes(parentPost.disc)) {
    discMap[String(p._id)] = parentPost.disc;
  }
}

// Apply assignments
let updated = 0, skipped = 0;
for (const p of nullPosts) {
  const disc = discMap[String(p._id)];
  if (disc) {
    await posts.updateOne({ _id: p._id }, { $set: { disc } });
    updated++;
  } else {
    skipped++;
    console.log(`  SKIP: id=${p._id} parentId=${p.parentId} content="${String(p.content||'').slice(0,80)}"`);
  }
}

// Summary
const counts = {};
for (const disc of Object.values(discMap)) {
  if (disc) counts[disc] = (counts[disc] || 0) + 1;
}
console.log(`\nUpdated ${updated} posts, skipped ${skipped} unknowns:`);
for (const [d, c] of Object.entries(counts).sort()) console.log(`  ${d} → ${c}`);

await client.close();
process.exit(0);
