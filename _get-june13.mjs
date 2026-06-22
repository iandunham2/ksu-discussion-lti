import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

const start = new Date("2026-06-12T00:00:00Z");
const end   = new Date("2026-06-14T00:00:00Z");
const p = await posts.find({ contextId: "3991603", timestamp: { $gte: start.toISOString(), $lt: end.toISOString() } })
  .sort({ timestamp: 1 }).toArray();

for (const post of p) {
  console.log(`${post.authorName} | ${post.wordCount}w | parentId=${post.parentId || null}`);
  console.log(post.text.substring(0, 300));
  console.log("---");
}

await client.close();
process.exit(0);
