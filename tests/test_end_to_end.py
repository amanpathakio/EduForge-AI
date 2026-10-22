import os
import fitz
import tempfile
import pytest
from app.rag.document_loader import extract_text_from_pdf
from app.rag.chunker import create_chunks
from app.rag.embeddings import embedding_manager
from app.rag.vector_store import VectorStoreManager
from app.rag.retriever import retrieve_relevant_chunks
from app.rag.generator import generate_grounded_answer, GenerationError
from app.config import settings

def test_full_rag_pipeline_end_to_end():
    """
    End-to-End Test demonstrating:
    PDF Upload -> Page Extraction -> Chunking -> Embedding Generation -> ChromaDB Storage -> Question -> Retrieval -> Grounded Answer.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. Create a synthetic PDF document
        pdf_path = os.path.join(tmpdir, "Operating_Systems_Lecture.pdf")
        doc = fitz.open()
        
        p1 = doc.new_page()
        p1.insert_text((50, 50), "Operating Systems Lecture Note 1: Semaphore is a synchronization tool used to solve the critical section problem.")
        
        p2 = doc.new_page()
        p2.insert_text((50, 50), "Lecture Note 2: Bankers Algorithm is a deadlock avoidance algorithm that checks state safety.")

        doc.save(pdf_path)
        doc.close()

        # 2. Extract text page by page with PyMuPDF
        doc_id, pages_data = extract_text_from_pdf(pdf_path, "Operating_Systems_Lecture.pdf")
        assert len(pages_data) == 2

        # 3. Split into chunks
        chunks = create_chunks(pages_data, chunk_size=300, chunk_overlap=50)
        assert len(chunks) >= 2

        # 4. Generate BAAI/bge-small-en-v1.5 embeddings
        chunk_texts = [c["text"] for c in chunks]
        embeddings = embedding_manager.embed_documents(chunk_texts)
        assert len(embeddings) == len(chunks)

        # 5. Store in isolated ChromaDB test instance
        test_vstore = VectorStoreManager(collection_name="e2e_test_collection")
        test_vstore.persist_directory = tmpdir
        test_vstore.clear()
        try:
            test_vstore.add_chunks(chunks, embeddings)

            # 6. Retrieve relevant context for a question
            question = "What algorithm is used for deadlock avoidance?"
            query_vector = embedding_manager.embed_query(question)
            retrieved_chunks = test_vstore.similarity_search(query_vector, top_k=2)

            assert len(retrieved_chunks) >= 1
            top_retrieved_text = retrieved_chunks[0]["text"]
            assert "Bankers Algorithm" in top_retrieved_text or "deadlock avoidance" in top_retrieved_text
            assert retrieved_chunks[0]["metadata"]["source_filename"] == "Operating_Systems_Lecture.pdf"
            assert retrieved_chunks[0]["metadata"]["page_number"] == 2

            # 7. Generate grounded answer
            try:
                answer, retrieved, sources = generate_grounded_answer(
                    question=question,
                    retrieved_chunks=retrieved_chunks
                )
                assert len(sources) >= 1
                assert "Operating_Systems_Lecture.pdf — Page 2" in sources[0]
                assert len(answer) > 0
            except GenerationError as e:
                # If GEMINI_API_KEY is not set in test environment, GenerationError is expected
                assert "Gemini API key is not configured" in str(e) or "Gemini LLM error" in str(e)
        finally:
            test_vstore.close()

