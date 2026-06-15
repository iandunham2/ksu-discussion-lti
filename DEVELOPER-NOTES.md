# Developer Notes

Technical reference for whoever maintains the AI-Monitored Discussion LTI tool.
For instructor-facing usage, see `INSTRUCTOR-GUIDE.md`.

---

## Stack & Deployment

- **Runtime**: Node.js + Express (`server.js`)
- **Frontend**: static HTML/JS served by Express (`discussion.html` / `discussion.js` for students, `instructor.html` for instructors)
- **Database**: MongoDB (Atlas), database name `ksu-discussion`
- **Sessions**: `express-session` + `connect-mongo` (sessions stored in the `sessions` collection)
- **Hosting**: Render (`render.yaml`), service name `ksu-discussion-lti`, free plan
  - Health check endpoint: `GET /health`
  - Free tier sleeps after ~15 min idle (cold start ~30-50s)
- **AI detection**: Sapling API (`SAPLING_API_KEY`)
- **Auth**: LTI 1.1 launch (`POST /lti/launch`), OAuth 1.0 signature validation

### Environment variables (`.env`)
`NODE_ENV`, `PORT`, `LTI_CONSUMER_KEY`, `LTI_CONSUMER_SECRET`, `SAPLING_API_KEY`, `MONGODB_URI`, `SESSION_SECRET`

---

## Key LTI launch fields (what D2L actually sends)

Captured from real D2L (Kennesaw / Brightspace) launches:

| Field | Example | Notes |
|-------|---------|-------|
| `context_id` | `3991591` | **Per course offering** (NOT per discussion). Differs between courses. |
| `context_title` | `Entertainment Podcasting Section W02 Summer Semester 2026 CO` | Human-readable course name. Used for grouping (see below). |
| `context_label` | `CO.430.MENT3300.50965.20271` | Short course code. |
| `resource_link_id` | `usgq-41152027_3991591` | **Unique per placed link.** This is the unit of a "discussion / module". |
| `resource_link_title` | `AI-Monitored Discussion` | **Same value for every link** — D2L sends the LTI link's name, not the D2L topic title. |
| `resource_link_description` | `""` | Empty in practice. |
| `ext_d2l_link_id` | `5694315` | D2L internal numeric link id (unique per link). |

### Critical implication
D2L does **not** send the discussion-topic title (e.g. "Discussion 2: Choose Your Podcast Topic").
That title is the D2L *content topic* name, which is not part of the LTI launch.
Therefore meaningful per-discussion names cannot be auto-derived — they are set manually
by the instructor (see `discussionLabels` below).

---

## Data model (MongoDB collections)

- **`posts`** — discussion posts/replies. Relevant fields:
  - `id`, `parentId` (null = top-level thread root)
  - `authorId`, `authorEmail`, `authorName`
  - `contextId`, `contextTitle` — course identifiers stored at post creation
  - `resourceLinkId`, `resourceLinkTitle`
  - AI/typing analytics: `aiResults`, `typingAnalytics`, `compositeScore`, `compositeRisk`, etc.
  - grading: `grade`, `gradeFeedback`, `gradedAt`, `gradedBy`
- **`drafts`** — in-progress student drafts
- **`outcomes`** — LTI grade passback records (`userId` + `resourceLinkId`)
- **`discussionLabels`** — instructor-defined display names per discussion
  - `{ resourceLinkId (unique), contextTitle, label, updatedAt }`
- **`sessions`** — express-session store (connect-mongo)

---

## Instructor dashboard architecture

### Grouping is by COURSE, not by link
`GET /api/instructor/posts` filters posts by `contextTitle` (the course), so an instructor
sees **all discussions within their own course**, while different courses stay separate.

- Why `contextTitle` and not `context_id`? D2L can issue different `context_id`s, and grouping
  by the stable, human-readable course title gives the desired "one instructor view per course"
  behavior. Cross-course isolation is preserved because each course has a distinct title.
- The endpoint attaches `moduleLabel` to each post = `discussionLabels[resourceLinkId]`
  || `resourceLinkTitle` || `'Untitled Discussion'`.

### Modules
A "module" in the UI = one `resourceLinkId` (one placed D2L link).
- **Module dropdown** is built from the distinct `resourceLinkId`s in the returned posts.
- **✏️ Rename** → `POST /api/instructor/discussion-label { resourceLinkId, label }`
  - `requireInstructor`; verifies the `resourceLinkId` belongs to the instructor's
    `contextTitle` before upserting into `discussionLabels`.

### Per-thread grouping within a student card (`instructor.html`)
Because one link may (incorrectly) contain multiple assignments, each student's posts are
grouped by their **root thread**: walk `parentId` up to the top-level post; group by that
root id; render a `🧵` header per thread. This lets instructors distinguish assignments even
when they were all posted through a single link.

---

## Recommended setup (and a known data caveat)

- **Correct usage**: add a **separate** "AI-Monitored Discussion" link per discussion assignment.
  Each gets a unique `resource_link_id`, so modules/threads/grading separate cleanly.
- **Known caveat in existing data**: the Entertainment Podcasting course reused a single link
  (`usgq-41152027_3991591`) for multiple assignments, so its historical posts cannot be split
  into modules automatically — only by-thread grouping helps there.

---

## Change log

### 2026-06-15
- Instructor dashboard now groups by course (`contextTitle`) instead of `context_id`.
- Posts store `contextTitle` at creation; existing posts migrated to correct course titles.
  - `3991591` → Entertainment Podcasting Section W02
  - `3991603` → Digital Media Production Section W01 (was briefly mislabeled, then corrected)
- Added `discussionLabels` collection + `POST /api/instructor/discussion-label` and an inline
  ✏️ Rename control for instructor-defined module names.
- Reset fabricated `resourceLinkTitle` values back to D2L's real `"AI-Monitored Discussion"`;
  meaningful names now live in `discussionLabels`.
- Student cards group posts by thread (root-thread walk).
- Added `GET /health` for Render health checks.
- Removed temporary launch-payload capture (`launch_debug` collection) used during investigation.
