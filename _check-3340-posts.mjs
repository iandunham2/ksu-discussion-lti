import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

// Get all 3340 posts and show key fields
const all = await posts.find({ resourceLinkId: "usgq-41014105_3991603" })
  .sort({ timestamp: -1 }).toArray();

console.log(`3340 posts: ${all.length}\n`);
all.forEach(p => {
  console.log(`[${p._id}] author=${p.authorName} disc=${JSON.stringify(p.disc)} parentId=${p.parentId || null} rli=${p.resourceLinkId}`);
});

await client.close();
process.exit(0);
