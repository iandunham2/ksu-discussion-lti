'use strict';

class DiscussionBoard {
    constructor() {
        this.editor = document.getElementById('editor');
        this.wordCount = document.getElementById('word-count');
        this.charCount = document.getElementById('char-count');
        this.userInfoDisplay = document.getElementById('user-info');
        this.contextInfo = document.getElementById('context-info');
        this.discussionTitle = document.getElementById('discussion-title');
        this.postsContainer = document.getElementById('posts-container');
        this.submitPostBtn = document.getElementById('submit-post-btn');
        this.saveDraftBtn = document.getElementById('save-draft-btn');
        this.cancelReplyBtn = document.getElementById('cancel-reply-btn');
        this.composeHeading = document.getElementById('compose-heading');
        this.refreshBtn = document.getElementById('refresh-posts-btn');
        this.pasteWarning = document.getElementById('paste-warning');

        this.userInfo = null;
        this.replyingTo = null; // parentId for reply mode

        // Typing analytics
        this.keystrokeCounter = 0;
        this.pasteAttempts = 0;
        this.sessionStartMs = Date.now();
        this.recentKeystrokeTimestamps = [];
        this.lastKnownLength = 0;
        this.lastKnownLengthAtBlur = 0;

        this.typingAnalytics = {
            lastKeystrokeTime: null,
            interKeystrokeDelays: [],
            burstCount: 0,
            suspiciousPatterns: [],
            longPauses: [],
            rapidBursts: [],
            backspaceCount: 0,
            deleteCount: 0,
            focusChanges: [],
            wpmSamples: [],
            suspectedInjections: [],
            sessionTimeline: []
        };

        this.init();
    }

    init() {
        this.setupEditorEvents();
        this.setupFocusTracking();
        this.setupMutationObserver();
        this.startWPMSampling();
        this.addTimelineEvent('session_started', 'Session started');
        this.fetchUserInfo();
        this.setupUIEvents();
        this.startAutoRefresh();
    }

    // ======================
    // USER & CONTEXT
    // ======================

