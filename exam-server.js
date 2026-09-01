#!/usr/bin/env node
// Entry point for the dedicated exam LTI server.
// This is a second deployment of the same AI-Monitored Discussion Tool code,
// running with EXAM_MODE=true and a separate exam-only discussions config.
// Students see only their own submission, cannot reply to classmates, and can
// submit only once before the configured deadline.
'use strict';

const path = require('path');

process.env.EXAM_MODE = 'true';
process.env.DISCUSSIONS_CONFIG_PATH = path.resolve(__dirname, 'exams.json');

require('./server.js');
