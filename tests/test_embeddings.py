import pytest
from app.rag.embeddings import EmbeddingManager, EmbeddingError

def test_embedding_generation_dimension_and_type():
    manager = EmbeddingManager()
    sample_texts = [
        "What is process synchronization in operating systems?",
        "Virtual memory allows execution of processes that are not completely in memory."
    ]

    embeddings = manager.embed_documents(sample_texts)

    assert len(embeddings) == 2
    assert isinstance(embeddings[0], list)
    # BAAI/bge-small-en-v1.5 produces 384-dimensional embeddings
    assert len(embeddings[0]) == 384
    assert isinstance(embeddings[0][0], float)

def test_embed_query():
    manager = EmbeddingManager()
    query = "Explain CPU scheduling algorithms"

    query_vector = manager.embed_query(query)

    assert isinstance(query_vector, list)
    assert len(query_vector) == 384

def test_embed_empty_query_raises_error():
    manager = EmbeddingManager()
    with pytest.raises(EmbeddingError, match="Cannot embed an empty query"):
        manager.embed_query("   ")
