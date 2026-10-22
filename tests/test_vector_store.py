import tempfile
import pytest
from app.rag.vector_store import VectorStoreManager
from app.rag.embeddings import embedding_manager

def test_vector_store_add_and_similarity_search():
    with tempfile.TemporaryDirectory() as tmp_chroma_dir:
        # Instantiate test vector store with isolated temp directory
        vstore = VectorStoreManager(collection_name="test_collection")
        vstore.persist_directory = tmp_chroma_dir
        vstore.clear()

        try:
            chunks = [
                {
                    "id": "doc1_p1_c1",
                    "text": "Deadlock occurs when processes are blocked waiting for resources held by each other.",
                    "metadata": {"source_filename": "OS.pdf", "page_number": 10, "doc_id": "doc1"}
                },
                {
                    "id": "doc1_p2_c1",
                    "text": "Page replacement algorithms like LRU and FIFO manage RAM cache.",
                    "metadata": {"source_filename": "OS.pdf", "page_number": 15, "doc_id": "doc1"}
                }
            ]

            texts = [c["text"] for c in chunks]
            embeddings = embedding_manager.embed_documents(texts)

            # Store vectors
            vstore.add_chunks(chunks, embeddings)
            assert vstore.count() == 2

            # Search for deadlock
            query_vector = embedding_manager.embed_query("What causes deadlock in OS?")
            results = vstore.similarity_search(query_vector, top_k=1)

            assert len(results) == 1
            assert "Deadlock occurs" in results[0]["text"]
            assert results[0]["metadata"]["page_number"] == 10
            assert results[0]["metadata"]["source_filename"] == "OS.pdf"
        finally:
            vstore.close()

