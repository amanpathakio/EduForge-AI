# Implementation Plan: Phase 2.1 — AI Lecture Studio Foundation

Establish the data persistence and foundation layer for the AI Lecture Studio without implementing AI outline/script generation yet. Enables professors to list uploaded course materials, configure lecture parameters, save/edit drafts in SQLite, and navigate seamlessly between Student Tutor and AI Lecture Studio.

## Proposed Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          EDUFORGE AI (REACT)                           │
│                                                                        │
│  Navigation Tabs: [ 🎓 Student Tutor ]  |  [ 🎙️ AI Lecture Studio ]    │
│                                                                        │
│  ┌───────────────────────────────┐   ┌───────────────────────────────┐ │
│  │     Lecture Configuration     │   │     Saved Lecture Library     │ │
│  │ • Lecture Topic (text)        │   │ • List saved drafts           │ │
│  │ • Material multi-select (PDFs)│   │ • Status & duration badges    │ │
│  │ • Target Audience dropdown    │   │ • "Load / Edit" into form     │ │
│  │ • Duration dropdown           │   │ • Persists across reloads     │ │
│  │ • Teaching Style dropdown     │   └───────────────┬───────────────┘ │
│  │ • Additional Instructions     │                   │                 │
│  │ • [ Save Draft ] button       │                   │                 │
│  └───────────────┬───────────────┘                   │                 │
└──────────────────┼───────────────────────────────────┼─────────────────┘
                   │                                   │
                   ▼                                   ▼
         frontend/src/services/api.js (Single Canonical API Service)
         • getCourseMaterials()       • getLectures()
         • createLecture()            • getLecture(id)
         • updateLecture()
                   │
                   ▼ (Vite proxy / direct FastAPI)
┌────────────────────────────────────────────────────────────────────────┐
│                        FASTAPI STUDIO SERVICE                          │
│                                                                        │
│  • GET  /api/studio/materials  ── Query ChromaDB chunks for unique PDFs│
│  • POST /api/studio/lectures   ── Create new lecture draft             │
│  • GET  /api/studio/lectures   ── List all saved lecture drafts        │
│  • GET  /api/studio/lectures/{id}  ── Fetch specific draft with sections│
│  • PUT  /api/studio/lectures/{id}  ── Update draft configuration       │
└──────────────────┬─────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    SQLITE + SQLALCHEMY PERSISTENCE                     │
│                                                                        │
│  File: backend/data/eduforge.db                                        │
│  Models:                                                               │
│  • Lecture (id, topic, audience, duration, style, instructions,        │
│             selected_materials, status, created_at, updated_at)        │
│  • LectureSection (id, lecture_id, order, title, concepts, minutes,    │
│                    content, sources, created_at)                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## User Review Required

> [!NOTE]
> **Persistence File**: SQLite database will be stored at `backend/data/eduforge.db`. Parent directories exist and directory validation is already built into FastAPI startup.

> [!IMPORTANT]
> **Scope Guardrail**: Phase 2.1 strictly implements foundation, persistence, and draft CRUD. Outline generation, script generation, audio, and video are strictly excluded until future milestones.

---

## Proposed Changes

### Backend: Database & Models Layer

#### [NEW] [backend/app/db/session.py](file:///d:/EduForge%20AI/backend/app/db/session.py)
* SQLAlchemy `engine` and `SessionLocal` factory pointing to `sqlite:///data/eduforge.db`.
* Dependency `get_db()` providing a database session for route handlers.
* `init_db()` helper to create all tables on application startup.

#### [NEW] [backend/app/db/models.py](file:///d:/EduForge%20AI/backend/app/db/models.py)
* `Base = declarative_base()`
* `Lecture`:
  * `id`: UUID string PK
  * `topic`: String (non-nullable)
  * `target_audience`: String (e.g. "Undergraduate", "Beginner", "Graduate", "Professional")
  * `duration_minutes`: Integer (e.g. 15, 30, 45, 60)
  * `teaching_style`: String (e.g. "Conversational & Intuitive", "Formal & Academic")
  * `additional_instructions`: Text (nullable)
  * `selected_materials`: JSON-encoded string list of source filenames
  * `status`: String (default: "draft")
  * `created_at`: DateTime
  * `updated_at`: DateTime
  * `sections`: 1-to-many relationship with `LectureSection`
* `LectureSection`:
  * `id`: UUID string PK
  * `lecture_id`: UUID string FK -> `lectures.id`
  * `order`: Integer
  * `title`: String
  * `key_concepts`: JSON-encoded string list
  * `estimated_minutes`: Integer
  * `content`: Text (nullable)
  * `sources`: JSON-encoded string list

---

### Backend: API Layer

#### [NEW] [backend/app/api/studio_routes.py](file:///d:/EduForge%20AI/backend/app/api/studio_routes.py)
* Pydantic schemas:
  * `MaterialResponse`: filename, doc_id, total_pages, total_chunks, file_size_bytes
  * `LectureCreateRequest`: topic, selected_materials, target_audience, duration_minutes, teaching_style, additional_instructions, sections
  * `LectureUpdateRequest`: optional fields for updating draft
  * `LectureSummaryResponse`: summary for draft library listing
  * `LectureDetailResponse`: full draft details including sections
