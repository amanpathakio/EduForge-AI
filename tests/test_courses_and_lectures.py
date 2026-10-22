import os
import json
import tempfile
import fitz
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.models.course import Course
from app.models.lecture import Lecture, LectureSlide
from app.models.citation import Citation
from app.rag.retriever import retrieve_relevant_chunks

client = TestClient(app)

def create_temp_pdf(tmpdir: str, filename: str, content: str) -> str:
    pdf_path = os.path.join(tmpdir, filename)
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), content)
    doc.save(pdf_path)
    doc.close()
    return pdf_path

# ----------------- Course CRUD Tests -----------------

def test_course_crud():
    # 1. Create Course
    create_res = client.post("/courses", json={
        "title": "Operating Systems CS301",
        "description": "Core computer science OS course"
    })
    assert create_res.status_code == 201
    course_data = create_res.json()
    course_id = course_data["id"]
    assert course_data["title"] == "Operating Systems CS301"
    assert course_data["document_count"] == 0

    # 2. Get Course
    get_res = client.get(f"/courses/{course_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == course_id

    # 3. List Courses
    list_res = client.get("/courses")
    assert list_res.status_code == 200
    courses = list_res.json()
    assert any(c["id"] == course_id for c in courses)

    # 4. Update Course
    update_res = client.patch(f"/courses/{course_id}", json={
        "title": "Operating Systems & Concurrency",
        "description": "Updated syllabus"
    })
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Operating Systems & Concurrency"

    # 5. Delete Course
    del_res = client.delete(f"/courses/{course_id}")
    assert del_res.status_code == 204

    # Verify deleted
    get_del = client.get(f"/courses/{course_id}")
    assert get_del.status_code == 404


# ----------------- Document & Course-Isolation Tests -----------------

def test_documents_associated_with_course_and_isolation():
    # Create two isolated courses
    c1_res = client.post("/courses", json={"title": "Course Biology 101"})
    c1_id = c1_res.json()["id"]

    c2_res = client.post("/courses", json={"title": "Course Quantum Physics 201"})
    c2_id = c2_res.json()["id"]

    with tempfile.TemporaryDirectory() as tmpdir:
        # Upload Biology PDF to Course 1
        bio_pdf = create_temp_pdf(
            tmpdir,
            "biology.pdf",
            "Photosynthesis is the process by which green plants transform light energy into chemical energy."
        )
        with open(bio_pdf, "rb") as f:
            up1 = client.post(f"/courses/{c1_id}/documents/upload", files={"file": ("biology.pdf", f, "application/pdf")})
        assert up1.status_code == 201
        assert up1.json()["course_id"] == c1_id

        # Upload Physics PDF to Course 2
        phys_pdf = create_temp_pdf(
            tmpdir,
            "physics.pdf",
            "Quantum entanglement occurs when a group of particles interact such that quantum state of each particle cannot be described independently."
        )
        with open(phys_pdf, "rb") as f:
            up2 = client.post(f"/courses/{c2_id}/documents/upload", files={"file": ("physics.pdf", f, "application/pdf")})
        assert up2.status_code == 201
        assert up2.json()["course_id"] == c2_id

        # List documents per course
        docs_c1 = client.get(f"/courses/{c1_id}/documents").json()
        assert len(docs_c1) == 1
        assert docs_c1[0]["filename"] == "biology.pdf"

        docs_c2 = client.get(f"/courses/{c2_id}/documents").json()
        assert len(docs_c2) == 1
        assert docs_c2[0]["filename"] == "physics.pdf"

        # TEST STRICT ISOLATION:
        # Query Biology in Course 2 (Quantum Physics) -> MUST NOT find biology chunks
        chunks_in_c2 = retrieve_relevant_chunks("Photosynthesis chemical energy", top_k=4, course_id=c2_id)
        for c in chunks_in_c2:
            assert c["metadata"]["course_id"] == c2_id
            assert "biology" not in c["metadata"].get("filename", "").lower()

        # Query Physics in Course 1 (Biology) -> MUST NOT find physics chunks
        chunks_in_c1 = retrieve_relevant_chunks("Quantum entanglement particles", top_k=4, course_id=c1_id)
        for c in chunks_in_c1:
            assert c["metadata"]["course_id"] == c1_id
            assert "physics" not in c["metadata"].get("filename", "").lower()

        # Course Chat with Out of Context Question
        chat_bio_in_phys = client.post(f"/courses/{c2_id}/chat", json={
            "message": "What is photosynthesis?"
        })
        assert chat_bio_in_phys.status_code == 200
        assert "Insufficient information" in chat_bio_in_phys.json()["answer"]


# ----------------- Lecture Generation & Safety Tests -----------------

def test_lecture_generation_insufficient_context():
    # Course with no documents
    c_res = client.post("/courses", json={"title": "Empty Course"})
    c_id = c_res.json()["id"]

    gen_res = client.post(f"/courses/{c_id}/lectures/generate", json={
        "topic": "Advanced Distributed Systems",
        "duration_minutes": 60,
        "difficulty": "advanced",
        "slide_count": 5
    })
    assert gen_res.status_code == 400
    assert "Insufficient information" in gen_res.json()["detail"]


@patch("app.services.lecture_service._call_gemini")
def test_lecture_generation_and_citations(mock_gemini):
    # Setup Course with Document
    c_res = client.post("/courses", json={"title": "Operating Systems Scheduling"})
    c_id = c_res.json()["id"]

    with tempfile.TemporaryDirectory() as tmpdir:
        os_pdf = create_temp_pdf(
            tmpdir,
            "OS_Scheduling.pdf",
            "Round Robin scheduling is a preemptive CPU scheduling algorithm where each process gets a fixed time quantum. FCFS is non-preemptive."
        )
        with open(os_pdf, "rb") as f:
            client.post(f"/courses/{c_id}/documents/upload", files={"file": ("OS_Scheduling.pdf", f, "application/pdf")})

    # Mock valid structured JSON from Gemini
    mock_gemini.return_value = json.dumps({
        "title": "CPU Scheduling Algorithms",
        "topic": "CPU Scheduling",
        "learning_objectives": [
            "Understand Round Robin scheduling and time quantum",
            "Differentiate preemptive and non-preemptive scheduling"
        ],
        "slides": [
            {
                "slide_number": 1,
                "title": "Introduction to CPU Scheduling",
                "content": [
                    "CPU scheduling determines process execution order",
                    "Aims for fairness and high throughput"
                ],
                "speaker_notes": "Introduce the motivation for CPU scheduling in multitasking systems.",
                "cited_chunk_indices": [1]
            },
            {
                "slide_number": 2,
                "title": "Round Robin Algorithm",
                "content": [
                    "Preemptive algorithm based on time slicing",
                    "Each process receives a specific time quantum"
                ],
                "speaker_notes": "Explain how preemptive quantum expiration triggers context switches.",
                "cited_chunk_indices": [1]
            }
        ]
    })

    gen_res = client.post(f"/courses/{c_id}/lectures/generate", json={
        "topic": "Round Robin CPU Scheduling",
        "duration_minutes": 45,
        "difficulty": "intermediate",
        "slide_count": 2
    })

    assert gen_res.status_code == 201
    lec_data = gen_res.json()
    assert lec_data["title"] == "CPU Scheduling Algorithms"
    assert len(lec_data["slides"]) == 2
    slide1 = lec_data["slides"][0]
    assert slide1["title"] == "Introduction to CPU Scheduling"
    assert len(slide1["citations"]) >= 1
    assert slide1["citations"][0]["filename"] == "OS_Scheduling.pdf"
    assert slide1["citations"][0]["entity_type"] == "lecture_slide"
    assert slide1["citations"][0]["chunk_text"] is not None

    lecture_id = lec_data["id"]

    # Test GET /lectures/{id}
    get_lec = client.get(f"/lectures/{lecture_id}")
    assert get_lec.status_code == 200
    assert len(get_lec.json()["slides"]) == 2

    # Test PATCH /lectures/{id}/slides/{slide_id}
    slide1_id = slide1["id"]
    patch_slide = client.patch(f"/lectures/{lecture_id}/slides/{slide1_id}", json={
        "title": "Introduction to Multitasking & CPU Scheduling",
        "content": ["New bullet 1", "New bullet 2"]
    })
    assert patch_slide.status_code == 200
    assert patch_slide.json()["title"] == "Introduction to Multitasking & CPU Scheduling"
    assert patch_slide.json()["content"] == ["New bullet 1", "New bullet 2"]


@patch("app.services.lecture_service._call_gemini")
def test_lecture_generation_malformed_json_handling(mock_gemini):
    c_res = client.post("/courses", json={"title": "Error Handling Course"})
    c_id = c_res.json()["id"]

    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = create_temp_pdf(
            tmpdir,
            "doc.pdf",
            "Some valid lecture notes about database normalization 1NF 2NF 3NF."
        )
        with open(pdf_path, "rb") as f:
            client.post(f"/courses/{c_id}/documents/upload", files={"file": ("doc.pdf", f, "application/pdf")})

    # Return garbage non-JSON from LLM
    mock_gemini.return_value = "I am sorry, but here is my opinion instead of valid JSON."

    gen_res = client.post(f"/courses/{c_id}/lectures/generate", json={
        "topic": "database normalization",
        "duration_minutes": 30,
        "difficulty": "beginner",
        "slide_count": 3
    })
    assert gen_res.status_code == 502
    assert "Failed to generate structured lecture" in gen_res.json()["detail"]


@patch("app.services.lecture_service._call_gemini")
def test_slide_regeneration(mock_gemini):
    c_res = client.post("/courses", json={"title": "Data Structures"})
    c_id = c_res.json()["id"]

    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = create_temp_pdf(
            tmpdir,
            "trees.pdf",
            "Binary Search Tree property: left subtree keys are smaller than root, right subtree keys are larger."
        )
        with open(pdf_path, "rb") as f:
            client.post(f"/courses/{c_id}/documents/upload", files={"file": ("trees.pdf", f, "application/pdf")})

    # 1. Generate Initial Lecture
    mock_gemini.return_value = json.dumps({
        "title": "Trees in Computer Science",
        "topic": "Binary Search Trees",
        "learning_objectives": ["Understand BST"],
        "slides": [
            {
                "slide_number": 1,
                "title": "BST Basics",
                "content": ["Definition of BST"],
                "speaker_notes": "Introduce BST.",
                "cited_chunk_indices": [1]
            }
        ]
    })
    gen_res = client.post(f"/courses/{c_id}/lectures/generate", json={
        "topic": "Binary Search Tree keys and properties",
        "duration_minutes": 30,
        "difficulty": "intermediate",
        "slide_count": 1
    })
    assert gen_res.status_code == 201
    lecture = gen_res.json()
    slide_id = lecture["slides"][0]["id"]
    lecture_id = lecture["id"]

    # 2. Targeted Slide Regeneration
    mock_gemini.return_value = json.dumps({
        "title": "BST Property with Real-world Example",
        "content": [
            "Left child values are strictly smaller than root",
            "Right child values are strictly larger than root",
            "Real-world example: searching words in a dictionary index"
        ],
        "speaker_notes": "Emphasize how the ordering invariant speeds up lookup time.",
        "cited_chunk_indices": [1]
    })

    regen_res = client.post(f"/lectures/{lecture_id}/slides/{slide_id}/regenerate", json={
        "instruction": "Add a real-world example and make explanation clearer."
    })
    assert regen_res.status_code == 200
    regen_data = regen_res.json()
    assert regen_data["id"] == slide_id
    assert regen_data["title"] == "BST Property with Real-world Example"
    assert len(regen_data["content"]) == 3
    assert len(regen_data["citations"]) >= 1
    assert regen_data["citations"][0]["filename"] == "trees.pdf"

    # Verify overall lecture remains intact
    lec_check = client.get(f"/lectures/{lecture_id}").json()
    assert len(lec_check["slides"]) == 1
    assert lec_check["slides"][0]["title"] == "BST Property with Real-world Example"

    # 3. Test Slide Deletion
    del_slide_res = client.delete(f"/lectures/{lecture_id}/slides/{slide_id}")
    assert del_slide_res.status_code == 204
    lec_after_del = client.get(f"/lectures/{lecture_id}").json()
    assert len(lec_after_del["slides"]) == 0
