'use strict';

// Migration: backfill `disc` on posts that were saved with disc=null.
//
// Background: GET /api/posts enforces strict isolation and returns [] when the
// session has no `disc`. Posts created before the test-launch fix (and any other
// launch path that failed to resolve a disc) were stored with disc=null, so they
// are invisible to students on refresh even though they exist in the database.
//
// Fix rule: set disc = resourceLinkId for orphaned posts. This matches what the
// corrected GET /api/posts query ({ resourceLinkId, disc }) expects for launches
// that derive disc from the resource link id (test launches and direct links).
//
// Usage:
//   node scripts/backfill-null-disc.js          # dry run — reports counts only
//   node scripts/backfill-null-disc.js --apply  # perform the update

require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const apply = process.argv.includes('--apply');

async function main() {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const posts = client.db('ksu-discussion').collection('posts');

    const orphanFilter = { $or: [{ disc: null }, { disc: { $exists: false } }] };
    const total = await posts.countDocuments(orphanFilter);

    // Cannot backfill posts that also lack a resourceLinkId — report them separately.
    const unrecoverable = await posts.countDocuments({
        ...orphanFilter,
        $or: [{ resourceLinkId: null }, { resourceLinkId: { $exists: false } }]
    });

    console.log(`Orphaned posts (disc null/missing): ${total}`);
    console.log(`  ...of which lack resourceLinkId (cannot backfill): ${unrecoverable}`);

    if (!apply) {
        console.log('\nDry run. Re-run with --apply to set disc = resourceLinkId for recoverable posts.');
        await client.close();
        return;
    }

    const recoverableFilter = {
        ...orphanFilter,
        resourceLinkId: { $exists: true, $nin: [null, ''] }
    };
    const result = await posts.updateMany(recoverableFilter, [
        { $set: { disc: '$resourceLinkId' } }
    ]);
    console.log(`\nUpdated ${result.modifiedCount} posts (disc <- resourceLinkId).`);
    await client.close();
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