* Endpoints:
  * `GET /api/studio/materials`: Queries ChromaDB collection metadata and upload directory to aggregate distinct course PDFs.
  * `POST /api/studio/lectures`: Validates and saves a new lecture draft.
  * `GET /api/studio/lectures`: Returns list of saved lectures sorted by `updated_at` descending.
  * `GET /api/studio/lectures/{id}`: Returns single lecture details or 404.
  * `PUT /api/studio/lectures/{id}`: Updates existing lecture draft fields.

#### [MODIFY] [backend/app/main.py](file:///d:/EduForge%20AI/backend/app/main.py)
* Include `studio_router` under prefix `/api/studio`.
* Call `init_db()` in `startup_event` to ensure tables exist.

#### [MODIFY] [backend/requirements.txt](file:///d:/EduForge%20AI/backend/requirements.txt)
* Ensure `sqlalchemy>=2.0.0` is explicitly listed.

---

### Frontend: Services & Configuration

#### [MODIFY] [frontend/vite.config.js](file:///d:/EduForge%20AI/frontend/vite.config.js)
* Add `'/api': 'http://127.0.0.1:8000'` to dev server proxy config.

#### [MODIFY] [frontend/src/services/api.js](file:///d:/EduForge%20AI/frontend/src/services/api.js)
* Extend single canonical API service with:
  * `getCourseMaterials()`
  * `getLectures()`
  * `getLecture(id)`
  * `createLecture(lectureData)`
  * `updateLecture(id, lectureData)`

---

### Frontend: UI Components & Navigation

#### [MODIFY] [frontend/src/components/Header.jsx](file:///d:/EduForge%20AI/frontend/src/components/Header.jsx)
* Add tab switcher between `[🎓 Student Tutor]` and `[🎙️ AI Lecture Studio]`.
* Highlights active tab with glassmorphism accent styling.

#### [NEW] [frontend/src/pages/LectureStudio.jsx](file:///d:/EduForge%20AI/frontend/src/pages/LectureStudio.jsx)
* **Configuration Form**:
  * Topic input with clear placeholder.
  * Course Material multi-select pills (shows page/chunk count for each uploaded PDF).
  * Target Audience dropdown (`Undergraduate`, `Beginner / High School`, `Graduate / Advanced`, `Industry Professional`).
  * Duration dropdown (`15 min`, `30 min`, `45 min`, `60 min`, `90 min`).
  * Teaching Style selector (`Conversational & Intuitive`, `Formal & Academic`, `Case Study & Problem-Solving`, `Socratic / Inquiry-Based`).
  * Additional instructions textarea.
  * "Save Draft" button with status indicator and "New Lecture" reset button.
* **Draft Library Sidebar / Card**:
  * Fetches and lists all saved drafts from `/api/studio/lectures`.
  * Shows topic, duration, audience, material count, and last saved time.
  * "Load" button to populate the form and resume editing.
  * Preserved across browser refresh via database retrieval.

#### [MODIFY] [frontend/src/App.jsx](file:///d:/EduForge%20AI/frontend/src/App.jsx)
* Manage `activeTab` state (`'student'` vs `'studio'`).
* Conditionally render `StudentTutor` or `LectureStudio`.

---

## Verification Plan

### Automated Tests
1. **Existing Backend Tests**:
   - `python -m pytest tests/ -v` (13 tests must continue to pass).
2. **New Studio Tests (`tests/test_studio.py`)**:
   - Test materials listing: `GET /api/studio/materials`.
   - Test create lecture draft: `POST /api/studio/lectures`.
   - Test list lecture drafts: `GET /api/studio/lectures`.
   - Test get lecture draft by ID: `GET /api/studio/lectures/{id}`.
   - Test update lecture draft: `PUT /api/studio/lectures/{id}`.
   - Test 404 for nonexistent draft.
3. **Frontend Production Build**:
   - Run `npm run build` in `frontend/` (verify 0 errors).

### End-to-End Manual & Browser Verification
1. Launch FastAPI backend and Vite dev server.
2. In browser:
   - Verify Student Tutor tab functions (health indicator, chat, upload).
   - Switch to "AI Lecture Studio" tab.
   - Verify uploaded PDFs (e.g. `sample_course.pdf`) appear in the materials selector.
   - Fill in:
     - Topic: *"Operating System Concurrency"*
     - Material: Select `sample_course.pdf`
     - Audience: *"Undergraduate"*
     - Duration: *"45 min"*
     - Teaching Style: *"Conversational & Intuitive"*
     - Instructions: *"Focus on mutual exclusion and semaphores"*
   - Click "Save Draft". Verify success notification.
   - Verify draft appears in the Draft Library area with timestamp.
   - Refresh browser page. Verify draft persists in library.
   - Click "Load" on the draft. Edit topic to *"Operating System Concurrency & Locks"*.
   - Click "Save Draft". Verify update is persisted.
   - Check browser console for 0 errors.
