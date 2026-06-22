import { MongoClient } from "mongodb";

const uri = "mongodb+srv://ksu-app:tXiZ8mkzXvqKCTeA@cluster0.k3bgecq.mongodb.net/ksu-discussion?retryWrites=true&w=majority";
const client = new MongoClient(uri);
await client.connect();
const db = client.db("ksu-discussion");
const posts = db.collection("posts");
const rli = "usgq-41014105_3991603";

// What does { resourceLinkId } return (no disc filter)?
const q1 = await posts.countDocuments({ resourceLinkId: rli });
console.log("Query { resourceLinkId } only:", q1);

// What does { resourceLinkId, disc: null } return?
const q2 = await posts.countDocuments({ resourceLinkId: rli, disc: null });
console.log("Query { resourceLinkId, disc: null }:", q2);

// What does { resourceLinkId, disc: undefined } return?
const q3 = await posts.countDocuments({ resourceLinkId: rli, disc: undefined });
console.log("Query { resourceLinkId, disc: undefined }:", q3);

// Check what BSON type the disc field is on a sample post
const sample = await posts.findOne({ resourceLinkId: rli });
console.log("\nSample post disc field:", sample?.disc, typeof sample?.disc);
console.log("Sample post keys:", Object.keys(sample || {}));

await client.close();
process.exit(0);