    async fetchUserInfo() {
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                this.userInfo = await response.json();
                this.userInfoDisplay.textContent = `Logged in as: ${this.userInfo.name}`;
                this.contextInfo.textContent = this.userInfo.contextTitle || '';
                this.discussionTitle.textContent = this.userInfo.resourceLinkTitle || 'Discussion Board';
                if (this.userInfo.instructions) {
                    const panel = document.getElementById('instructions-panel');
                    if (panel) { panel.innerHTML = this.userInfo.instructions; panel.style.display = 'block'; }
                }
                this.refreshSubmitState();
                this.loadPosts();
                this.loadDraft();
            } else {
                this.userInfoDisplay.innerHTML = '<span style="color:#FFC72C;">Please launch from D2L</span>';
                this.submitPostBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            this.userInfoDisplay.textContent = 'Authentication error';
            this.submitPostBtn.disabled = true;
        }
    }

    // ======================
    // POSTS
    // ======================

    async loadPosts() {
        try {
            const response = await fetch('/api/posts');
            if (!response.ok) throw new Error('Failed to load');
            const posts = await response.json();
            this.renderPosts(posts);
        } catch (error) {
            console.error('Error loading posts:', error);
            this.postsContainer.innerHTML = '<p class="error-msg">Failed to load posts.</p>';
        }
    }

    renderPosts(posts) {
        if (posts.length === 0) {
            this.postsContainer.innerHTML = '<p class="empty-msg">No posts yet. Be the first to start the discussion!</p>';
            return;
        }

        // Separate top-level posts and replies
        const topLevel = posts.filter(p => !p.parentId);
        const replies = posts.filter(p => p.parentId);

        const html = topLevel.map(post => {
            const postReplies = replies
                .filter(r => r.parentId === post.id)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            return `
                <div class="post-card" data-post-id="${post.id}">
                    <div class="post-header">
                        <strong class="post-author">${this.escapeHtml(post.authorName)}</strong>
                        <span class="post-time">${this.formatTime(post.timestamp)}</span>
                    </div>
                    <div class="post-body">${this.escapeHtml(post.text)}</div>
                    <div class="post-footer">
                        <span class="post-word-count">${post.wordCount} words</span>
                        <button class="reply-btn" data-reply-id="${post.id}" data-reply-name="${this.escapeHtml(post.authorName)}">Reply</button>
                    </div>
                    ${postReplies.length > 0 ? `
                        <div class="replies">
                            ${postReplies.map(reply => `
                                <div class="reply-card">
                                    <div class="post-header">
                                        <strong class="post-author">${this.escapeHtml(reply.authorName)}</strong>
                                        <span class="post-time">${this.formatTime(reply.timestamp)}</span>
                                    </div>
                                    <div class="post-body">${this.escapeHtml(reply.text)}</div>
                                    <span class="post-word-count">${reply.wordCount} words</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        this.postsContainer.innerHTML = html;
    }

    startReply(postId, authorName) {
        this.replyingTo = postId;

        // Update heading
        this.composeHeading.textContent = `Replying to ${authorName}`;
        this.cancelReplyBtn.style.display = 'inline-block';

        // Show prominent reply banner
        let banner = document.getElementById('reply-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'reply-banner';
            banner.style.cssText = 'background:#FFC72C;color:#000;padding:8px 14px;border-radius:6px;font-weight:600;font-size:0.95em;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;';
            this.editor.parentNode.insertBefore(banner, this.editor);
        }
        banner.innerHTML = `<span>↩ Replying to <strong>${this.escapeHtml(authorName)}</strong></span>`;
        banner.style.display = 'flex';

        // Highlight the post being replied to
        document.querySelectorAll('.post-card.replying-target').forEach(el => el.classList.remove('replying-target'));
        const target = document.querySelector(`.post-card[data-post-id="${postId}"]`);
        if (target) target.classList.add('replying-target');

        // Scroll compose area into view — works inside D2L iframes
        const section = document.getElementById('compose-section');
        try {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            section.scrollIntoView(true);
        }
        // Delay focus slightly so scroll completes first
        setTimeout(() => { try { this.editor.focus(); } catch(e) {} }, 200);
    }

    cancelReply() {
        this.replyingTo = null;
        this.composeHeading.textContent = 'New Post';
        this.cancelReplyBtn.style.display = 'none';
        const banner = document.getElementById('reply-banner');
        if (banner) banner.style.display = 'none';
        document.querySelectorAll('.post-card.replying-target').forEach(el => el.classList.remove('replying-target'));
    }

    async submitPost() {
        const text = this.editor.textContent.trim();

        if (!this.userInfo) {
            alert('Please wait for authentication.');
            return;
        }
        if (!text || text.length < 10) {
            alert('Please write at least 10 characters.');
            return;
        }

        this.submitPostBtn.disabled = true;
        this.submitPostBtn.textContent = 'Posting...';
        this.addTimelineEvent('submitted', `Post submitted (${text.split(/\s+/).length} words)`);

        try {
            const analytics = this.buildAnalyticsPayload();

            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    parentId: this.replyingTo || null,
                    typingAnalytics: analytics,
                    sessionTimeline: this.typingAnalytics.sessionTimeline
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to post');
            }

            // Success — reset editor
            this.editor.textContent = '';
            this.cancelReply();
            this.resetAnalytics();
            this.updateStats();
            this.loadPosts();

            this.submitPostBtn.textContent = '✅ Posted!';
            setTimeout(() => { this.submitPostBtn.textContent = 'Post'; this.refreshSubmitState(); }, 1500);

        } catch (error) {
            console.error('Submit error:', error);
            alert('Failed to post: ' + error.message);
            this.submitPostBtn.textContent = 'Post';
            this.refreshSubmitState();
        }
    }

    buildAnalyticsPayload() {
        const delays = this.typingAnalytics.interKeystrokeDelays;
        const avg = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
        const stdDev = delays.length > 0 ? Math.sqrt(delays.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / delays.length) : 0;
        const cv = avg > 0 ? (stdDev / avg) * 100 : 100;

        let suspicionScore = 0;
        if (delays.length >= 30) {
            if (cv < 30) suspicionScore += 20;
            if (cv < 20) suspicionScore += 10;
            const veryFastRatio = delays.filter(d => d < 50).length / delays.length;
            if (veryFastRatio > 0.5) suspicionScore += 15;
            if (veryFastRatio > 0.7) suspicionScore += 10;
            if (this.typingAnalytics.rapidBursts.length > 5) suspicionScore += 10;
            const textLen = this.editor.textContent.length;
            const corrections = this.typingAnalytics.backspaceCount + this.typingAnalytics.deleteCount;
            const corrRatio = corrections / Math.max(textLen, 1);
            if (corrRatio < 0.03 && textLen > 200) suspicionScore += 15;
            if (corrRatio < 0.01 && textLen > 500) suspicionScore += 10;
            const suspiciousRefocuses = this.typingAnalytics.focusChanges.filter(f => f.type === 'focus' && (f.textGrowthAfterReturn || 0) > 20);
            if (suspiciousRefocuses.length > 0) suspicionScore += 15;
            if (this.typingAnalytics.suspectedInjections.length > 0) suspicionScore += 20;
            const wpmSpikes = this.typingAnalytics.suspiciousPatterns.filter(p => p.type === 'wpm_spike');
            if (wpmSpikes.length > 0) suspicionScore += 10;
            if (this.pasteAttempts > 0) suspicionScore += 5;
        }

        return {
            suspicionScore: Math.min(100, suspicionScore),
            totalKeystrokes: this.keystrokeCounter,
            avgDelay: Math.round(avg),
            stdDevDelay: Math.round(stdDev),
            backspaceCount: this.typingAnalytics.backspaceCount,
            deleteCount: this.typingAnalytics.deleteCount,
            pasteAttempts: this.pasteAttempts,
            rapidBurstCount: this.typingAnalytics.rapidBursts.length,
            longPauseCount: this.typingAnalytics.longPauses.length,
            focusChanges: this.typingAnalytics.focusChanges,
            suspiciousPatterns: this.typingAnalytics.suspiciousPatterns,
            suspectedInjections: this.typingAnalytics.suspectedInjections,
            wpmSamples: this.typingAnalytics.wpmSamples
        };
    }

    resetAnalytics() {
        this.keystrokeCounter = 0;
        this.pasteAttempts = 0;
        this.sessionStartMs = Date.now();
        this.recentKeystrokeTimestamps = [];
        this.lastKnownLength = 0;
        this.typingAnalytics = {
            lastKeystrokeTime: null,
            interKeystrokeDelays: [],
            burstCount: 0,
            suspiciousPatterns: [],
            longPauses: [],
            rapidBursts: [],
            backspaceCount: 0,
            deleteCount: 0,
            focusChanges: [],
            wpmSamples: [],
            suspectedInjections: [],
            sessionTimeline: []
        };
        this.addTimelineEvent('session_started', 'New composition session');
    }

    // ======================
    // EDITOR EVENTS
    // ======================

    setupEditorEvents() {
        this.editor.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.editor.addEventListener('input', (e) => this.handleInput(e));
        // Safari does not reliably fire `input` on contenteditable elements, which left the
        // Post button stuck disabled even after typing. Listen to keyup/blur as a fallback so
        // the button state refreshes on every browser.
        this.editor.addEventListener('keyup', () => this.refreshSubmitState());
        this.editor.addEventListener('blur', () => this.refreshSubmitState());
        this.editor.addEventListener('paste', (e) => this.handlePaste(e));
        this.editor.addEventListener('copy', (e) => { e.preventDefault(); });
        this.editor.addEventListener('cut', (e) => { e.preventDefault(); });
        this.editor.addEventListener('drop', (e) => { e.preventDefault(); });
    }

    // Single source of truth for the Post button's enabled state: authenticated AND enough text.
    refreshSubmitState() {
        if (!this.userInfo) {
            this.submitPostBtn.disabled = true;
            return;
        }
        const text = (this.editor.textContent || '').trim();
        this.submitPostBtn.disabled = text.length < 10;
    }

    handleKeyDown(e) {
        const now = Date.now();
        this.recentKeystrokeTimestamps.push(now);
        const cutoff = now - 5000;
        this.recentKeystrokeTimestamps = this.recentKeystrokeTimestamps.filter(t => t > cutoff);

        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 'z') this.addTimelineEvent('undo', 'Undo');
            if (key === 'y' || (key === 'z' && e.shiftKey)) this.addTimelineEvent('redo', 'Redo');
            if (key === 'v') {
                e.preventDefault();
                this.pasteAttempts++;
                this.addTimelineEvent('paste_blocked', `Paste attempt #${this.pasteAttempts} blocked`);
                this.showPasteWarning();
                return false;
            }
            if (key === 'c' || key === 'x') {
                e.preventDefault();
                return false;
            }
        }
    }

    handleInput(e) {
        const now = Date.now();
        this.keystrokeCounter++;

        const inputType = e.inputType;
        if (inputType === 'deleteContentBackward') this.typingAnalytics.backspaceCount++;
        if (inputType === 'deleteContentForward') this.typingAnalytics.deleteCount++;

        // Inter-keystroke delay
        if (this.typingAnalytics.lastKeystrokeTime) {
            const delay = now - this.typingAnalytics.lastKeystrokeTime;
            if (delay > 0 && delay < 10000) {
                this.typingAnalytics.interKeystrokeDelays.push(delay);

                if (delay < 20) this.typingAnalytics.burstCount++;
                if (delay > 3000) {
                    this.typingAnalytics.longPauses.push({ timestamp: now, duration: delay });
                }

                // Rapid burst detection
                const recent = this.typingAnalytics.interKeystrokeDelays.slice(-10);
                if (recent.length === 10) {
                    const avgRecent = recent.reduce((a, b) => a + b, 0) / 10;
                    if (avgRecent < 100) {
                        this.typingAnalytics.rapidBursts.push({ timestamp: now, avgDelay: avgRecent });
                    }
                }
            }
        }
        this.typingAnalytics.lastKeystrokeTime = now;
        this.updateStats();
        this.refreshSubmitState();
    }

    handlePaste(e) {
        e.preventDefault();
        e.stopPropagation();
        this.pasteAttempts++;
        this.addTimelineEvent('paste_blocked', `Paste attempt #${this.pasteAttempts} blocked`);
        this.showPasteWarning();
    }

    showPasteWarning() {
        this.pasteWarning.classList.add('show');
        setTimeout(() => this.pasteWarning.classList.remove('show'), 2000);
    }

    updateStats() {
        const text = this.editor.textContent || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        this.wordCount.textContent = `${words} words`;
        this.charCount.textContent = `${text.length} characters`;
    }

    // ======================
    // DETECTION: Focus/Blur
    // ======================

    setupFocusTracking() {
        document.addEventListener('visibilitychange', () => {
            const now = Date.now();
            const textLen = this.editor.textContent.length;
            if (document.hidden) {
                this.lastKnownLengthAtBlur = textLen;
                this.typingAnalytics.focusChanges.push({ type: 'blur', timestamp: now, textLength: textLen });
                this.addTimelineEvent('window_blur', 'Window lost focus');
            } else {
                const growth = textLen - this.lastKnownLengthAtBlur;
                this.typingAnalytics.focusChanges.push({ type: 'focus', timestamp: now, textLength: textLen, textGrowthAfterReturn: growth });
                if (growth > 20) {
                    this.typingAnalytics.suspiciousPatterns.push({ type: 'text_growth_on_refocus', timestamp: now, growth });
                    this.addTimelineEvent('suspicious_refocus', `Window refocused — ${growth} chars appeared`, { growth });
                }
            }
        });

        window.addEventListener('blur', () => {
            this.lastKnownLengthAtBlur = this.editor.textContent.length;
            this.typingAnalytics.focusChanges.push({ type: 'blur', source: 'window', timestamp: Date.now(), textLength: this.editor.textContent.length });
        });

        window.addEventListener('focus', () => {
            const now = Date.now();
            const textLen = this.editor.textContent.length;
            const growth = textLen - this.lastKnownLengthAtBlur;
            this.typingAnalytics.focusChanges.push({ type: 'focus', source: 'window', timestamp: now, textLength: textLen, textGrowthAfterReturn: growth });
            if (growth > 20) {
                this.typingAnalytics.suspiciousPatterns.push({ type: 'text_growth_on_refocus', timestamp: now, growth });
                this.addTimelineEvent('suspicious_refocus', `App refocused — ${growth} chars appeared`, { growth });
            }
        });
    }

    // ======================
    // DETECTION: MutationObserver
    // ======================

    setupMutationObserver() {
        this.lastKnownLength = this.editor.textContent.length;

        const observer = new MutationObserver(() => {
            const now = Date.now();
            const currentLength = this.editor.textContent.length;
            const delta = currentLength - this.lastKnownLength;

            if (delta > 20) {
                const recentKs = this.recentKeystrokeTimestamps.filter(t => now - t < 2000).length;
                if (recentKs < delta * 0.4) {
                    this.typingAnalytics.suspectedInjections.push({ delta, timestamp: now, recentKeystrokes: recentKs });
                    this.addTimelineEvent('dom_injection', `${delta} chars injected (only ${recentKs} keys in last 2s)`, { delta });
                }
            }
            this.lastKnownLength = currentLength;
        });

        observer.observe(this.editor, { childList: true, subtree: true, characterData: true });
    }

    // ======================
    // DETECTION: WPM Sampling
    // ======================

    startWPMSampling() {
        setInterval(() => {
            const text = this.editor.textContent || '';
            const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
            const elapsedMin = (Date.now() - this.sessionStartMs) / 60000;
            if (elapsedMin < 0.1) return;

            const overallWpm = wordCount / elapsedMin;
            const samples = this.typingAnalytics.wpmSamples;
            let incrementalWpm = overallWpm;
            if (samples.length > 0) {
                const last = samples[samples.length - 1];
                const timeDelta = (Date.now() - last.timestamp) / 60000;
                const wordDelta = wordCount - last.wordCount;
                if (timeDelta > 0.05) incrementalWpm = wordDelta / timeDelta;
            }

            this.typingAnalytics.wpmSamples.push({ timestamp: Date.now(), wordCount, overallWpm: Math.round(overallWpm), incrementalWpm: Math.round(incrementalWpm) });

            if (samples.length >= 3 && wordCount > 30) {
                const prevWpms = samples.slice(-5).map(s => s.incrementalWpm).filter(w => w > 0);
                const avgPrev = prevWpms.reduce((a, b) => a + b, 0) / prevWpms.length;
                if (incrementalWpm > avgPrev * 3 && incrementalWpm > 80) {
                    this.typingAnalytics.suspiciousPatterns.push({ type: 'wpm_spike', timestamp: Date.now(), incrementalWpm, avgPreviousWpm: Math.round(avgPrev) });
                    this.addTimelineEvent('wpm_spike', `WPM spiked to ${Math.round(incrementalWpm)} (avg was ${Math.round(avgPrev)})`);
                }
            }
        }, 10000);
    }

    // ======================
    // TIMELINE
    // ======================

    addTimelineEvent(type, description, data = {}) {
        this.typingAnalytics.sessionTimeline.push({
            type, description,
            timestamp: Date.now(),
            elapsed: Math.round((Date.now() - this.sessionStartMs) / 1000),
            ...data
        });
    }

    // ======================
    // DRAFTS
    // ======================

    async saveDraft() {
        if (!this.userInfo) return;
        this.saveDraftBtn.textContent = 'Saving...';
        try {
            const scratchPad = document.getElementById('scratch-pad');
            await fetch('/api/save-draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: this.editor.textContent || '',
                    scratchPad: scratchPad ? scratchPad.innerHTML : ''
                })
            });
            this.saveDraftBtn.textContent = '✅ Saved!';
            setTimeout(() => { this.saveDraftBtn.textContent = 'Save Draft'; }, 1500);
        } catch (e) {
            this.saveDraftBtn.textContent = 'Save Draft';
        }
    }

    async loadDraft() {
        try {
            const response = await fetch('/api/load-draft');
            if (!response.ok) return;
            const data = await response.json();
            if (!data.found || !data.text) return;

            const savedTime = new Date(data.savedAt).toLocaleString();
            if (confirm(`Found a saved draft from ${savedTime}. Restore it?`)) {
                this.editor.textContent = data.text;
                const scratchPad = document.getElementById('scratch-pad');
                if (scratchPad && data.scratchPad) scratchPad.innerHTML = data.scratchPad;
                this.updateStats();
                this.refreshSubmitState();
            }
        } catch (e) {
            console.error('Load draft error:', e);
        }
    }

    // ======================
    // UI EVENTS
    // ======================

    setupUIEvents() {
        this.submitPostBtn.addEventListener('click', () => this.submitPost());
        this.saveDraftBtn.addEventListener('click', () => this.saveDraft());
        this.cancelReplyBtn.addEventListener('click', () => this.cancelReply());
        this.refreshBtn.addEventListener('click', () => this.loadPosts());

        // Event delegation for reply buttons — avoids inline onclick and works with dynamically rendered posts
        this.postsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.reply-btn[data-reply-id]');
            if (btn) {
                this.startReply(btn.dataset.replyId, btn.dataset.replyName);
            }
        });
    }

    startAutoRefresh() {
        setInterval(() => this.loadPosts(), 30000);
    }

    // ======================
    // HELPERS
    // ======================

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleString();
    }
}

const board = new DiscussionBoard();
