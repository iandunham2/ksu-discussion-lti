'use strict';
// AES-256-GCM encrypt/decrypt for vault blobs, keyed by AGENT_VAULT_KEY.
const crypto = require('crypto');

function key() {
    return crypto.scryptSync(process.env.AGENT_VAULT_KEY, 'email-agent-vault', 32);
}

function encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
        iv: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
        data: data.toString('hex')
    };
}

function decrypt(blob) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(blob.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(blob.data, 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
