'use strict';
// Mongo-backed state, vault, and status stores for the email agent.
const { encrypt, decrypt } = require('./crypto');

const STATE_ID = 'state';
const STATUS_ID = 'status';
const QUEUE_ID = 'queue';

function stores(db) {
    const state = db.collection('agentState');
    const vault = db.collection('agentVault');
    const status = db.collection('agentStatus');
    const queue = db.collection('agentQueue');

    return {
        async getState() {
            const doc = await state.findOne({ _id: STATE_ID });
            return doc?.data || { activatedAt: new Date().toISOString(), processedIds: [], drafts: [] };
        },
        async setState(data) {
            data.processedIds = (data.processedIds || []).slice(-5000);
            data.drafts = (data.drafts || []).slice(-1000);
            await state.updateOne({ _id: STATE_ID }, { $set: { data } }, { upsert: true });
        },
        async getQueue() {
            const doc = await queue.findOne({ _id: QUEUE_ID });
            return doc?.data || { pending: [], inFlight: {}, activeSessionId: null, activeSince: null };
        },
        async setQueue(data) {
            await queue.updateOne({ _id: QUEUE_ID }, { $set: { data } }, { upsert: true });
        },
        async getSecret(name) {
            const doc = await vault.findOne({ _id: name });
            return doc?.blob ? decrypt(doc.blob) : null;
        },
        async setSecret(name, plaintext) {
            await vault.updateOne(
                { _id: name },
                { $set: { blob: encrypt(plaintext), updatedAt: new Date() } },
                { upsert: true }
            );
        },
        async getConfig(name) {
            const doc = await vault.findOne({ _id: name });
            return doc?.value ?? null;
        },
        async setConfig(name, value) {
            await vault.updateOne({ _id: name }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
        },
        async getStatus() {
            const doc = await status.findOne({ _id: STATUS_ID });
            return doc?.data || null;
        },
        async setStatus(data) {
            await status.updateOne({ _id: STATUS_ID }, { $set: { data } }, { upsert: true });
        }
    };
}

module.exports = { stores };
