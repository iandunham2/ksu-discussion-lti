'use strict';

// Forensic limits for DOM-injection records. These keep payloads from
// ballooning while still preserving the actual inserted text for investigation.
const DOM_INJECTION_TEXT_MAX = 1000;
const DOM_INJECTION_NODE_TEXT_MAX = 200;
const DOM_INJECTION_MUTATION_RECORDS_MAX = 20;

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
        this.pasteField = document.getElementById('paste-field');

        this.userInfo = null;
        this.replyingTo = null; // parentId for reply mode
        this.examMode = false; // true when running in exam/isolated mode
        this.initialPostDue = null; // ISO timestamp for initial post deadline

        // Safari ITP workaround: capture token from URL and persist for this tab session
        const urlToken = new URLSearchParams(window.location.search).get('lti_token');
        if (urlToken) {
            sessionStorage.setItem('lti_token', urlToken);
            // Clean token from URL bar without triggering a reload
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);
        }
        this.ltiToken = sessionStorage.getItem('lti_token') || null;

        // Keep the LTI token alive while the user is actively composing
        this.lastUserActivity = Date.now();
        this.lastKeepAlive = 0;
        this.keepAliveIntervalMs = 5 * 60 * 1000; // ping at most every 5 minutes
        this.keepAliveInactivityMs = 2 * 60 * 1000; // only ping if active within 2 minutes

        // Typing analytics
        this.keystrokeCounter = 0;
        this.pasteAttempts = 0;
        this.sessionStartMs = Date.now();
        this.recentKeystrokeTimestamps = [];
        this.lastKnownLength = 0;
        this.lastKnownLengthAtBlur = 0;
        this.allowedSnapshot = this.editor ? this.editor.innerHTML : '';
        this.isComposing = false;

        // Forensic state for correlating DOM mutations with input events.
        this._textBeforeInput = '';
        this._lastInputType = null;
        this._lastInputTypeAt = 0;

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
        this.setupPasteImageConversion();
        this.startAutoRefresh();
        this.startKeepAlive();
    }

    // ======================
    // USER & CONTEXT
    // ======================

    apiHeaders() {
        const h = { 'Content-Type': 'application/json' };
        if (this.ltiToken) h['X-LTI-Token'] = this.ltiToken;
        return h;
    }

    async fetchUserInfo() {
        try {
            const response = await fetch('/api/user', { headers: this.ltiToken ? { 'X-LTI-Token': this.ltiToken } : {} });
            if (response.ok) {
                this.userInfo = await response.json();
                this.userInfoDisplay.textContent = `Logged in as: ${this.userInfo.name}`;
                this.contextInfo.textContent = this.userInfo.contextTitle || '';
                this.discussionTitle.textContent = this.userInfo.resourceLinkTitle || 'Discussion Board';
                this.examMode = this.userInfo.examMode || false;
                if (this.userInfo.instructions) {
                    const panel = document.getElementById('instructions-panel');
                    if (panel) { panel.innerHTML = this.sanitizeHtml(this.userInfo.instructions); panel.style.display = 'block'; }
                }
                this.initialPostDue = this.userInfo.initialPostDue || null;
                this.renderInitialPostDueBanner();
                this.refreshSubmitState();
                this.loadPosts();
                this.loadDraft();
                this.pingKeepAlive();
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
            const response = await fetch('/api/posts', { headers: this.ltiToken ? { 'X-LTI-Token': this.ltiToken } : {} });
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
            const emptyMsg = this.examMode
                ? 'Your exam response will appear here after you submit it. Other students\' responses are hidden until after the due date.'
                : 'No posts yet. Be the first to start the discussion!';
            this.postsContainer.innerHTML = `<p class="empty-msg">${emptyMsg}</p>`;
            return;
        }

        // Separate top-level posts and replies
        const topLevel = posts.filter(p => !p.parentId);
        const replies = posts.filter(p => p.parentId);

        const html = topLevel.map(post => {
            const postReplies = replies
                .filter(r => r.parentId === post.id)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            const replyButton = this.examMode ? '' : `
                <button class="reply-btn" data-reply-id="${post.id}" data-reply-name="${this.escapeHtml(post.authorName)}">Reply</button>
            `;
            const repliesBlock = this.examMode ? '' : (postReplies.length > 0 ? `
                <div class="replies">
                    ${postReplies.map(reply => `
                        <div class="reply-card">
                            <div class="post-header">
                                <strong class="post-author">${this.escapeHtml(reply.authorName)}</strong>
                                <span class="post-time">${this.formatTime(reply.timestamp)}</span>
                            </div>
                            <div class="post-body">${this.escapeHtml(reply.text)}</div>
                            ${reply.pasted ? `<div class="post-pasted"><div class="post-pasted-label">Pasted references</div>${this.sanitizeHtml(reply.pasted)}</div>` : ''}
                            <span class="post-word-count">${reply.wordCount} words</span>
                        </div>
                    `).join('')}
                </div>
            ` : '');

            return `
                <div class="post-card" data-post-id="${post.id}">
                    <div class="post-header">
                        <strong class="post-author">${this.escapeHtml(post.authorName)}</strong>
                        <span class="post-time">${this.formatTime(post.timestamp)}</span>
                    </div>
                    <div class="post-body">${this.escapeHtml(post.text)}</div>
                    ${post.pasted ? `<div class="post-pasted"><div class="post-pasted-label">Pasted references</div>${this.sanitizeHtml(post.pasted)}</div>` : ''}
                    <div class="post-footer">
                        <span class="post-word-count">${post.wordCount} words</span>
                        ${replyButton}
                    </div>
                    ${repliesBlock}
                </div>
            `;
        }).join('');

        this.postsContainer.innerHTML = html;
    }

    startReply(postId, authorName) {
        this.replyingTo = postId;
        this.renderInitialPostDueBanner();
        this.refreshSubmitState();

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
        this.renderInitialPostDueBanner();
        this.refreshSubmitState();
    }

    async submitPost() {
        const text = this.editor.textContent.trim();
        const pasted = this.pasteField ? this.pasteField.innerHTML.trim() : '';

        if (!this.userInfo) {
            alert('Please wait for authentication.');
            return;
        }
        if (this.examMode && this.replyingTo) {
            alert('Replies are not allowed on exams.');
            return;
        }
        if (!text || text.length < 10) {
            alert('Please write at least 10 characters.');
            return;
        }

        if (!this.userInfo.isInstructor && !this.replyingTo && this.initialPostDue) {
            if (new Date() > new Date(this.initialPostDue)) {
                const deadlineMsg = this.examMode
                    ? 'The exam submission deadline has passed. No further submissions are accepted.'
                    : 'The initial post deadline has passed. You may still reply to classmates until the full discussion deadline.';
                alert(deadlineMsg);
                return;
            }
        }

        this.submitPostBtn.disabled = true;
        this.submitPostBtn.textContent = 'Posting...';
        this.addTimelineEvent('submitted', `Post submitted (${text.split(/\s+/).length} words)`);

        try {
            const analytics = this.buildAnalyticsPayload();

            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: this.apiHeaders(),
                body: JSON.stringify({
                    text,
                    pasted,
                    parentId: this.replyingTo || null,
                    typingAnalytics: analytics,
                    sessionTimeline: this.typingAnalytics.sessionTimeline
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to post');
            }

            // Success — reset editor and paste field
            this.editor.textContent = '';
            if (this.pasteField) this.pasteField.innerHTML = '';
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
        this.lastKnownLengthAtBlur = 0;
        this.allowedSnapshot = this.editor ? this.editor.innerHTML : '';
        this.isComposing = false;
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

    renderInitialPostDueBanner() {
        if (!this.initialPostDue || this.userInfo?.isInstructor) return;
        const now = new Date();
        const due = new Date(this.initialPostDue);
        if (now <= due) return;
        // If past the initial post deadline and not currently replying, show a banner.
        if (this.replyingTo) return;
        let banner = document.getElementById('initial-post-due-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'initial-post-due-banner';
            banner.style.cssText = 'background:#fff3cd;color:#856404;border:1px solid #ffeeba;padding:12px 16px;border-radius:6px;margin-bottom:14px;font-weight:500;';
            const section = document.getElementById('compose-section');
            if (section) section.insertBefore(banner, section.firstChild);
        }
        banner.textContent = this.examMode
            ? 'The exam submission deadline has passed. No further submissions are accepted.'
            : 'The initial post deadline has passed. New top-level posts are no longer accepted, but you may still reply to classmates until the full discussion deadline.';
    }

    // ======================
    // EDITOR EVENTS
    // ======================

    setupEditorEvents() {
        this.editor.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.editor.addEventListener('beforeinput', (e) => this.handleBeforeInput(e));
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
        this.editor.addEventListener('compositionstart', () => { this.isComposing = true; });
        this.editor.addEventListener('compositionend', () => { this.isComposing = false; });
    }

    // Single source of truth for the Post button's enabled state:
    // authenticated, enough text, and (for top-level posts) before the initial post deadline.
    refreshSubmitState() {
        if (!this.userInfo) {
            this.submitPostBtn.disabled = true;
            return;
        }
        const text = (this.editor.textContent || '').trim();
        let blocked = text.length < 10;
        if (!this.userInfo.isInstructor && !this.replyingTo && this.initialPostDue) {
            if (new Date() > new Date(this.initialPostDue)) {
                blocked = true;
            }
        }
        // Exam mode never allows replies.
        if (this.examMode && this.replyingTo) {
            blocked = true;
        }
        this.submitPostBtn.disabled = blocked;
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

    handleBeforeInput(e) {
        // Remember the editor state before this insertion. If the insertion is
        // blocked, input or MutationObserver can roll back to this snapshot.
        this.allowedSnapshot = this.editor.innerHTML;
        this._textBeforeInput = this.editor.textContent || '';

        // Allow IME composition; compositionstart/compositionend set this flag.
        if (this.isComposing) return;

        const inputType = e.inputType || '';
        const data = e.data || '';

        // Keep the last input type so the MutationObserver can correlate
        // DOM changes with the event that likely caused them.
        this._lastInputType = inputType;
        this._lastInputTypeAt = Date.now();

        // Hard non-typing insertions (paste, drop, yank).
        const hardBlockedTypes = new Set([
            'insertFromPaste',
            'insertFromPasteAsQuotation',
            'insertFromDrop',
            'insertFromYank'
        ]);

        if (hardBlockedTypes.has(inputType)) {
            e.preventDefault();
            this.recordUserActivity();
            this.pasteAttempts++;
            const now = Date.now();
            this.typingAnalytics.suspectedInjections.push(this.buildSuspectedInjection({
                delta: data.length,
                timestamp: now,
                recentKeystrokes: 0,
                source: 'beforeinput',
                inputType,
                inputTypeAt: now,
                data
            }));
            this.addTimelineEvent('paste_blocked', `Blocked ${inputType} in main editor`, { inputType });
            this.showPasteWarning();
            return;
        }

        // Block other single insertions that are too large to have come from typing
        // (e.g., large autocorrect replacements or scripted insertText).
        if (data.length > 20) {
            const now = Date.now();
            const recentKs = this.recentKeystrokeTimestamps.filter(t => now - t < 2000).length;
            if (recentKs < data.length * 0.4) {
                e.preventDefault();
                this.typingAnalytics.suspectedInjections.push(this.buildSuspectedInjection({
                    delta: data.length,
                    timestamp: now,
                    recentKeystrokes: recentKs,
                    source: 'beforeinput',
                    inputType,
                    inputTypeAt: now,
                    data
                }));
                this.addTimelineEvent('dom_injection', `Blocked ${data.length}-char ${inputType} insertion`, { inputType, delta: data.length });
                this.showPasteWarning();
            }
        }
    }

    handleInput(e) {
        const now = Date.now();
        this.recordUserActivity();
        const inputType = e.inputType || '';
        const data = e.data || '';

        this._lastInputType = inputType;
        this._lastInputTypeAt = now;

        // Fallback for browsers where beforeinput didn't cancel the insertion.
        const hardBlockedTypes = new Set([
            'insertFromPaste',
            'insertFromPasteAsQuotation',
            'insertFromDrop',
            'insertFromYank'
        ]);

        if (!this.isComposing && hardBlockedTypes.has(inputType)) {
            const currentText = this.editor.textContent || '';
            const prevText = this._textBeforeInput || '';
            this.typingAnalytics.suspectedInjections.push(this.buildSuspectedInjection({
                delta: Math.max(0, currentText.length - prevText.length),
                timestamp: now,
                recentKeystrokes: 0,
                source: 'input',
                inputType,
                inputTypeAt: now,
                prevText
            }));
            this.revertEditor();
            this.pasteAttempts++;
            this.addTimelineEvent('paste_blocked', `Blocked ${inputType} via input handler`, { inputType });
            this.showPasteWarning();
            return;
        }

        // Also catch any other single insertion that is too large to be typing.
        if (!this.isComposing && data.length > 20) {
            const recentKs = this.recentKeystrokeTimestamps.filter(t => now - t < 2000).length;
            if (recentKs < data.length * 0.4) {
                this.typingAnalytics.suspectedInjections.push(this.buildSuspectedInjection({
                    delta: data.length,
                    timestamp: now,
                    recentKeystrokes: recentKs,
                    source: 'input',
                    inputType,
                    inputTypeAt: now,
                    data
                }));
                this.addTimelineEvent('dom_injection', `Blocked ${data.length}-char ${inputType} via input handler`, { inputType, delta: data.length });
                this.revertEditor();
                this.showPasteWarning();
                return;
            }
        }

        this.keystrokeCounter++;

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

        // After a legitimate change, update the snapshot used for rollbacks.
        this.allowedSnapshot = this.editor.innerHTML;
        this._textBeforeInput = this.editor.textContent || '';
    }

    handlePaste(e) {
        e.preventDefault();
        e.stopPropagation();
        this.recordUserActivity();
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

    revertEditor() {
        this.editor.innerHTML = this.allowedSnapshot;
        this.lastKnownLength = this.editor.textContent.length;
        this.lastKnownLengthAtBlur = this.editor.textContent.length;
        this.updateStats();
        this.refreshSubmitState();
    }

    // ======================
    // FORENSICS: DOM INJECTIONS
    // ======================

    truncateInjectionText(str, maxLen = DOM_INJECTION_TEXT_MAX) {
        if (!str) return '';
        str = String(str);
        if (str.length <= maxLen) return str;
        const half = Math.floor((maxLen - 1) / 2);
        return str.slice(0, half) + '…' + str.slice(-half);
    }

    extractNodeText(node) {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) return node.data || '';
        if (node.nodeType === Node.ELEMENT_NODE) {
            const direct = Array.from(node.childNodes)
                .map(c => this.extractNodeText(c))
                .join('');
            const full = node.textContent || '';
            return full.length > DOM_INJECTION_NODE_TEXT_MAX ? direct : full;
        }
        return '';
    }

    getMutationAddedText(record) {
        if (record.type === 'childList') {
            const text = Array.from(record.addedNodes)
                .map(n => this.extractNodeText(n))
                .filter(Boolean)
                .join(' ');
            return this.truncateInjectionText(text, DOM_INJECTION_NODE_TEXT_MAX);
        }
        if (record.type === 'characterData' && record.target) {
            const oldValue = record.oldValue || '';
            const newValue = record.target.data || '';
            if (newValue.startsWith(oldValue)) {
                return this.truncateInjectionText(newValue.slice(oldValue.length), DOM_INJECTION_NODE_TEXT_MAX);
            }
            if (newValue.endsWith(oldValue)) {
                return this.truncateInjectionText(newValue.slice(0, newValue.length - oldValue.length), DOM_INJECTION_NODE_TEXT_MAX);
            }
            return this.truncateInjectionText(newValue, DOM_INJECTION_NODE_TEXT_MAX);
        }
        return '';
    }

    serializeMutationRecord(record) {
        const summary = { type: record.type };
        if (record.target) {
            summary.target = record.target.nodeName;
        }
        if (record.type === 'childList') {
            summary.added = record.addedNodes.length;
            summary.removed = record.removedNodes.length;
            const addedText = this.getMutationAddedText(record);
            if (addedText) summary.addedText = addedText;
        }
        if (record.type === 'characterData' && record.target) {
            summary.oldValue = this.truncateInjectionText(record.oldValue || '', DOM_INJECTION_NODE_TEXT_MAX);
            summary.newValue = this.truncateInjectionText(record.target.data || '', DOM_INJECTION_NODE_TEXT_MAX);
        }
        return summary;
    }

    buildSuspectedInjection({ delta, timestamp, recentKeystrokes, source, inputType, inputTypeAt, data, mutations, prevText }) {
        const record = {
            delta,
            timestamp,
            recentKeystrokes,
            source: source || 'unknown',
            inputType: inputType || null,
            composing: this.isComposing,
            pasteAttemptsAtInject: this.pasteAttempts,
            totalKeystrokesAtInject: this.keystrokeCounter
        };

        if (inputType && inputTypeAt) {
            record.inputTypeAt = inputTypeAt;
            record.inputTypeCorrelationMs = timestamp - inputTypeAt;
        }

        // Determine the actual text that appeared.
        if (data) {
            record.insertedText = this.truncateInjectionText(data, DOM_INJECTION_TEXT_MAX);
        } else if (mutations && mutations.length) {
            const texts = [];
            for (const m of mutations) {
                const t = this.getMutationAddedText(m);
                if (t) texts.push(t);
            }
            const joined = texts.join('');
            if (joined) record.insertedText = this.truncateInjectionText(joined, DOM_INJECTION_TEXT_MAX);
        } else if (prevText !== undefined) {
            const currentText = this.editor.textContent || '';
            if (currentText.startsWith(prevText)) {
                record.insertedText = this.truncateInjectionText(currentText.slice(prevText.length), DOM_INJECTION_TEXT_MAX);
            } else if (currentText.endsWith(prevText)) {
                record.insertedText = this.truncateInjectionText(currentText.slice(0, currentText.length - prevText.length), DOM_INJECTION_TEXT_MAX);
            }
        }

        if (mutations && mutations.length) {
            record.mutationRecords = mutations
                .slice(0, DOM_INJECTION_MUTATION_RECORDS_MAX)
                .map(m => this.serializeMutationRecord(m));
        }

        return record;
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
        this.allowedSnapshot = this.editor.innerHTML;
        this.lastKnownLength = this.editor.textContent.length;

        const observer = new MutationObserver((mutations) => {
            const now = Date.now();
            const currentLength = this.editor.textContent.length;
            const delta = currentLength - this.lastKnownLength;

            if (delta > 20) {
                const recentKs = this.recentKeystrokeTimestamps.filter(t => now - t < 2000).length;
                if (recentKs < delta * 0.4) {
                    // If this mutation happened very soon after a beforeinput/input event,
                    // we can correlate it with that input type.
                    const correlatedInputType = (this._lastInputTypeAt && now - this._lastInputTypeAt < 100)
                        ? this._lastInputType
                        : null;
                    const inputTypeAt = correlatedInputType ? this._lastInputTypeAt : null;

                    this.typingAnalytics.suspectedInjections.push(this.buildSuspectedInjection({
                        delta,
                        timestamp: now,
                        recentKeystrokes: recentKs,
                        source: 'mutation-observer',
                        inputType: correlatedInputType,
                        inputTypeAt,
                        mutations,
                        prevText: this._textBeforeInput || ''
                    }));
                    this.addTimelineEvent('dom_injection', `${delta} chars injected (only ${recentKs} keys in last 2s)`, { delta, inputType: correlatedInputType });
                    this.revertEditor();
                    this.showPasteWarning();
                }
            }

            // Update the allowed snapshot for legitimate changes.
            const recentKs = this.recentKeystrokeTimestamps.filter(t => now - t < 2000).length;
            if (delta <= 20 || recentKs >= delta * 0.4) {
                this.allowedSnapshot = this.editor.innerHTML;
            }

            this.lastKnownLength = this.editor.textContent.length;
        });

        observer.observe(this.editor, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
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
                headers: this.apiHeaders(),
                body: JSON.stringify({
                    text: this.editor.textContent || '',
                    scratchPad: scratchPad ? scratchPad.innerHTML : '',
                    pasted: this.pasteField ? this.pasteField.innerHTML : ''
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
            const response = await fetch('/api/load-draft', { headers: this.ltiToken ? { 'X-LTI-Token': this.ltiToken } : {} });
            if (!response.ok) return;
            const data = await response.json();
            if (!data.found || !data.text) return;

            const savedTime = new Date(data.savedAt).toLocaleString();
            if (confirm(`Found a saved draft from ${savedTime}. Restore it?`)) {
                this.editor.textContent = data.text;
                const scratchPad = document.getElementById('scratch-pad');
                if (scratchPad && data.scratchPad) scratchPad.innerHTML = data.scratchPad;
                if (this.pasteField && data.pasted) this.pasteField.innerHTML = data.pasted;
                this.allowedSnapshot = this.editor.innerHTML;
                this.lastKnownLength = this.editor.textContent.length;
                this.lastKnownLengthAtBlur = this.editor.textContent.length;
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

    setupPasteImageConversion() {
        const targets = [this.pasteField, document.getElementById('scratch-pad')].filter(Boolean);
        targets.forEach(el => {
            el.addEventListener('paste', (e) => this.handleImagePaste(e, el));
        });
    }

    handleImagePaste(e, target) {
        const items = e.clipboardData && e.clipboardData.items ? Array.from(e.clipboardData.items) : [];

        // If the clipboard contains an image file, convert it to a data URL directly
        const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
        if (imageItem) {
            e.preventDefault();
            const file = imageItem.getAsFile();
            if (!file) return;
            this.pasteAttempts++;
            this.addTimelineEvent('pasted_image', `Pasted image (${imageItem.type})`);
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = document.createElement('img');
                img.src = ev.target.result;
                img.alt = 'Pasted image';
                this.insertImageAtCursor(img, target);
            };
            reader.readAsDataURL(file);
            return;
        }

        // Otherwise, let the browser paste the HTML, then scan for blob:/file: images
        // and convert them to data URLs so they can be persisted.
        setTimeout(() => this.convertLocalImagesInElement(target), 0);
    }

    insertImageAtCursor(img, target) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && (target.contains(sel.anchorNode) || target === sel.anchorNode)) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);
            range.collapse(false);
        } else {
            target.appendChild(img);
        }
    }

    convertLocalImagesInElement(el) {
        if (!el) return;
        el.querySelectorAll('img[src^="blob:"], img[src^="file:"]').forEach(img => {
            fetch(img.src)
                .then(res => res.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onload = (e) => { img.src = e.target.result; };
                    reader.readAsDataURL(blob);
                })
                .catch(err => {
                    console.error('Could not convert pasted image to data URL:', err);
                    img.remove();
                });
        });
    }

    startAutoRefresh() {
        setInterval(() => this.loadPosts(), 30000);
    }

    startKeepAlive() {
        // Send a lightweight auth ping while the user is actively typing.
        // This extends the server's sliding LTI token TTL for Safari/ITP users
        // whose session cookies are blocked inside the D2L iframe.
        setInterval(() => this.maybeKeepAlive(), 60 * 1000);
    }

    recordUserActivity() {
        this.lastUserActivity = Date.now();
    }

    maybeKeepAlive() {
        if (!this.ltiToken || !this.userInfo) return;
        const now = Date.now();
        if (now - this.lastKeepAlive < this.keepAliveIntervalMs) return;
        if (now - this.lastUserActivity > this.keepAliveInactivityMs) return;
        this.pingKeepAlive();
    }

    async pingKeepAlive() {
        try {
            const response = await fetch('/api/keep-alive', {
                method: 'POST',
                headers: this.apiHeaders()
            });
            if (response.ok) {
                this.lastKeepAlive = Date.now();
            }
        } catch (e) {
            // Keep-alive is best-effort; the user will see the real auth error
            // if they try to submit after the token truly expires.
            console.warn('Keep-alive failed:', e);
        }
    }

    // ======================
    // HELPERS
    // ======================

    // Sanitize HTML to a small allow-list of formatting tags, links, and images.
    // Removes script/style tags, event handlers, and dangerous URL schemes.
    sanitizeHtml(raw) {
        if (!raw) return '';
        const template = document.createElement('template');
        template.innerHTML = String(raw).trim();

        const allowedTags = new Set(['P', 'BR', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'OL', 'UL', 'LI', 'H1', 'H2', 'H3', 'H4', 'A', 'IMG', 'DIV', 'SPAN', 'BLOCKQUOTE', 'PRE', 'CODE']);
        const allowedAttrs = new Set(['alt', 'title', 'width', 'height', 'loading']);
        const result = document.createElement('div');

        const walk = (node, parent) => {
            if (node.nodeType === Node.TEXT_NODE) {
                parent.appendChild(document.createTextNode(node.nodeValue));
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = node.tagName.toUpperCase();
            if (!allowedTags.has(tag)) {
                for (const child of Array.from(node.childNodes)) {
                    walk(child, parent);
                }
                return;
            }

            const el = document.createElement(tag);

            if (tag === 'A') {
                for (const attr of Array.from(node.attributes)) {
                    const name = attr.name.toLowerCase();
                    if (name !== 'href' && name !== 'target') continue;
                    if (name === 'href') {
                        const val = attr.value.trim().toLowerCase();
                        if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) continue;
                    }
                    el.setAttribute(attr.name, attr.value);
                }
                if (el.hasAttribute('href')) {
                    el.setAttribute('target', '_blank');
                    el.setAttribute('rel', 'noopener noreferrer');
                }
            } else if (tag === 'IMG') {
                let hasValidSrc = false;
                for (const attr of Array.from(node.attributes)) {
                    const name = attr.name.toLowerCase();
                    if (name === 'src') {
                        const val = attr.value.trim().toLowerCase();
                        if (val.startsWith('javascript:') || val.startsWith('vbscript:')) continue;
                        el.setAttribute('src', attr.value);
                        hasValidSrc = true;
                    } else if (allowedAttrs.has(name)) {
                        el.setAttribute(attr.name, attr.value);
                    }
                }
                if (!hasValidSrc) {
                    // Drop images with no valid src
                    return;
                }
            } else {
                // For all other allowed tags, keep only safe global attributes.
                for (const attr of Array.from(node.attributes)) {
                    const name = attr.name.toLowerCase();
                    if (allowedAttrs.has(name)) {
                        el.setAttribute(attr.name, attr.value);
                    }
                }
            }

            for (const child of Array.from(node.childNodes)) {
                walk(child, el);
            }
            parent.appendChild(el);
        };

        for (const child of Array.from(template.content.childNodes)) {
            walk(child, result);
        }
        return result.innerHTML;
    }

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
