import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

const all = await posts.find({ contextId: "3991603" }).sort({ timestamp: 1 }).toArray();

console.log(`Total 3340 posts: ${all.length}\n`);
for (const p of all) {
  const type = p.parentId ? 'REPLY' : 'THREAD';
  const date = new Date(p.timestamp).toLocaleDateString();
  console.log(`\n[${type}] ${p.authorName} | ${date} | ${p.wordCount}w | rli=${p.resourceLinkId}`);
  console.log(p.text);
  console.log("════════════════════");
}

await client.close();
process.exit(0);
