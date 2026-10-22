import os
import shutil
import logging
from typing import List, Optional
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.models.course import Course
from app.models.document import Document
from app.models.lecture import Lecture
from app.schemas.course import CourseCreate, CourseUpdate, CourseRead, DocumentRead
from app.config import settings
from app.rag.document_loader import extract_text_from_pdf, PDFExtractionError
from app.rag.chunker import create_chunks
from app.rag.embeddings import embedding_manager, EmbeddingError
from app.rag.vector_store import vector_store_manager, VectorStoreError

logger = logging.getLogger(__name__)

class CourseService:
    @staticmethod
    def get_courses(db: Session, user_id: str = None, is_admin: bool = False) -> List[CourseRead]:
        statement = select(Course).order_by(Course.created_at.desc())
        if user_id and not is_admin:
            from app.models.auth import CourseMembership
            statement = statement.outerjoin(CourseMembership).where((Course.owner_id == user_id) | (CourseMembership.user_id == user_id))
        courses = db.scalars(statement).unique().all()
        result = []
        for c in courses:
            doc_count = db.scalar(select(func.count(Document.id)).where(Document.course_id == c.id)) or 0
            lec_count = db.scalar(select(func.count(Lecture.id)).where(Lecture.course_id == c.id)) or 0
            result.append(
                CourseRead(
                    id=c.id,
                    title=c.title,
                    description=c.description or "",
                    created_at=c.created_at,
                    updated_at=c.updated_at,
                    document_count=doc_count,
                    lecture_count=lec_count
                )
            )
        return result

    @staticmethod
    def get_course(db: Session, course_id: str) -> Course:
        course = db.scalar(select(Course).where(Course.id == course_id))
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Course '{course_id}' not found.")
        return course

    @staticmethod
    def get_course_read(db: Session, course_id: str) -> CourseRead:
        course = CourseService.get_course(db, course_id)
        doc_count = db.scalar(select(func.count(Document.id)).where(Document.course_id == course.id)) or 0
        lec_count = db.scalar(select(func.count(Lecture.id)).where(Lecture.course_id == course.id)) or 0
        return CourseRead(
            id=course.id,
            title=course.title,
            description=course.description or "",
            created_at=course.created_at,
            updated_at=course.updated_at,
            document_count=doc_count,
            lecture_count=lec_count
        )

    @staticmethod
    def create_course(db: Session, course_in: CourseCreate, owner_id: str) -> Course:
        course = Course(
            title=course_in.title.strip(),
            description=(course_in.description or "").strip(), owner_id=owner_id
        )
        db.add(course)
        db.commit()
        db.refresh(course)
        logger.info(f"Created new course: {course.id} ('{course.title}')")
        return course

    @staticmethod
    def update_course(db: Session, course_id: str, course_in: CourseUpdate) -> Course:
        course = CourseService.get_course(db, course_id)
        if course_in.title is not None:
            course.title = course_in.title.strip()
        if course_in.description is not None:
            course.description = course_in.description.strip()
        db.commit()
        db.refresh(course)
        logger.info(f"Updated course: {course.id}")
        return course

    @staticmethod
    def delete_course(db: Session, course_id: str) -> None:
        course = CourseService.get_course(db, course_id)
        # Delete vectors in ChromaDB belonging to this course
        vector_store_manager.delete_by_course(course_id)
        db.delete(course)
        db.commit()
        logger.info(f"Deleted course: {course_id} and purged associated vectors.")

    @staticmethod
    def get_course_documents(db: Session, course_id: str) -> List[DocumentRead]:
        CourseService.get_course(db, course_id)  # Validate course exists
        docs = db.scalars(select(Document).where(Document.course_id == course_id).order_by(Document.created_at.desc())).all()
        return [DocumentRead.model_validate(d) for d in docs]

    @staticmethod
    def upload_document_to_course(db: Session, course_id: str, file: UploadFile):
        # 1. Verify course exists
        course = CourseService.get_course(db, course_id)

        # 2. Validate file extension
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Only PDF documents (.pdf) are supported."
            )

        temp_path = os.path.join(settings.UPLOAD_DIR, file.filename)

        try:
            with open(temp_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # 3. Extract text page by page
            doc_id, pages_data = extract_text_from_pdf(temp_path, file.filename)

            # 4. Attach course_id & document_id into page metadata
            for p in pages_data:
                p["metadata"]["course_id"] = course_id
                p["metadata"]["document_id"] = doc_id
                p["metadata"]["filename"] = file.filename

            # 5. Create text chunks
            chunks = create_chunks(pages_data)
            for c in chunks:
                c["metadata"]["course_id"] = course_id
                c["metadata"]["document_id"] = doc_id
                c["metadata"]["filename"] = file.filename

            # 6. Generate embeddings
            chunk_texts = [c["text"] for c in chunks]
            embeddings = embedding_manager.embed_documents(chunk_texts)

            # 7. Store in ChromaDB
            vector_store_manager.add_chunks(chunks, embeddings)

            # 8. Record in relational DB
            db_doc = Document(
                id=doc_id,
                course_id=course_id,
                filename=file.filename,
                file_path=temp_path,
                pages_count=len(pages_data),
                chunks_count=len(chunks)
            )
            db.add(db_doc)
            db.commit()
            db.refresh(db_doc)

            logger.info(f"Document '{file.filename}' attached to course '{course.title}' (ID: {course_id}) with {len(chunks)} chunks.")

            return {
                "status": "success",
                "message": f"Document '{file.filename}' processed and indexed for course '{course.title}'.",
                "filename": file.filename,
                "doc_id": doc_id,
                "course_id": course_id,
                "pages_extracted": len(pages_data),
                "chunks_created": len(chunks),
                "total_vectors_in_store": vector_store_manager.count()
            }

        except PDFExtractionError as e:
            logger.warning(f"PDF extraction error for '{file.filename}': {str(e)}")
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
        except (EmbeddingError, VectorStoreError) as e:
            logger.error(f"Processing error for '{file.filename}': {str(e)}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
        except Exception as e:
            logger.exception(f"Unexpected upload failure: {str(e)}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Upload failed: {str(e)}")
