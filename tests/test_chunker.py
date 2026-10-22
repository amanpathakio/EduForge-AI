import pytest
from app.rag.chunker import create_chunks

def test_create_chunks_splitting_and_metadata():
    pages_data = [
        {
            "text": "Paragraph A " * 50 + "\n\n" + "Paragraph B " * 50,
            "metadata": {
                "source_filename": "test_syllabus.pdf",
                "page_number": 1,
                "doc_id": "test-uuid-123",
                "total_pages": 1
            }
        }
    ]

    chunks = create_chunks(pages_data, chunk_size=300, chunk_overlap=50)

    assert len(chunks) > 1
    for chunk in chunks:
        assert "id" in chunk
        assert "text" in chunk
        assert "metadata" in chunk
        assert chunk["metadata"]["source_filename"] == "test_syllabus.pdf"
        assert chunk["metadata"]["page_number"] == 1
        assert chunk["metadata"]["doc_id"] == "test-uuid-123"
        assert "chunk_index" in chunk["metadata"]
        assert chunk["id"].startswith("test-uuid-123_p1_c")

def test_create_chunks_empty_input():
    chunks = create_chunks([])
    assert chunks == []
