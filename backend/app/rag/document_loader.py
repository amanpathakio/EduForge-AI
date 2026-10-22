import fitz  # PyMuPDF
import logging
import uuid
from typing import List, Dict, Any, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

class PDFExtractionError(Exception):
    """Custom exception raised when PDF text extraction fails."""
    pass

def extract_text_from_pdf(file_path: str, filename: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Extract text page by page from a PDF file using PyMuPDF (fitz).

    Args:
        file_path: Path to the stored PDF file on disk.
        filename: Original source filename.

    Returns:
        Tuple of (doc_id, list of page dictionary objects containing 'text' and 'metadata').

    Raises:
        PDFExtractionError: If file is invalid, empty, or has no extractable text.
    """
    path = Path(file_path)
    if not path.exists() or path.stat().st_size == 0:
        raise PDFExtractionError(f"File '{filename}' is empty or does not exist.")

    doc_id = str(uuid.uuid4())
    pages_data: List[Dict[str, Any]] = []

    try:
        doc = fitz.open(file_path)
    except Exception as e:
        logger.error(f"Failed to open PDF '{filename}': {str(e)}")
        raise PDFExtractionError(f"Corrupted or invalid PDF file '{filename}': {str(e)}")

    try:
        total_pages = len(doc)
        if total_pages == 0:
            raise PDFExtractionError(f"PDF file '{filename}' contains 0 pages.")

        logger.info(f"PDF received: '{filename}' (doc_id: {doc_id}) with {total_pages} page(s).")
        total_extracted_chars = 0

        for page_num in range(1, total_pages + 1):
            page = doc.load_page(page_num - 1)
            page_text = page.get_text("text").strip()

            if page_text:
                total_extracted_chars += len(page_text)
                pages_data.append({
                    "text": page_text,
                    "metadata": {
                        "source_filename": filename,
                        "page_number": page_num,
                        "doc_id": doc_id,
                        "total_pages": total_pages
                    }
                })

        if not pages_data or total_extracted_chars == 0:
            raise PDFExtractionError(
                f"PDF file '{filename}' contains no extractable text (it may be a scanned image-only PDF)."
            )

        logger.info(
            f"Pages extracted: {len(pages_data)}/{total_pages} page(s) with text from '{filename}'. "
            f"Total characters: {total_extracted_chars}."
        )
        return doc_id, pages_data

    finally:
        doc.close()
