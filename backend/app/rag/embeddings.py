import logging
from typing import List
from sentence_transformers import SentenceTransformer
from app.config import settings

logger = logging.getLogger(__name__)

class EmbeddingError(Exception):
    """Custom exception raised during embedding generation."""
    pass

class EmbeddingManager:
    """
    Manages vector embeddings using BAAI/bge-small-en-v1.5 via SentenceTransformers.
    Implements a lazy-loaded singleton instance.
    """
    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingManager, cls).__new__(cls)
        return cls._instance

    def _get_model(self) -> SentenceTransformer:
        if self._model is None:
            model_name = settings.EMBEDDING_MODEL_NAME
            logger.info(f"Loading embedding model: '{model_name}'...")
            try:
                self._model = SentenceTransformer(model_name)
                logger.info(f"Embedding model '{model_name}' loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load embedding model '{model_name}': {str(e)}")
                raise EmbeddingError(f"Error initializing embedding model '{model_name}': {str(e)}")
        return self._model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embedding vectors for a list of document chunks.

        Args:
            texts: List of text strings.

        Returns:
            List of float vector embeddings.
        """
        if not texts:
            return []
        try:
            model = self._get_model()
            logger.info(f"Embeddings generating for {len(texts)} chunk(s)...")
            embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
            logger.info(f"Embeddings generated successfully. Vector dimension: {len(embeddings[0])}.")
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Failed to generate document embeddings: {str(e)}")
            raise EmbeddingError(f"Embedding generation error: {str(e)}")

    def embed_query(self, query: str) -> List[float]:
        """
        Generate an embedding vector for a user search query.

        Args:
            query: User query string.

        Returns:
            Float vector embedding.
        """
        if not query or not query.strip():
            raise EmbeddingError("Cannot embed an empty query.")
        try:
            model = self._get_model()
            embedding = model.encode(query, normalize_embeddings=True, show_progress_bar=False)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Failed to generate query embedding: {str(e)}")
            raise EmbeddingError(f"Query embedding error: {str(e)}")

# Global helper singleton
embedding_manager = EmbeddingManager()
