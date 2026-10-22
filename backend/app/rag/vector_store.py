import logging
import chromadb
from chromadb.config import Settings as ChromaSettings
from typing import List, Dict, Any
from app.config import settings

logger = logging.getLogger(__name__)

class VectorStoreError(Exception):
    """Custom exception for vector store operations."""
    pass

class VectorStoreManager:
    """
    Manages persistent ChromaDB vector storage for EduForge AI course materials.
    """
    def __init__(self, collection_name: str = "eduforge_course_materials"):
        self.collection_name = collection_name
        self.persist_directory = settings.CHROMA_DB_DIR
        self._client = None
        self._collection = None

    def _get_collection(self):
        if self._collection is None:
            try:
                logger.info(f"Initializing persistent ChromaDB client at '{self.persist_directory}'...")
                self._client = chromadb.PersistentClient(path=self.persist_directory)
                self._collection = self._client.get_or_create_collection(
                    name=self.collection_name,
                    metadata={"hnsw:space": "cosine"}
                )
                logger.info(f"ChromaDB collection '{self.collection_name}' ready. Item count: {self._collection.count()}")
            except Exception as e:
                logger.error(f"Failed to initialize ChromaDB vector store: {str(e)}")
                raise VectorStoreError(f"ChromaDB initialization error: {str(e)}")
        return self._collection

    def add_chunks(self, chunks: List[Dict[str, Any]], embeddings: List[List[float]]) -> None:
        """
        Store chunk text, embeddings, metadata, and IDs into ChromaDB.

        Args:
            chunks: List of chunk dicts containing 'id', 'text', 'metadata'.
            embeddings: List of embedding vectors matching chunks.
        """
        if not chunks or not embeddings:
            logger.warning("No chunks or embeddings provided to store in ChromaDB.")
            return

        if len(chunks) != len(embeddings):
            raise VectorStoreError("Mismatch between number of chunks and embeddings.")

        ids = [c["id"] for c in chunks]
        documents = [c["text"] for c in chunks]
        metadatas = [c["metadata"] for c in chunks]

        try:
            collection = self._get_collection()
            collection.add(
                ids=ids,
                documents=documents,
                embeddings=embeddings,
                metadatas=metadatas
            )
            logger.info(f"Vectors stored: {len(chunks)} chunks inserted into ChromaDB. Total count: {collection.count()}.")
        except Exception as e:
            logger.error(f"Error adding chunks to ChromaDB: {str(e)}")
            raise VectorStoreError(f"Failed to store vectors in ChromaDB: {str(e)}")

    def similarity_search(
        self,
        query_embedding: List[float],
        top_k: int = None,
        course_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        Search ChromaDB for top-k chunks nearest to the query vector, optionally filtered by course_id.

        Args:
            query_embedding: Search vector.
            top_k: Number of results to return. Defaults to settings.TOP_K.
            course_id: Optional course ID to filter chunks by.

        Returns:
            List of result dicts with 'id', 'text', 'metadata', 'distance'.
        """
        k = top_k if top_k is not None else settings.TOP_K
        collection = self._get_collection()

        total_docs = collection.count()
        if total_docs == 0:
            logger.warning("ChromaDB collection is empty. Returning 0 retrieved chunks.")
            return []

        # Avoid asking for more elements than exist in collection
        actual_k = min(k, total_docs)

        query_kwargs: Dict[str, Any] = {
            "query_embeddings": [query_embedding],
            "n_results": actual_k,
            "include": ["documents", "metadatas", "distances"]
        }

        if course_id:
            query_kwargs["where"] = {"course_id": course_id}

        try:
            results = collection.query(**query_kwargs)

            retrieved = []
            if results and results.get("documents") and results["documents"][0]:
                docs = results["documents"][0]
                metas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(docs)
                ids = results["ids"][0] if results.get("ids") else [""] * len(docs)
                distances = results["distances"][0] if results.get("distances") else [0.0] * len(docs)

                for doc, meta, doc_id, dist in zip(docs, metas, ids, distances):
                    retrieved.append({
                        "id": doc_id,
                        "text": doc,
                        "metadata": meta,
                        "distance": dist
                    })

            logger.info(f"Number of chunks retrieved from ChromaDB: {len(retrieved)} (course_id={course_id}).")
            return retrieved

        except Exception as e:
            logger.error(f"ChromaDB similarity search error: {str(e)}")
            raise VectorStoreError(f"Vector retrieval failed: {str(e)}")

    def delete_by_course(self, course_id: str) -> None:
        """Delete all vectors belonging to a specific course."""
        try:
            collection = self._get_collection()
            collection.delete(where={"course_id": course_id})
            logger.info(f"Deleted vectors for course_id '{course_id}' from ChromaDB.")
        except Exception as e:
            logger.warning(f"Error deleting vectors for course '{course_id}': {str(e)}")

    def delete_by_document(self, document_id: str) -> None:
        """Delete all vectors belonging to a specific document."""
        try:
            collection = self._get_collection()
            collection.delete(where={"document_id": document_id})
            logger.info(f"Deleted vectors for document_id '{document_id}' from ChromaDB.")
        except Exception as e:
            logger.warning(f"Error deleting vectors for document '{document_id}': {str(e)}")

    def count(self) -> int:
        """Return total document count in collection."""
        return self._get_collection().count()

    def clear(self) -> None:
        """Clear collection for testing/reset purposes."""
        try:
            if self._client and self.collection_name in [c.name for c in self._client.list_collections()]:
                self._client.delete_collection(name=self.collection_name)
                self._collection = None
                logger.info(f"Cleared ChromaDB collection '{self.collection_name}'.")
        except Exception as e:
            logger.error(f"Failed to clear collection: {str(e)}")

    def close(self) -> None:
        """Close/stop the persistent client to release file handles on Windows."""
        try:
            if self._client:
                if hasattr(self._client, '_system'):
                    self._client._system.stop()
                self._client = None
                self._collection = None
                import gc
                gc.collect()
                logger.info("ChromaDB persistent client closed successfully.")
        except Exception as e:
            logger.error(f"Error closing ChromaDB client: {str(e)}")

# Global vector store manager
vector_store_manager = VectorStoreManager()

