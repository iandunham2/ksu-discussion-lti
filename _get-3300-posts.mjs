import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");

// Show all distinct contextIds to find 3300
const contexts = await posts.aggregate([
  { $group: { _id: "$contextId", title: { $first: "$contextTitle" }, count: { $sum: 1 }, rlis: { $addToSet: "$resourceLinkId" } } },
  { $sort: { count: -1 } }
]).toArray();

console.log("All contextIds in MongoDB:");
contexts.forEach(c => console.log(`  contextId=${c._id} | "${c.title}" | ${c.count} posts | rlis=${JSON.stringify(c.rlis)}`));

await client.close();
process.exit(0);
