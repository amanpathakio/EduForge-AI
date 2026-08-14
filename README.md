# EduForge AI — Phase 1: Grounded RAG Pipeline

EduForge AI Phase 1 provides a clean, modular, course-grounded **Retrieval-Augmented Generation (RAG)** backend. It enables professors to upload course material (PDFs) and students to ask questions where answers are strictly generated using **ONLY** the retrieved content from the uploaded documents, complete with precise page-level citations.

---

## 🎯 Architecture & RAG Workflow

```
[Professor Uploads PDF]
       │
       ▼
[PyMuPDF (fitz)] ── Extract page text & metadata (source filename, page_number, doc_id)
       │
       ▼
[Recursive Text Chunker] ── Split into semantic chunks (800 chars, 150 overlap)
       │
       ▼
[BAAI/bge-small-en-v1.5] ── Convert chunks to 384-dimensional dense vectors
       │
       ▼
[ChromaDB Store] ── Persist (text, embedding, metadata) in ./backend/chroma_db
       │
═══════╧═════════════════════════════════════════════════════════════════════════
       │
[Student Asks Question]
       │
       ▼
[BAAI/bge-small-en-v1.5] ── Embed question vector
       │
       ▼
[ChromaDB Search] ── Retrieve top-k relevant text chunks + page metadata
       │
       ▼
[Google Gemini LLM] ── Strict system prompt grounding: "Answer ONLY using context..."
       │
       ▼
[Final Response] ── Grounded answer + Source citations ("Operating Systems.pdf — Page 12")
```

---

## 🛠 Tech Stack & Rationale

- **Python 3.11+ / 3.12**: Core runtime environment.
- **FastAPI**: Modern, high-performance web framework for APIs.
- **PyMuPDF (`fitz`)**: Fast, robust PDF page-by-page text and layout extractor.
- **LangChain Text Splitters**: Smart boundary-aware character text splitting.
- **BAAI/bge-small-en-v1.5**: Open-source, top-tier lightweight embedding model (384 dims, SentenceTransformers).
- **ChromaDB**: Lightweight, developer-friendly persistent vector database.
- **Google Gemini API**: Advanced LLM for grounded answer synthesis.
- **pytest & httpx**: Unit and end-to-end integration test suite.

---

## 📁 Project Structure

```
d:\EduForge AI/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI entry point & CORS
│   │   ├── config.py              # Pydantic environment configuration
│   │   ├── rag/
│   │   │   ├── __init__.py
│   │   │   ├── document_loader.py # PyMuPDF PDF extraction & metadata
│   │   │   ├── chunker.py         # Configurable text chunking
│   │   │   ├── embeddings.py      # BAAI/bge-small-en-v1.5 model manager
│   │   │   ├── vector_store.py    # Persistent ChromaDB store
│   │   │   ├── retriever.py       # Similarity search module
│   │   │   └── generator.py       # Grounded Gemini response synthesis
│   │   └── api/
│   │       ├── __init__.py
│   │       └── routes.py          # /health, /documents/upload, /chat endpoints
│   ├── data/
│   │   └── uploads/               # Temporary PDF upload storage
│   ├── chroma_db/                 # Persistent ChromaDB vector files
│   ├── requirements.txt           # Python dependencies
│   ├── .env.example               # Environment variables template
│   └── .env                       # Local environment configuration
├── tests/
│   ├── test_pdf_extraction.py     # PyMuPDF unit tests
│   ├── test_chunker.py            # Chunker unit tests
│   ├── test_embeddings.py         # BAAI embedding unit tests
│   ├── test_vector_store.py       # ChromaDB unit tests
│   ├── test_api.py                # FastAPI endpoints test
│   └── test_end_to_end.py         # Full RAG pipeline integration test
├── README.md
└── .gitignore
```

---

## ⚙️ Environment Variables

Create `backend/.env` based on `backend/.env.example`:

