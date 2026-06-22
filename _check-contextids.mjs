import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

const byCtx = await posts.aggregate([
  { $group: { _id: { contextId: "$contextId", rli: "$resourceLinkId" }, count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();
console.log("Posts by contextId + resourceLinkId:");
byCtx.forEach(d => console.log(`  contextId=${d._id.contextId} rli=${d._id.rli}: ${d.count}`));

// Check what contextId the new Daijah/Liam posts have
const newPosts = await posts.find({ disc: { $ne: null }, disc: { $exists: true } }).toArray();
// Actually, check recent posts by timestamp
const recent = await posts.find().sort({ timestamp: -1 }).limit(5).toArray();
console.log("\nMost recent 5 posts:");
recent.forEach(p => console.log(`  ${p.authorName} | contextId=${p.contextId} | rli=${p.resourceLinkId} | disc=${p.disc}`));

await client.close();
process.exit(0);
