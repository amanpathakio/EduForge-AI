import os
import fitz
import tempfile
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def create_temp_pdf_file(tmpdir: str, filename: str, content: str) -> str:
    pdf_path = os.path.join(tmpdir, filename)
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), content)
    doc.save(pdf_path)
    doc.close()
    return pdf_path

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "chroma_db_status" in data
    assert "gemini_api_key_configured" in data

def test_root_spa_serving():
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "EduForge" in response.text

def test_upload_invalid_file_type():
    response = client.post(
        "/documents/upload",
        files={"file": ("test.txt", b"Invalid text file content", "text/plain")}
    )
    assert response.status_code == 400
    assert "Only PDF documents" in response.json()["detail"]

def test_upload_valid_pdf_and_query():
    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = create_temp_pdf_file(
            tmpdir,
            "algorithms.pdf",
            "Dijkstra algorithm finds the shortest path in a weighted graph with non-negative edge weights."
        )

        with open(pdf_path, "rb") as f:
            upload_response = client.post(
                "/documents/upload",
                files={"file": ("algorithms.pdf", f, "application/pdf")}
            )

        assert upload_response.status_code == 201
        res_data = upload_response.json()
        assert res_data["status"] == "success"
        assert res_data["filename"] == "algorithms.pdf"
        assert res_data["chunks_created"] >= 1

        # Query endpoint test
        chat_response = client.post(
            "/chat",
            json={"question": "What algorithm finds the shortest path in a weighted graph?", "top_k": 2}
        )

        assert chat_response.status_code in [200, 502]  # 502 if Gemini API key not provided, 200 if valid
        if chat_response.status_code == 200:
            chat_data = chat_response.json()
            assert "question" in chat_data
            assert "answer" in chat_data
            assert len(chat_data["retrieved_chunks"]) >= 1
            assert chat_data["retrieved_chunks"][0]["metadata"]["source_filename"] == "algorithms.pdf"
