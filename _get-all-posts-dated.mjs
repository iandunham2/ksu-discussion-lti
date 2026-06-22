import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

const all = await posts.find({ contextId: "3991603", resourceLinkId: "usgq-41014105_3991603" })
  .sort({ timestamp: 1 }).toArray();

// Group by date bucket to see which discussions happened when
const byDate = new Map();
for (const p of all) {
  const d = new Date(p.timestamp);
  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (!byDate.has(key)) byDate.set(key, []);
  byDate.get(key).push(p);
}

for (const [date, posts] of [...byDate.entries()].sort()) {
  const threads = posts.filter(p => !p.parentId);
  const replies = posts.filter(p => p.parentId);
  console.log(`\n--- ${date} (${threads.length} threads, ${replies.length} replies) ---`);
  for (const p of threads) {
    const words = p.wordCount || 0;
    console.log(`  THREAD | ${p.authorName} | ${words}w | "${p.text.substring(0,100).replace(/\n/g,' ')}"`);
  }
}

await client.close();
process.exit(0);
