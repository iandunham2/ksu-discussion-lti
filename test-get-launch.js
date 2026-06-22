const express = require('express');
const app = express();

// Simple test for the GET handler
app.all('/lti/launch', (req, res, next) => {
    console.log(`[LTI Launch] ${req.method} ${req.originalUrl}`);
    console.log(`  Query: ${JSON.stringify(req.query)}`);
    if (req.method === 'GET') {
        if (req.query.disc) {
            const contextId = req.query.disc.includes('3340') ? '3991603' : '3991591';
            console.log(`  Redirecting to course ${contextId}`);
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
    console.log(`Test server on port ${PORT}`);
    console.log('Testing GET /lti/launch?disc=3340-mod5...');
    
    // Test the GET request
    setTimeout(() => {
        const http = require('http');
        const req = http.request({
            hostname: 'localhost',
            port: PORT,
            path: '/lti/launch?disc=3340-mod5',
            method: 'GET'
        }, (res) => {
            console.log(`\nTest result: ${res.statusCode} ${res.statusMessage}`);
            console.log(`Location header: ${res.headers.location}`);
            if (res.statusCode === 302 && res.headers.location?.includes('3991603')) {
                console.log('✅ GET handler works correctly!');
            } else {
                console.log('❌ GET handler failed');
            }
            process.exit(0);
        });
        req.end();
    }, 1000);
});
