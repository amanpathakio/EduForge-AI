# EduForge AI: Educational Workspace & AI Lecture Studio Walkthrough

EduForge AI has been expanded from a single-document RAG tutor into an educational workspace featuring:
1. **Relational Database Persistence (SQLAlchemy 2.x + Alembic)** with PostgreSQL support and SQLite test fallback.
2. **Course Workspaces**: Courses with isolated document ingestion, metadata tagging in ChromaDB (`course_id`, `document_id`, `filename`, `page_number`), and cross-course leak prevention.
3. **Course-Aware Grounded Chat**: Zero-hallucination RAG querying strictly isolated to course materials with page citations.
4. **AI Lecture Studio MVP**: Slide-by-slide lecture generation grounded strictly in uploaded course PDFs with verifiable citations.
5. **Interactive Lecture Editor**: Slide outline sidebar, bullet points editor, presenter speaker notes, slide deletion, manual save, and **targeted AI slide regeneration** with grounded citations.
6. **Reusable Citation Inspector**: Deep-dive slide drawer audit showing exact chunk text, cosine distance scores, and page-level metadata across both Chat and Lecture Studio.

---

## 1. Automated Test Suite Results

* **Command**: `.\backend\venv\Scripts\python -m pytest -v`
* **Total Tests**: **21 Passed / 0 Failed (100% Pass Rate)**
* **Execution Time**: ~30 seconds

| Test Module | Tests | Status |
| :--- | :--- | :--- |
| `tests/test_api.py` | `test_health_endpoint`, `test_root_spa_serving`, `test_upload_invalid_file_type`, `test_upload_valid_pdf_and_query` | **PASSED** (4/4) |
| `tests/test_chunker.py` | `test_create_chunks_splitting_and_metadata`, `test_create_chunks_empty_input` | **PASSED** (2/2) |
| `tests/test_embeddings.py` | `test_embedding_generation_dimension_and_type`, `test_embed_query`, `test_embed_empty_query_raises_error` | **PASSED** (3/3) |
| `tests/test_end_to_end.py` | `test_full_rag_pipeline_end_to_end` | **PASSED** (1/1) |
| `tests/test_pdf_extraction.py` | `test_extract_text_from_valid_pdf`, `test_extract_text_empty_file`, `test_extract_text_invalid_pdf_format` | **PASSED** (3/3) |
| `tests/test_vector_store.py` | `test_vector_store_add_and_similarity_search` | **PASSED** (1/1) |
| `tests/test_courses_and_lectures.py` | `test_course_crud`, `test_documents_associated_with_course_and_isolation`, `test_lecture_generation_insufficient_context`, `test_lecture_generation_and_citations`, `test_lecture_generation_malformed_json_handling`, `test_slide_regeneration` | **PASSED** (6/6) |
| `tests/test_flow_verification.py` | `test_full_course_and_lecture_studio_user_flow` | **PASSED** (1/1) |

---

## 2. Production Frontend Build & Lint

* **Command**: `npm run lint` & `npm run build` in `frontend/`
* **Linter (oxlint)**: 0 errors, 0 warnings
* **Vite Build**: Successful (Exit code: 0)
  * `dist/index.html`: `0.81 kB` (gzip: `0.45 kB`)
  * `dist/assets/index-B-ur7D5O.css`: `33.94 kB` (gzip: `6.35 kB`)
  * `dist/assets/index-DaF5S2az.js`: `369.42 kB` (gzip: `110.48 kB`)

---

## 3. Database Schema & Migration Details

Alembic migration `backend/alembic/versions/e3f9945c1953_create_initial_schema.py` establishes 5 core tables:
1. `courses`: `id` (UUID PK), `title`, `description`, `created_at`, `updated_at`.
2. `documents`: `id` (UUID PK), `course_id` (FK -> courses.id ON DELETE CASCADE), `filename`, `file_path`, `pages_count`, `chunks_count`, `created_at`.
3. `lectures`: `id` (UUID PK), `course_id` (FK -> courses.id ON DELETE CASCADE), `title`, `topic`, `duration_minutes`, `difficulty`, `learning_objectives` (JSON), `status`, `additional_instructions`, `created_at`, `updated_at`.
4. `lecture_slides`: `id` (UUID PK), `lecture_id` (FK -> lectures.id ON DELETE CASCADE), `slide_number`, `title`, `content` (JSON array of strings), `speaker_notes`, `created_at`, `updated_at`.
5. `citations`: `id` (UUID PK), `entity_type` (e.g. "lecture_slide"), `entity_id` (slide_id), `document_id`, `chunk_id`, `page_number`, `filename`, `distance`, `chunk_text`, `created_at`.

---

## 4. API Endpoints

### Course Management
- `POST /courses`: Create course (`{ title, description }`)
- `GET /courses`: List courses with counts
- `GET /courses/{course_id}`: Course details
- `PATCH /courses/{course_id}`: Update title/description
- `DELETE /courses/{course_id}`: Purge course, documents, lectures, and ChromaDB vectors
- `GET /courses/{course_id}/documents`: List course PDFs
- `POST /courses/{course_id}/documents/upload`: Upload PDF to course with metadata
- `POST /courses/{course_id}/chat`: Grounded tutor chat filtered strictly to `course_id`

### AI Lecture Studio
- `POST /courses/{course_id}/lectures/generate`: Generate lecture from course PDFs
- `GET /courses/{course_id}/lectures`: List lectures for course
- `GET /lectures/{lecture_id}`: Fetch lecture with slides and citations
- `PATCH /lectures/{lecture_id}`: Update lecture metadata
- `DELETE /lectures/{lecture_id}`: Delete lecture and citations
- `PATCH /lectures/{lecture_id}/slides/{slide_id}`: Update slide title, bullets, notes
- `DELETE /lectures/{lecture_id}/slides/{slide_id}`: Delete slide & renumber remaining
- `POST /lectures/{lecture_id}/slides/{slide_id}/regenerate`: Targeted single-slide AI regeneration

---

## 5. User Flow Verification (Section 17)

The complete end-to-end user flow was verified in `tests/test_flow_verification.py`:
1. Created "Operating Systems" course via `POST /courses`.
2. Uploaded `Operating_Systems.pdf` via `POST /courses/{id}/documents/upload`.
3. Verified document chunks stored in ChromaDB with `course_id` and `document_id` metadata.
4. Queried `POST /courses/{id}/chat` for "What is Round Robin CPU scheduling?" -> received grounded response with page citation.
5. Generated 60-minute lecture on "CPU Scheduling" -> synthesized title, learning objectives, and slides with citations referencing real retrieved chunks.
6. Verified slide citations match source filename, page, and chunk text.
7. Manually edited slide 1 title & bullet points -> saved and verified.
8. Regenerated slide 2 with specific instructions ("Add real-world time quantum values...") -> only slide 2 was updated with refreshed citations; rest of lecture remained intact.
9. Reloaded lecture from database -> all updates and citations persisted accurately.

## How to Run EduForge AI

You can now launch both the backend and frontend simultaneously with a **single command** from the project root (`d:\EduForge AI`):

```bash
npm run dev
```

Or run them individually:
- **Backend only**: `npm run backend` (starts FastAPI on `http://127.0.0.1:8000`)
- **Frontend only**: `npm run frontend` (starts Vite on `http://localhost:5173`)
- **Tests**: `npm test` (runs full pytest test suite)
- **Windows Shortcut**: You can also double-click `dev.bat` or run `./dev.ps1` in PowerShell.

