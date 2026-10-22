import logging
from typing import List, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.config import settings

logger = logging.getLogger(__name__)

def create_chunks(
    pages_data: List[Dict[str, Any]],
    chunk_size: int = None,
    chunk_overlap: int = None
) -> List[Dict[str, Any]]:
    """
    Split extracted PDF page texts into smaller semantic chunks while preserving source metadata.

    Args:
        pages_data: List of dicts containing 'text' and 'metadata' per page.
        chunk_size: Optional chunk character limit. Defaults to settings.CHUNK_SIZE.
        chunk_overlap: Optional overlap between adjacent chunks. Defaults to settings.CHUNK_OVERLAP.

    Returns:
        List of dictionaries with keys 'id', 'text', and 'metadata'.
    """
    c_size = chunk_size if chunk_size is not None else settings.CHUNK_SIZE
    c_overlap = chunk_overlap if chunk_overlap is not None else settings.CHUNK_OVERLAP

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=c_size,
        chunk_overlap=c_overlap,
        separators=["\n\n", "\n", ". ", " ", ""]
    )

    chunks: List[Dict[str, Any]] = []

    for page in pages_data:
        page_text = page["text"]
        page_meta = page["metadata"]
        
        # Split single page text
        split_texts = text_splitter.split_text(page_text)
        
        for idx, text_segment in enumerate(split_texts):
            chunk_id = f"{page_meta['doc_id']}_p{page_meta['page_number']}_c{idx+1}"
            chunk_metadata = {
                **page_meta,
                "chunk_index": idx + 1,
                "total_chunks_in_page": len(split_texts)
            }
            chunks.append({
                "id": chunk_id,
                "text": text_segment,
                "metadata": chunk_metadata
            })

    logger.info(f"Number of chunks created: {len(chunks)} (chunk_size={c_size}, chunk_overlap={c_overlap}).")
    return chunks
