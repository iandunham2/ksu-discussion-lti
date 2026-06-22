import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

// Posts from the new Module 2 LTI link (rli=5720786) — the actual Disc 2 submissions
const mod2Posts = await posts.find({ contextId: "3991603", resourceLinkId: "5720786" }).sort({ timestamp: 1 }).toArray();

console.log(`Module 2 (rli=5720786) posts: ${mod2Posts.length}\n`);

const byAuthor = new Map();
for (const p of mod2Posts) {
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
    const words = p.wordCount || p.text?.split(/\s+/).length || 0;
    console.log(`\n  [${type}] ${new Date(p.timestamp).toLocaleDateString()} | ${words} words`);
    console.log(`  ${p.text}`);
  }
}

await client.close();
process.exit(0);
