const { getLogger } = require('d2l-shared');
const log = getLogger('test-get-launch');
const express = require('express');
const app = express();

// Simple test for the GET handler
app.all('/lti/launch', (req, res, next) => {
    log.info(`[LTI Launch] ${req.method} ${req.originalUrl}`);
    log.info(`  Query: ${JSON.stringify(req.query)}`);
    if (req.method === 'GET') {
        if (req.query.disc) {
            const contextId = req.query.disc.includes('3340') ? '3991603' : '3991591';
            log.info(`  Redirecting to course ${contextId}`);
            return res.redirect(`https://kennesaw.view.usg.edu/d2l/le/content/${contextId}/Home`);
        }
        return res.status(400).send('Invalid LTI launch. Please access from D2L.');
    }
    next();
});

app.post('/lti/launch', (req, res) => {
    res.send('LTI POST launch would happen here');
});

const PORT = 3456;
app.listen(PORT, () => {
    log.info(`Test server on port ${PORT}`);
    log.info('Testing GET /lti/launch?disc=3340-mod5...');
    
    // Test the GET request
    setTimeout(() => {
        const http = require('http');
        const req = http.request({
            hostname: 'localhost',
            port: PORT,
            path: '/lti/launch?disc=3340-mod5',
            method: 'GET'
        }, (res) => {
            log.info(`\nTest result: ${res.statusCode} ${res.statusMessage}`);
            log.info(`Location header: ${res.headers.location}`);
            if (res.statusCode === 302 && res.headers.location?.includes('3991603')) {
                log.info('✅ GET handler works correctly!');
            } else {
                log.info('❌ GET handler failed');
            }
            process.exit(0);
        });
        req.end();
    }, 1000);
});
