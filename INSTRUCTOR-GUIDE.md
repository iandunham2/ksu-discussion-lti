# AI-Monitored Discussion Tool — Instructor Setup Guide

## Overview

This tool adds AI-monitored discussion boards to your D2L Brightspace course. Each module gets its own isolated discussion instance. Student posts are analyzed for AI-generated content and monitored with typing analytics.

---

## Prerequisites

The tool has already been configured as an External Learning Tool in your course:

- **Tool Name**: AI-Monitored Discussion
- **Launch URL**: `https://ksu-discussion-lti.onrender.com/lti/launch`
- **Consumer Key**: `ksu-discussion-tool`
- **Consumer Secret**: `ksu-d2l-secret-2026`

---

## Adding a Discussion to a Module

Each time you add the tool to a module, it creates a **separate, isolated discussion instance**. Posts in Module 1 are completely separate from Module 2, etc.

> ### ⚠️ IMPORTANT: Use ONE link per discussion assignment
>
> The tool separates discussions by the **individual link** you place in D2L (each link has its own hidden ID). It does **not** know about D2L's "Discussion 1 / Discussion 2" topic names.
>
> **Do this:** Add a **new, separate** "AI-Monitored Discussion" link for **every** discussion assignment (Introduction, Podcast Topic, etc.).
>
> **Do NOT do this:** Reuse the **same** link for multiple assignments across the semester. If you do, every assignment's posts pile into one board and the dashboard cannot tell them apart — they will all show as a single module, and each student's posts from different assignments get grouped together.
>
> If you have already reused one link, the dashboard will still group each student's posts **by thread** so you can tell the assignments apart, but a separate link per assignment is the clean setup.

### Step-by-Step

1. In your course, click **Content** in the navbar
2. Navigate to the module where you want a discussion (e.g., "Module 1: Introduction & RAW Photography Fundamentals")
3. Click **Existing Activities** (gray button)
4. Select **External Learning Tools** from the dropdown
5. Choose **AI-Monitored Discussion**
6. The discussion link now appears in that module

### Repeat for Each Module

- Go to **Module 2** → Existing Activities → External Learning Tools → AI-Monitored Discussion
- Go to **Module 3** → Existing Activities → External Learning Tools → AI-Monitored Discussion
- Continue for all modules that need a discussion

Each placement is automatically isolated — students only see posts for the module they launched from.

---

## Renaming the Discussion Link (Recommended)

By default, every placement shows as "AI-Monitored Discussion." To give each one a unique name:

1. Click the **dropdown arrow (v)** next to the discussion link in the module
2. Select **Edit Properties In-place** (or **Edit**)
3. Change the title to something specific, e.g.:
   - "Module 1 Discussion: Intro to RAW Photography"
   - "Module 2 Discussion: Lighting Techniques"
   - "Module 3 Discussion: Post-Processing Workflows"
4. Click **Save**

The custom title will be displayed in the tool's header for both students and instructors.

---

## Adding Discussion Instructions per Module

You can add instructions directly above the discussion link in each module:

### Option A: Add a Text Description Above the Link

1. In the module, click **Upload / Create** → **Create a File** (or **New** → **HTML Document**)
2. Title it "Discussion Instructions" or "Discussion Prompt"
3. Write your discussion prompt, e.g.:

   > **Module 1 Discussion Prompt**
   >
   > After reading Chapter 1, discuss the following:
   > - What are the key advantages of shooting in RAW format vs. JPEG?
   > - Share an example from your own experience where RAW would have been beneficial.
   >
   > **Requirements:**
   > - Initial post: minimum 150 words
   > - Reply to at least 2 classmates
   > - Due: Friday at 11:59 PM

4. Click **Save**
5. Make sure the instructions appear **above** the AI-Monitored Discussion link in the module

### Option B: Add a Description to the Link Itself

1. Click the **dropdown arrow (v)** next to the discussion link
2. Select **Edit Properties In-place**
3. Add a description in the description field — this shows when students click the link before launching
4. Click **Save**

---

## What Students See

When a student clicks the discussion link in a module:

1. They are authenticated automatically via D2L (name, email, student ID)
2. They see the **Discussion Board** with:
   - A post composer (monitored for typing patterns)
   - A scratch pad for notes (not monitored)
   - All posts and replies for that specific module discussion
