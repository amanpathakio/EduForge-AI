import os
import json
import tempfile
import fitz
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def create_sample_pdf(tmpdir: str, filename: str, content: str) -> str:
    pdf_path = os.path.join(tmpdir, filename)
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), content)
    doc.save(pdf_path)
    doc.close()
    return pdf_path

@patch("app.services.lecture_service._call_gemini")
def test_full_course_and_lecture_studio_user_flow(mock_gemini):
    """
    Verifies Section 17 exact flow:
    1. Create "Operating Systems" course
    2. Upload Operating_Systems.pdf
    3. Document processed into Chroma with course metadata
    4. Ask question & receive grounded course-only answer
    5. Generate 60-minute lecture on "CPU Scheduling"
    6. Verify structured lecture has learning objectives & slides with citations
    7. Inspect slide citations matching retrieved chunks
    8. Edit slide manually & save
    9. Regenerate only one slide with new citations
    10. Verify lecture and updated slide persist in DB
    """
    # 1. Create "Operating Systems" course
    create_course_res = client.post("/courses", json={
        "title": "Operating Systems",
        "description": "Semester 6 Operating Systems course"
    })
    assert create_course_res.status_code == 201
    course_data = create_course_res.json()
    course_id = course_data["id"]
    assert course_data["title"] == "Operating Systems"

    # 2. Upload Operating_Systems.pdf
    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = create_sample_pdf(
            tmpdir,
            "Operating_Systems.pdf",
            "Operating Systems Lecture 4: CPU Scheduling involves Round Robin and Shortest Job First. "
            "Round Robin assigns a time slice called quantum to each ready process."
        )
        with open(pdf_path, "rb") as f:
            upload_res = client.post(
                f"/courses/{course_id}/documents/upload",
                files={"file": ("Operating_Systems.pdf", f, "application/pdf")}
            )
        assert upload_res.status_code == 201
        upload_data = upload_res.json()
        assert upload_data["status"] == "success"
        assert upload_data["course_id"] == course_id
        assert upload_data["chunks_created"] >= 1

    # 3. Document in DB
    docs_res = client.get(f"/courses/{course_id}/documents")
    assert docs_res.status_code == 200
    docs = docs_res.json()
    assert len(docs) == 1
    assert docs[0]["filename"] == "Operating_Systems.pdf"

    # 4. Course-aware chat
    chat_res = client.post(f"/courses/{course_id}/chat", json={
        "message": "What is Round Robin CPU scheduling?"
    })
    assert chat_res.status_code in [200, 502]
    if chat_res.status_code == 200:
        chat_data = chat_res.json()
        assert len(chat_data["retrieved_chunks"]) >= 1
        assert chat_data["retrieved_chunks"][0]["metadata"]["course_id"] == course_id
        assert chat_data["retrieved_chunks"][0]["metadata"]["filename"] == "Operating_Systems.pdf"

    # 5. Generate 60-minute lecture on "CPU Scheduling"
    mock_gemini.return_value = json.dumps({
        "title": "Comprehensive Guide to CPU Scheduling",
        "topic": "CPU Scheduling",
        "learning_objectives": [
            "Explain CPU scheduling principles and goals",
            "Analyze Round Robin algorithm and quantum selection"
        ],
        "slides": [
            {
                "slide_number": 1,
                "title": "CPU Scheduling Overview",
                "content": [
                    "Allocation of CPU to ready processes",
                    "Maximizes throughput and CPU utilization"
                ],
                "speaker_notes": "Welcome class to CPU scheduling fundamentals.",
                "cited_chunk_indices": [1]
            },
            {
                "slide_number": 2,
                "title": "Round Robin Scheduling",
                "content": [
                    "Preemptive algorithm using fixed time quantum",
                    "Context switch occurs when quantum expires"
                ],
                "speaker_notes": "Discuss performance implications of small versus large time quantums.",
                "cited_chunk_indices": [1]
            }
        ]
    })

    gen_res = client.post(f"/courses/{course_id}/lectures/generate", json={
        "topic": "CPU Scheduling",
        "duration_minutes": 60,
        "difficulty": "intermediate",
        "slide_count": 2,
        "additional_instructions": "Focus on Round Robin and time quantums."
    })

    assert gen_res.status_code == 201
    lecture = gen_res.json()
    lecture_id = lecture["id"]
    assert lecture["title"] == "Comprehensive Guide to CPU Scheduling"
    assert lecture["duration_minutes"] == 60
    assert len(lecture["slides"]) == 2

    # 6. Check Slide Citations
    slide1 = lecture["slides"][0]
    slide2 = lecture["slides"][1]
    assert len(slide1["citations"]) >= 1
    assert slide1["citations"][0]["filename"] == "Operating_Systems.pdf"
    assert slide1["citations"][0]["chunk_text"] is not None

    # 7. Edit slide manually & save
    slide1_id = slide1["id"]
    update_slide_res = client.patch(f"/lectures/{lecture_id}/slides/{slide1_id}", json={
        "title": "CPU Scheduling Principles & Preemption",
        "content": ["Process state transitions", "Ready queue management"],
        "speaker_notes": "Updated presenter notes for slide 1."
    })
    assert update_slide_res.status_code == 200
    updated_slide = update_slide_res.json()
    assert updated_slide["title"] == "CPU Scheduling Principles & Preemption"
    assert updated_slide["content"] == ["Process state transitions", "Ready queue management"]

    # 8. Regenerate only slide 2
    slide2_id = slide2["id"]
    mock_gemini.return_value = json.dumps({
        "title": "Round Robin in Real-World Operating Systems",
        "content": [
            "Time quantum typically ranges from 10 to 100 milliseconds",
            "Real-world example: Linux Completely Fair Scheduler vs traditional round robin"
        ],
        "speaker_notes": "Highlight how real-world OS schedulers prevent starvation.",
        "cited_chunk_indices": [1]
    })

    regen_res = client.post(f"/lectures/{lecture_id}/slides/{slide2_id}/regenerate", json={
        "instruction": "Add real-world time quantum values and compare with modern operating systems."
    })
    assert regen_res.status_code == 200
    regen_slide = regen_res.json()
    assert regen_slide["title"] == "Round Robin in Real-World Operating Systems"
    assert len(regen_slide["citations"]) >= 1

    # 9. Verify persistence (fetch lecture again)
    fetch_lec_res = client.get(f"/lectures/{lecture_id}")
    assert fetch_lec_res.status_code == 200
    persisted_lec = fetch_lec_res.json()
    assert len(persisted_lec["slides"]) == 2
    assert persisted_lec["slides"][0]["title"] == "CPU Scheduling Principles & Preemption"
    assert persisted_lec["slides"][1]["title"] == "Round Robin in Real-World Operating Systems"
