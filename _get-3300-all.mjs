import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

const all = await posts.find({ contextId: "3991591" }).sort({ timestamp: 1 }).toArray();
console.log(`Total 3300 posts: ${all.length}\n`);

// Summary by date + author
const byDate = new Map();
for (const p of all) {
  const d = new Date(p.timestamp).toLocaleDateString();
  if (!byDate.has(d)) byDate.set(d, []);
  byDate.get(d).push(p);
}

for (const [date, ps] of byDate) {
  const threads = ps.filter(p => !p.parentId);
  const replies = ps.filter(p => p.parentId);
  console.log(`\n--- ${date} (${threads.length} threads, ${replies.length} replies) ---`);
  for (const p of threads) {
    console.log(`  THREAD | ${p.authorName} | ${p.wordCount}w | "${p.text.substring(0,100).replace(/\n/g,' ')}"`);
  }
  for (const p of replies) {
    console.log(`  REPLY  | ${p.authorName} | ${p.wordCount}w`);
  }
}

await client.close();
process.exit(0);