```ini
# Gemini API Key (Required for answer generation)
GEMINI_API_KEY=your_actual_gemini_api_key_here

# Embedding Configuration
EMBEDDING_MODEL_NAME=BAAI/bge-small-en-v1.5

# Vector Store Configuration
CHROMA_DB_DIR=chroma_db

# File Storage Configuration
UPLOAD_DIR=data/uploads

# Text Chunking Settings
CHUNK_SIZE=800
CHUNK_OVERLAP=150

# Retrieval Settings
TOP_K=4
```

---

## 🚀 Setup & Running Instructions

### 1. Create Virtual Environment & Install Dependencies

```bash
# Navigate to project root
cd "d:\EduForge AI"

# Create virtual environment
python -m venv backend/venv

# Activate virtual environment (Windows PowerShell)
.\backend\venv\Scripts\Activate.ps1

# Install requirements
pip install -r backend/requirements.txt
```

### 2. Start the FastAPI Server

```bash
# Run server with uvicorn from backend directory
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API interactive Swagger documentation will be available at:
`http://127.0.0.1:8000/docs`

---

## 📖 API Usage & Examples

### 1. Health Check Endpoint

**Request:**
`GET /health`

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "chroma_db_status": "healthy",
  "total_indexed_chunks": 12,
  "gemini_api_key_configured": true
}
```

### 2. Upload Document Endpoint

**Request:**
`POST /documents/upload` (Form Data: `file=@Operating_Systems.pdf`)

**cURL Command:**
```bash
curl -X POST "http://127.0.0.1:8000/documents/upload" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@Operating_Systems.pdf"
```

**Response:**
```json
{
  "status": "success",
  "message": "Document 'Operating_Systems.pdf' processed and indexed successfully.",
  "filename": "Operating_Systems.pdf",
  "doc_id": "4b6e5114-1a22-4876-b6fb-c990a42426bf",
  "pages_extracted": 15,
  "chunks_created": 42,
  "total_vectors_in_store": 42
}
```

### 3. Query / Chat Endpoint

**Request:**
`POST /chat`

**cURL Command:**
```bash
curl -X POST "http://127.0.0.1:8000/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the difference between a process and a thread?",
    "top_k": 3
  }'
```

**Response:**
```json
{
  "question": "What is the difference between a process and a thread?",
  "answer": "According to the course material, a process is an independent program in execution with its own address space, memory, and system resources. A thread is a lightweight unit of execution within a process that shares the parent process's memory space and open files.\n\nSources:\n- Operating_Systems.pdf — Page 4\n- Operating_Systems.pdf — Page 5",
  "sources": [
    "Operating_Systems.pdf — Page 4",
    "Operating_Systems.pdf — Page 5"
  ],
  "retrieved_chunks": [
    {
      "id": "4b6e5114-1a22-4876-b6fb-c990a42426bf_p4_c1",
      "text": "A process is an execution environment containing memory space and system handle tables...",
      "metadata": {
        "doc_id": "4b6e5114-1a22-4876-b6fb-c990a42426bf",
        "page_number": 4,
        "source_filename": "Operating_Systems.pdf"
      },
      "distance": 0.1824
    }
  ]
}
```

---

## 🧪 Running Tests

To execute unit and integration tests across all RAG modules:

```bash
# From project root directory
.\backend\venv\Scripts\pytest tests/ -v
```

This runs:
1. `test_pdf_extraction.py`: Validates PyMuPDF extraction, page numbers, and empty file handling.
2. `test_chunker.py`: Validates text chunking and metadata preservation.
3. `test_embeddings.py`: Validates `BAAI/bge-small-en-v1.5` output vectors (384 dimensions).
4. `test_vector_store.py`: Validates persistent ChromaDB storage and similarity search.
5. `test_api.py`: Validates FastAPI endpoints (`/health`, `/documents/upload`, `/chat`).
6. `test_end_to_end.py`: End-to-end flow test (PDF -> Extraction -> Chunking -> Embedding -> ChromaDB -> Question -> Retrieval -> Grounded Answer).
