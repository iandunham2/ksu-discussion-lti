import { MongoClient } from "mongodb";
import * as path from "node:path";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

// Get all 3340 posts
const all = await posts.find({ contextId: "3991603" }).sort({ timestamp: 1 }).toArray();

// Group by author (top-level posts only for thread starters, but also include replies)
const byAuthor = new Map();
for (const p of all) {
  if (!byAuthor.has(p.authorEmail)) {
    byAuthor.set(p.authorEmail, { name: p.authorName, email: p.authorEmail, posts: [] });
  }
  byAuthor.get(p.authorEmail).posts.push(p);
}

console.log(`Total posts: ${all.length}`);
console.log(`Unique students: ${byAuthor.size}\n`);

for (const [email, s] of byAuthor) {
  const threads = s.posts.filter(p => !p.parentId);
  const replies = s.posts.filter(p => p.parentId);
  console.log(`\n=== ${s.name} (${email}) ===`);
  console.log(`  ${threads.length} thread(s), ${replies.length} reply(ies)`);
  for (const p of s.posts) {
    const type = p.parentId ? 'REPLY' : 'THREAD';
    const words = p.wordCount || p.text?.split(/\s+/).length || 0;
    console.log(`  [${type}] ${new Date(p.timestamp).toLocaleDateString()} | ${words} words | rli=${p.resourceLinkId}`);
    console.log(`    "${p.text?.substring(0, 120).replace(/\n/g, ' ')}"`);
  }
}

await client.close();
process.exit(0);
