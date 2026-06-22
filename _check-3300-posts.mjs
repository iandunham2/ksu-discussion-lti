import { MongoClient } from 'mongodb';
import * as fs from 'node:fs';

const uri = fs.readFileSync('/Users/idunham/CascadeProjects/windsurf-project-2/.env', 'utf-8')
  .split('\n').find(l => l.startsWith('MONGODB_URI='))?.split('=').slice(1).join('=').trim();

console.log('Connecting to:', uri?.slice(0, 40) + '...');
const client = new MongoClient(uri);
await client.connect();
const db = client.db('ksu-discussion');
const posts = db.collection('posts');

// Show distinct disc values and count
const discCounts = await posts.aggregate([
  { $group: { _id: '$disc', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();

console.log('\nDisc values in ksu-discussion.posts:');
for (const d of discCounts) {
  console.log(`  disc="${d._id}" → ${d.count} posts`);
}

await client.close();
process.exit(0);
