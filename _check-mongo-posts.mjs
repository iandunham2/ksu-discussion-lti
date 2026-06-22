import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

const total = await posts.countDocuments();
console.log("Total posts:", total);

// Count by disc value
const byDisc = await posts.aggregate([
  { $group: { _id: "$disc", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();
console.log("\nPosts by disc value:");
byDisc.forEach(d => console.log(`  disc=${JSON.stringify(d._id)}: ${d.count}`));

// Count by resourceLinkId
const byRLI = await posts.aggregate([
  { $group: { _id: "$resourceLinkId", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();
console.log("\nPosts by resourceLinkId:");
byRLI.forEach(d => console.log(`  rli=${JSON.stringify(d._id)}: ${d.count}`));

await client.close();
process.exit(0);
