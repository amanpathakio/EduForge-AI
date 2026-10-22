import os
import fitz
import pytest
import tempfile
from app.rag.document_loader import extract_text_from_pdf, PDFExtractionError

def create_sample_pdf(file_path: str, page_texts: list) -> None:
    """Helper utility to create a multi-page PDF for testing."""
    doc = fitz.open()
    for text in page_texts:
        page = doc.new_page()
        page.insert_text((50, 50), text)
    doc.save(file_path)
    doc.close()

def test_extract_text_from_valid_pdf():
    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = os.path.join(tmpdir, "sample_course.pdf")
        page_contents = [
            "Welcome to Operating Systems 101. Chapter 1: Introduction to Processes.",
            "Chapter 2: Memory Management and Virtual Memory page tables."
        ]
        create_sample_pdf(pdf_path, page_contents)

        doc_id, pages_data = extract_text_from_pdf(pdf_path, "sample_course.pdf")

        assert doc_id is not None
        assert len(pages_data) == 2
        
        # Verify page 1 metadata and content
        assert pages_data[0]["metadata"]["page_number"] == 1
        assert pages_data[0]["metadata"]["source_filename"] == "sample_course.pdf"
        assert pages_data[0]["metadata"]["total_pages"] == 2
        assert "Operating Systems 101" in pages_data[0]["text"]

        # Verify page 2 metadata and content
        assert pages_data[1]["metadata"]["page_number"] == 2
        assert "Memory Management" in pages_data[1]["text"]

def test_extract_text_empty_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        empty_pdf_path = os.path.join(tmpdir, "empty.pdf")
        with open(empty_pdf_path, "wb") as f:
            f.write(b"")

        with pytest.raises(PDFExtractionError, match="empty or does not exist"):
            extract_text_from_pdf(empty_pdf_path, "empty.pdf")

def test_extract_text_invalid_pdf_format():
    with tempfile.TemporaryDirectory() as tmpdir:
        invalid_path = os.path.join(tmpdir, "fake.pdf")
        with open(invalid_path, "w") as f:
            f.write("This is not a real PDF file content")

        with pytest.raises(PDFExtractionError):
            extract_text_from_pdf(invalid_path, "fake.pdf")
