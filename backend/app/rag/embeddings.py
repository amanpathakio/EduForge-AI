import logging
from typing import List, Any
from app.config import settings

logger = logging.getLogger(__name__)

class EmbeddingError(Exception):
    """Custom exception raised during embedding generation."""
    pass

class EmbeddingManager:
    """
    Manages vector embeddings using Gemini API (models/gemini-embedding-001) with
    SentenceTransformers fallback. Using Gemini avoids 512MB RAM OOM crashes on free cloud hosting.
    """
    _instance = None
    _model = None
    _use_gemini = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingManager, cls).__new__(cls)
        return cls._instance

    def _should_use_gemini(self) -> bool:
        if self._use_gemini is None:
            key = (settings.GEMINI_API_KEY or "").strip()
            self._use_gemini = bool(key and key != "your_gemini_api_key_here")
        return self._use_gemini

    def _embed_with_gemini(self, content: Any, task_type: str):
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        response = genai.embed_content(
            model="models/gemini-embedding-001",
            content=content,
            task_type=task_type,
        )
        return response["embedding"]

    def _get_local_model(self) -> Any:
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            model_name = settings.EMBEDDING_MODEL_NAME
            logger.info(f"Loading embedding model: '{model_name}'...")
            try:
                try:
                    self._model = SentenceTransformer(model_name, local_files_only=True)
                except Exception:
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

        if self._should_use_gemini():
            try:
                logger.info(f"Generating Gemini embeddings for {len(texts)} chunk(s)...")
                results = []
                batch_size = 50
                for i in range(0, len(texts), batch_size):
                    batch = texts[i:i + batch_size]
                    emb = self._embed_with_gemini(batch, task_type="retrieval_document")
                    results.extend(emb)
                logger.info(f"Gemini embeddings generated successfully. Count: {len(results)}, Dim: {len(results[0])}.")
                return results
            except Exception as e:
                logger.warning(f"Gemini embedding failed ({str(e)}), falling back to local SentenceTransformers...")

        try:
            model = self._get_local_model()
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

        if self._should_use_gemini():
            try:
                emb = self._embed_with_gemini(query, task_type="retrieval_query")
                return emb
            except Exception as e:
                logger.warning(f"Gemini query embedding failed ({str(e)}), falling back to local SentenceTransformers...")

        try:
            model = self._get_local_model()
            embedding = model.encode(query, normalize_embeddings=True, show_progress_bar=False)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Failed to generate query embedding: {str(e)}")
            raise EmbeddingError(f"Query embedding error: {str(e)}")

# Global helper singleton
embedding_manager = EmbeddingManager()
