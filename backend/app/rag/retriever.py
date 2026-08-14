import logging
from typing import List, Dict, Any
from app.rag.embeddings import embedding_manager
from app.rag.vector_store import vector_store_manager
from app.config import settings

logger = logging.getLogger(__name__)

def retrieve_relevant_chunks(question: str, top_k: int = None) -> List[Dict[str, Any]]:
    """
    Retrieve top-k relevant document chunks for a user question.

    Workflow:
    1. Query received
    2. Question embedded via BAAI/bge-small-en-v1.5
    3. Perform ChromaDB similarity search
    4. Return chunks + metadata

    Args:
        question: User query text.
        top_k: Number of chunks to retrieve. Defaults to settings.TOP_K.

    Returns:
        List of retrieved chunk dicts with 'id', 'text', 'metadata', and 'distance'.
    """
    if not question or not question.strip():
        logger.warning("Empty query received for retrieval.")
        return []

    k = top_k if top_k is not None else settings.TOP_K
    logger.info(f"Query received: '{question}' (top_k={k})")

    # Step 1: Embed question
    query_embedding = embedding_manager.embed_query(question)

    # Step 2: Similarity search in ChromaDB
    retrieved_chunks = vector_store_manager.similarity_search(
        query_embedding=query_embedding,
        top_k=k
    )

    # Apply configurable relevance filtering based on distance returned by ChromaDB.
    threshold = getattr(settings, "RELEVANCE_DISTANCE_THRESHOLD", None)
    if threshold is None:
        logger.info("No relevance threshold configured; returning top-k results without filtering.")
        # attach a score field for compatibility (score = 1 - distance for cosine)
        for c in retrieved_chunks:
            try:
                c["score"] = 1.0 - float(c.get("distance", 0.0))
            except Exception:
                c["score"] = None
        return retrieved_chunks

    accepted = []
    rejected = []
    for c in retrieved_chunks:
        dist = c.get("distance")
        if dist is None:
            rejected.append((c, "no_distance"))
            continue

        # Accept chunk if distance is less than or equal to threshold
        if dist <= threshold:
            # Add a normalized similarity score (1 - distance) to make inspection easier
            c["score"] = max(min(1.0 - float(dist), 1.0), -1.0)
            accepted.append(c)
        else:
            c_copy = c.copy()
            c_copy["score"] = max(min(1.0 - float(dist), 1.0), -1.0)
            rejected.append((c_copy, "distance_above_threshold"))

    # Logging accepted and rejected chunks
    logger.info(f"Relevance threshold: {threshold}. Retrieved {len(retrieved_chunks)} chunks; {len(accepted)} accepted, {len(rejected)} rejected.")
    for a in accepted:
        src = a.get("metadata", {}).get("source", a.get("metadata", {}))
        logger.info(f"Accepted chunk id={a.get('id')} src={src} distance={a.get('distance')} score={a.get('score')}")
    for r, reason in rejected:
        src = r.get("metadata", {}).get("source", r.get("metadata", {}))
        logger.info(f"Rejected chunk id={r.get('id')} src={src} distance={r.get('distance')} score={r.get('score')} reason={reason}")

    return accepted
