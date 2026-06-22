import { MongoClient } from "mongodb";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const envPath = path.join(import.meta.dirname || process.cwd(), ".env");
const env = fs.readFileSync(envPath, "utf-8");
const m = env.match(/MONGODB_URI=(.+)/);
if (!m) { console.log("No MONGODB_URI in .env"); process.exit(1); }
const mongoUri = m[1].trim();

const client = new MongoClient(mongoUri);
await client.connect();
const db = client.db();
const posts = db.collection("posts");

const result = await posts.aggregate([
  { $group: { _id: "$resourceLinkId", count: { $sum: 1 }, title: { $first: "$resourceLinkTitle" }, context: { $first: "$contextTitle" } } },
  { $sort: { count: -1 } }
]).toArray();

console.log(`\n=== Distinct resource_link_ids ===\n`);
for (const r of result) {
  console.log(`  "${r._id}" — ${r.count} posts — title: "${r.title}" — course: "${r.context}"`);
}

const sample = await posts.findOne({});
console.log(`\n=== All fields on a sample post ===`);
console.log(Object.keys(sample).join(', '));

await client.close();
process.exit(0);
