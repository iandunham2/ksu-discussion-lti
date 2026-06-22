import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

// Module 2 = Jun 8-11 posts on old LTI link
const start = new Date("2026-06-08T00:00:00Z");
const end   = new Date("2026-06-12T00:00:00Z");
const mod2 = await posts.find({
  contextId: "3991603",
  resourceLinkId: "usgq-41014105_3991603",
  timestamp: { $gte: start.toISOString(), $lt: end.toISOString() }
}).sort({ timestamp: 1 }).toArray();

console.log(`Module 2 posts (Jun 8-11): ${mod2.length}\n`);

const byAuthor = new Map();
for (const p of mod2) {
  if (!byAuthor.has(p.authorEmail)) {
    byAuthor.set(p.authorEmail, { name: p.authorName, email: p.authorEmail, posts: [] });
  }
  byAuthor.get(p.authorEmail).posts.push(p);
}

for (const [email, s] of byAuthor) {
  const threads = s.posts.filter(p => !p.parentId);
  const replies = s.posts.filter(p => p.parentId);
  console.log(`\n=== ${s.name} (${email}) ===`);
  console.log(`  Threads: ${threads.length}, Replies: ${replies.length}`);
  for (const p of s.posts) {
    const type = p.parentId ? 'REPLY' : 'THREAD';
    console.log(`\n  [${type}] ${new Date(p.timestamp).toLocaleDateString()} | ${p.wordCount}w`);
    console.log(p.text);
    console.log("---");
  }
}

await client.close();
process.exit(0);