3. They can write new posts and reply to classmates
4. Their typing behavior is tracked: keystroke timing, backspace ratio, focus/blur events, WPM patterns

**Students cannot:**
- See AI detection scores
- See other students' typing analytics
- Paste text into the editor (paste is blocked)
- Access discussions from other modules

---

## What Instructors See

When you (the instructor) click the discussion link in a module:

1. You see the **Instructor Dashboard** for **all discussions in that course** (you only see your own course's data)
2. Use the filters at the top:
   - **Module dropdown** — pick a specific discussion link (each separate link = one module)
   - **Thread dropdown** — narrow to a single discussion thread
   - **✏️ Rename button** — appears when a module is selected; click it to give that discussion a clear name (e.g. "Discussion 2: Choose Your Podcast Topic"). The name is saved and persists.
3. Students are grouped into cards. Within each student's card, their posts are **separated by thread**, so contributions to different discussion assignments appear as distinct sections (🧵).
4. The dashboard shows:
   - **Total submissions** with risk breakdown (High / Medium / Low)
   - **Each post** with:
     - Student name and email
     - AI probability score (from Sapling AI Detector)
     - Composite risk score (0-100) combining AI detection + typing analytics
     - Typing analytics: correction ratio, suspicious refocuses, WPM spikes, injection attempts
     - Full post text
     - Post type (original post vs. reply)
5. Dashboard auto-refreshes every 15 seconds

### Risk Score Breakdown

| Risk Level | Score | Meaning |
|------------|-------|---------|
| **Low** | 0-29 | Normal typing behavior, low AI probability |
| **Medium** | 30-59 | Some suspicious signals, review recommended |
| **High** | 60-100 | Strong AI indicators and/or suspicious typing patterns |

### Composite Score Components

| Signal | Max Points | What It Measures |
|--------|-----------|------------------|
| AI Detection (Sapling) | 35 | Probability text is AI-generated |
| Typing Suspicion | 25 | Overall suspicion from typing patterns |
| Suspicious Refocuses | 15 | Left the page and text grew significantly on return |
| DOM Injections | 10 | Text appeared without keystrokes (copy from dev tools, etc.) |
| Low Correction Ratio | 8 | Very few backspaces/deletes (AI-pasted text has none) |
| WPM Spikes | 5 | Sudden bursts of impossible typing speed |
| Paste Attempts | 2 | Tried to paste (blocked, but attempt is logged) |

---

## Example Module Setup

Here is an example of a fully configured module:

```
Module 1: Introduction & RAW Photography Fundamentals
├── Module 1 Overview (HTML page with learning objectives)
├── Chapter 1 Reading (file or link)
├── Lecture Video: RAW vs JPEG (video embed)
├── Discussion Prompt: RAW Photography Benefits (HTML page with instructions)
└── AI-Monitored Discussion (External Learning Tool)
```

---

## Troubleshooting

### "502 Bad Gateway" on first click
The free hosting tier sleeps after 15 minutes of inactivity. Wait 30-50 seconds and refresh. Once awake, it stays up as long as students are using it.

### Students see "LTI launch validation failed"
Make sure the Consumer Key and Secret in D2L match exactly:
- Key: `ksu-discussion-tool`
- Secret: `ksu-d2l-secret-2026`

### Instructor sees student view (or vice versa)
Check that the Security Settings for the tool link include:
- ✅ Send LTI user ID and LTI role list to tool provider
- ✅ Send user name to tool provider
- ✅ Send user email to tool provider
- ✅ Send course information to tool provider

### Posts from one module showing in another
This should not happen. Each module placement gets a unique `resource_link_id` from D2L. If it does happen, contact the tool administrator.

---

## Quick Reference

| Action | How |
|--------|-----|
| Add discussion to a module | Content → Module → Existing Activities → External Learning Tools → AI-Monitored Discussion |
| Use a new link per assignment | Repeat the step above for each discussion (don't reuse one link) |
| Rename a module in the dashboard | Select a Module → click ✏️ Rename → type a name |
| Rename the discussion in D2L | Click dropdown arrow → Edit Properties In-place → change title |
| View student posts + AI scores | Click the discussion link as an instructor |
| Test as a student | Use `https://ksu-discussion-lti.onrender.com/test-launch.html` |
