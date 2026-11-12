import os
import secrets
import shutil
import string
import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.models.course import Course
from app.models.document import Document
from app.models.lecture import Lecture
from app.models.auth import Profile, CourseMembership, CourseInvite
from app.models.quiz import Quiz, QuizQuestion, QuizAttempt
from app.schemas.course import (
    CourseCreate,
    CourseUpdate,
    CourseRead,
    DocumentRead,
    CourseInviteRead,
    CourseStudentRead,
)
from app.config import settings
from app.rag.document_loader import extract_text_from_pdf, PDFExtractionError
from app.rag.chunker import create_chunks
from app.rag.embeddings import embedding_manager, EmbeddingError
from app.rag.vector_store import vector_store_manager, VectorStoreError

logger = logging.getLogger(__name__)

class CourseService:
    @staticmethod
    def _resolve_course_role(db: Session, course: Course, user_id: Optional[str], is_admin: bool = False) -> str:
        if is_admin or (user_id and course.owner_id == user_id):
            return "professor"
        if user_id:
            membership = db.scalar(
                select(CourseMembership).where(
                    CourseMembership.course_id == course.id,
                    CourseMembership.user_id == user_id,
                )
            )
            if membership and membership.role == "professor":
                return "professor"
        return "student"

    @staticmethod
    def _build_course_read(db: Session, c: Course, user_id: Optional[str], is_admin: bool = False) -> CourseRead:
        role = CourseService._resolve_course_role(db, c, user_id, is_admin)
        doc_count = db.scalar(select(func.count(Document.id)).where(Document.course_id == c.id)) or 0
        pub_lec_count = (
            db.scalar(
                select(func.count(Lecture.id)).where(
                    Lecture.course_id == c.id,
                    Lecture.status == "published",
                )
            )
            or 0
        )
        if role == "professor":
            lec_count = db.scalar(select(func.count(Lecture.id)).where(Lecture.course_id == c.id)) or 0
        else:
            lec_count = pub_lec_count
        return CourseRead(
            id=c.id,
            title=c.title,
            description=c.description or "",
            created_at=c.created_at,
            updated_at=c.updated_at,
            document_count=doc_count,
            lecture_count=lec_count,
            published_lecture_count=pub_lec_count,
            my_role=role,
        )

    @staticmethod
    def get_courses(db: Session, user_id: str = None, is_admin: bool = False) -> List[CourseRead]:
        statement = select(Course).order_by(Course.created_at.desc())
        if user_id and not is_admin:
            statement = statement.outerjoin(CourseMembership).where(
                (Course.owner_id == user_id) | (CourseMembership.user_id == user_id)
            )
        courses = db.scalars(statement).unique().all()
        return [CourseService._build_course_read(db, c, user_id, is_admin) for c in courses]

    @staticmethod
    def get_course(db: Session, course_id: str) -> Course:
        course = db.scalar(select(Course).where(Course.id == course_id))
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Course '{course_id}' not found.")
        return course

    @staticmethod
    def get_course_read(
        db: Session,
        course_id: str,
        user_id: Optional[str] = None,
        is_admin: bool = False,
    ) -> CourseRead:
        course = CourseService.get_course(db, course_id)
        return CourseService._build_course_read(db, course, user_id, is_admin)

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

    @staticmethod
    def _generate_invite_code(db: Session) -> str:
        alphabet = string.ascii_uppercase + string.digits
        for _ in range(10):
            token = "".join(secrets.choice(alphabet) for _ in range(6))
            code = f"EF-{token}"
            if not db.scalar(select(CourseInvite).where(CourseInvite.code == code)):
                return code
        raise HTTPException(status_code=500, detail="Could not generate unique invite code.")

    @staticmethod
    def list_course_invites(db: Session, course_id: str) -> List[CourseInviteRead]:
        CourseService.get_course(db, course_id)
        invites = db.scalars(
            select(CourseInvite)
            .where(CourseInvite.course_id == course_id, CourseInvite.is_active.is_(True))
            .order_by(CourseInvite.created_at.desc())
        ).all()
        return [CourseInviteRead.model_validate(inv) for inv in invites]

    @staticmethod
    def create_course_invite(db: Session, course_id: str, created_by: str) -> CourseInviteRead:
        CourseService.get_course(db, course_id)
        invite = CourseInvite(
            course_id=course_id,
            code=CourseService._generate_invite_code(db),
            created_by=created_by,
            is_active=True,
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)
        return CourseInviteRead.model_validate(invite)

    @staticmethod
    def revoke_course_invite(db: Session, course_id: str, invite_id: str) -> None:
        invite = db.scalar(
            select(CourseInvite).where(CourseInvite.id == invite_id, CourseInvite.course_id == course_id)
        )
        if not invite:
            raise HTTPException(status_code=404, detail="Invite code not found.")
        invite.is_active = False
        db.commit()

    @staticmethod
    def join_course_by_code(db: Session, raw_code: str, user: Profile) -> CourseRead:
        normalized = raw_code.strip().upper()
        invite = db.scalar(
            select(CourseInvite).where(CourseInvite.code == normalized, CourseInvite.is_active.is_(True))
        )
        if not invite:
            raise HTTPException(status_code=404, detail="Invalid or inactive course invite code.")
        if invite.expires_at and invite.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="This course invite code has expired.")

        course = CourseService.get_course(db, invite.course_id)
        existing = db.scalar(
            select(CourseMembership).where(
                CourseMembership.course_id == course.id,
                CourseMembership.user_id == user.id,
            )
        )
        if not existing and course.owner_id != user.id:
            db.add(CourseMembership(course_id=course.id, user_id=user.id, role="student"))
            invite.uses_count = (invite.uses_count or 0) + 1
            db.commit()

        return CourseService.get_course_read(db, course.id, user.id, user.role == "admin")

    @staticmethod
    def list_course_students(db: Session, course_id: str) -> List[CourseStudentRead]:
        CourseService.get_course(db, course_id)
        rows = db.execute(
            select(CourseMembership, Profile)
            .join(Profile, Profile.id == CourseMembership.user_id)
            .where(CourseMembership.course_id == course_id, CourseMembership.role == "student")
            .order_by(CourseMembership.created_at.desc())
        ).all()

        results: List[CourseStudentRead] = []
        for membership, profile in rows:
            attempts = (
                db.scalar(
                    select(func.count(QuizAttempt.id))
                    .join(QuizQuestion, QuizQuestion.id == QuizAttempt.question_id)
                    .join(Quiz, Quiz.id == QuizQuestion.quiz_id)
                    .where(Quiz.course_id == course_id, QuizAttempt.learner_id == profile.id)
                )
                or 0
            )
            correct = (
                db.scalar(
                    select(func.count(QuizAttempt.id))
                    .join(QuizQuestion, QuizQuestion.id == QuizAttempt.question_id)
                    .join(Quiz, Quiz.id == QuizQuestion.quiz_id)
                    .where(
                        Quiz.course_id == course_id,
                        QuizAttempt.learner_id == profile.id,
                        QuizAttempt.is_correct.is_(True),
                    )
                )
                or 0
            )
            results.append(
                CourseStudentRead(
                    user_id=profile.id,
                    email=profile.email,
                    full_name=profile.full_name,
                    role=membership.role,
                    joined_at=membership.created_at,
                    quiz_attempts_count=attempts,
                    correct_answers_count=correct,
                )
            )
        return results

    @staticmethod
    def remove_course_student(db: Session, course_id: str, user_id: str) -> None:
        membership = db.scalar(
            select(CourseMembership).where(
                CourseMembership.course_id == course_id,
                CourseMembership.user_id == user_id,
                CourseMembership.role == "student",
            )
        )
        if not membership:
            raise HTTPException(status_code=404, detail="Student enrollment not found.")
        db.delete(membership)
        db.commit()
