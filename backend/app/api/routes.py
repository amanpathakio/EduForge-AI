import os
import shutil
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Query, Depends
from pydantic import BaseModel, Field

from app.config import settings
from app.rag.document_loader import extract_text_from_pdf, PDFExtractionError
from app.rag.chunker import create_chunks
from app.rag.embeddings import embedding_manager, EmbeddingError
from app.rag.vector_store import vector_store_manager, VectorStoreError
from app.rag.retriever import retrieve_relevant_chunks
from app.rag.generator import generate_grounded_answer, GenerationError
from app.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Request and Response Models
class ChatRequest(BaseModel):
    question: str = Field(..., description="User question regarding course material", min_length=1)
    top_k: Optional[int] = Field(default=None, description="Number of context chunks to retrieve")

class ChatResponse(BaseModel):
    question: str
    answer: str
    sources: List[str]
    retrieved_chunks: List[Dict[str, Any]]

class UploadResponse(BaseModel):
    status: str
    message: str
    filename: str
    doc_id: str
    pages_extracted: int
    chunks_created: int
    total_vectors_in_store: int

class HealthResponse(BaseModel):
    status: str
    version: str
    chroma_db_status: str
    total_indexed_chunks: int
    gemini_api_key_configured: bool

@router.get("/health", response_model=HealthResponse)
def health_check(_user=Depends(get_current_user)):
    """
    Check API health and status of vector store and Gemini configuration.
    """
    try:
        total_chunks = vector_store_manager.count()
        chroma_status = "healthy"
    except Exception as e:
        logger.error(f"Health check ChromaDB error: {str(e)}")
        chroma_status = f"unhealthy: {str(e)}"

    has_gemini_key = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here")

    return HealthResponse(
        status="healthy",
        version="1.0.0",
        chroma_db_status=chroma_status,
        total_indexed_chunks=total_chunks if isinstance(total_chunks, int) else 0,
        gemini_api_key_configured=has_gemini_key
    )

@router.post("/documents/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(file: UploadFile = File(...)):
    """
    Upload and index a course PDF document into the RAG vector database.
    """
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Use the course-specific upload endpoint; global uploads are disabled for tenant isolation.")
    # 1. Validate file extension
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only PDF documents (.pdf) are supported."
        )

    temp_path = os.path.join(settings.UPLOAD_DIR, file.filename)

    try:
        # Save file to disk
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 2. Extract text page by page using PyMuPDF
        doc_id, pages_data = extract_text_from_pdf(temp_path, file.filename)

        # 3. Create text chunks
        chunks = create_chunks(pages_data)
        for c in chunks:
            c["metadata"]["document_id"] = doc_id
            c["metadata"]["filename"] = file.filename

        # 4. Generate embeddings
        chunk_texts = [c["text"] for c in chunks]
        embeddings = embedding_manager.embed_documents(chunk_texts)

        # 5. Store vectors in ChromaDB
        vector_store_manager.add_chunks(chunks, embeddings)

        # 6. Record in relational DB under a default course for consistency
        try:
            from app.db.session import SessionLocal
            from app.models.course import Course
            from app.models.document import Document
            from sqlalchemy import select

            with SessionLocal() as db:
                default_course = db.scalar(select(Course).where(Course.id == "default-course"))
                if not default_course:
                    default_course = Course(
                        id="default-course",
                        title="General Course",
                        description="Default workspace course for general uploads"
                    )
                    db.add(default_course)
                    db.commit()

                doc = Document(
                    id=doc_id,
                    course_id="default-course",
                    filename=file.filename,
                    file_path=temp_path,
                    pages_count=len(pages_data),
                    chunks_count=len(chunks)
                )
                db.add(doc)
                db.commit()
        except Exception as db_err:
            logger.warning(f"Could not persist legacy upload to DB (non-fatal): {str(db_err)}")

        return UploadResponse(
            status="success",
            message=f"Document '{file.filename}' processed and indexed successfully.",
            filename=file.filename,
            doc_id=doc_id,
            pages_extracted=len(pages_data),
            chunks_created=len(chunks),
            total_vectors_in_store=vector_store_manager.count()
        )

    except PDFExtractionError as e:
        logger.warning(f"PDF extraction error for '{file.filename}': {str(e)}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except (EmbeddingError, VectorStoreError) as e:
        logger.error(f"Processing error for '{file.filename}': {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected upload failure: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Upload failed: {str(e)}")

@router.post("/chat", response_model=ChatResponse)
def chat_with_course(request: ChatRequest):
    """
    Query the course material. Retrieves relevant context chunks from ChromaDB
    and generates a course-grounded answer with source citations via Gemini.
    """
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Use the course-specific chat endpoint; global chat is disabled for tenant isolation.")
    try:
        # 1. Retrieve top-k chunks from ChromaDB
        retrieved_chunks = retrieve_relevant_chunks(
            question=request.question,
            top_k=request.top_k
        )
        # If no chunks passed the relevance filter, return clear insufficient-info response
        if not retrieved_chunks:
            logger.info("No relevant chunks passed the relevance threshold. Not invoking Gemini.")
            return ChatResponse(
                question=request.question,
                answer="Insufficient information in the uploaded course material to answer the question.",
                sources=[],
                retrieved_chunks=[]
            )

        # 2. Generate grounded answer via Gemini
        answer, _, sources = generate_grounded_answer(
            question=request.question,
            retrieved_chunks=retrieved_chunks
        )

        return ChatResponse(
            question=request.question,
            answer=answer,
            sources=sources,
            retrieved_chunks=retrieved_chunks
        )

    except (EmbeddingError, VectorStoreError) as e:
        logger.error(f"Retrieval error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except GenerationError as e:
        logger.error(f"Generation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected chat error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Chat query failed: {str(e)}")
