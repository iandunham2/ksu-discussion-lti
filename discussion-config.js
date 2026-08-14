'use strict';

const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, 'discussions.json');

let raw;
try {
    raw = fs.readFileSync(configPath, 'utf-8');
} catch (error) {
    throw new Error(`Unable to read discussion configuration at ${configPath}: ${error.message}`);
}

let config;
try {
    config = JSON.parse(raw);
} catch (error) {
    throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
}

const TOPIC_ID_TO_DISC = config.topicIdToDisc || {};
const TITLE_TO_DISC = config.titleToDisc || {};
const INSTRUCTIONS = config.instructions || {};
const INITIAL_POST_DUE = config.initialPostDue || {};
const BLOCKED_PREFIXES = Array.isArray(config.blockedDiscPrefixes) ? config.blockedDiscPrefixes : ['3340-'];

function isBlocked(disc) {
    if (!disc) return false;
    return BLOCKED_PREFIXES.some(prefix => disc.startsWith(prefix));
}

/**
 * Resolve the internal disc key for a discussion launch.
 * Priority: query param → custom LTI param → D2L topic ID → link title → DB mapping.
 */
function resolveDisc({ queryDisc, body, resourceLinkTitle, extD2lLinkId, dbDisc }) {
    if (queryDisc && typeof queryDisc === 'string' && queryDisc.trim()) {
        return isBlocked(queryDisc.trim()) ? null : queryDisc.trim();
    }

    const customDisc = body?.custom_disc || body?.['custom_disc'];
    if (customDisc && typeof customDisc === 'string') {
        return isBlocked(customDisc.trim()) ? null : customDisc.trim();
    }

    if (extD2lLinkId && TOPIC_ID_TO_DISC[String(extD2lLinkId)]) {
        const disc = TOPIC_ID_TO_DISC[String(extD2lLinkId)];
        return isBlocked(disc) ? null : disc;
    }

    if (resourceLinkTitle && TITLE_TO_DISC[resourceLinkTitle]) {
        const disc = TITLE_TO_DISC[resourceLinkTitle];
        return isBlocked(disc) ? null : disc;
    }

    if (dbDisc && typeof dbDisc === 'string' && !isBlocked(dbDisc)) {
        return dbDisc.trim();
    }

    return null;
}

function discFromTitle(title) {
    if (!title) return null;
    const disc = TITLE_TO_DISC[title] || null;
    if (disc && isBlocked(disc)) return null;
    return disc;
}

function getInstructions(disc) {
    if (!disc) return null;
    return INSTRUCTIONS[disc] || null;
}

function getInitialPostDue(disc) {
    if (!disc) return null;
    return INITIAL_POST_DUE[disc] || null;
}

function getAllInstructions() {
    return { ...INSTRUCTIONS };
}

function getDiscLabel(disc) {
    if (!disc) return '';

    const html = INSTRUCTIONS[disc];
    if (html) {
        const h3Match = html.match(/<h3>(.*?)<\/h3>/i);
        if (h3Match) return h3Match[1].trim();
    }

    for (const [title, mappedDisc] of Object.entries(TITLE_TO_DISC)) {
        if (mappedDisc === disc) return title;
    }

    return String(disc);
}

function getDiscOptions() {
    const discs = new Set([
        ...Object.values(TOPIC_ID_TO_DISC),
        ...Object.values(TITLE_TO_DISC),
        ...Object.keys(INSTRUCTIONS),
    ]);

    return Array.from(discs)
        .filter((d) => !isBlocked(d))
        .sort()
        .map((disc) => ({ disc, label: getDiscLabel(disc) }));
}

module.exports = {
    config,                 // raw loaded config
    TOPIC_ID_TO_DISC,
    TITLE_TO_DISC,
    INSTRUCTIONS,
    INITIAL_POST_DUE,
    CORRECT_3300_INSTRUCTIONS: INSTRUCTIONS,
    BLOCKED_PREFIXES,
    resolveDisc,
    discFromTitle,
    getInstructions,
    getInitialPostDue,
    getAllInstructions,
    getDiscLabel,
    getDiscOptions,
};
