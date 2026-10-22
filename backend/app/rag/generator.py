import logging
from typing import List, Dict, Any, Tuple
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are EduForge's course-grounded AI tutor.
Answer the user's question using ONLY the provided context.
If the context does not contain enough information to answer the question, explicitly say that the answer is not available in the uploaded course material.
Do not invent facts or rely on unsupported information."""

class GenerationError(Exception):
    """Custom exception raised during LLM generation."""
    pass

def generate_grounded_answer(
    question: str,
    retrieved_chunks: List[Dict[str, Any]]
) -> Tuple[str, List[Dict[str, Any]], List[str]]:
    """
    Generate a grounded course tutor answer using Google Gemini API based ONLY on retrieved chunks.

    Args:
        question: User query string.
        retrieved_chunks: List of chunk dictionaries retrieved from ChromaDB.

    Returns:
        Tuple of (formatted_answer_string, retrieved_chunks, list_of_source_strings).
    """
    # Build unique source citations list from metadata
    sources_set = set()
    sources_list = []
    
    for chunk in retrieved_chunks:
        meta = chunk.get("metadata", {})
        filename = meta.get("source_filename", "Unknown Document")
        page = meta.get("page_number", "?")
        source_str = f"{filename} — Page {page}"
        if source_str not in sources_set:
            sources_set.add(source_str)
            sources_list.append(source_str)

    # Handle case where no relevant chunks are found
    if not retrieved_chunks:
        fallback_msg = (
            "I could not find any relevant information in the uploaded course material to answer your question.\n\n"
            "Sources:\nNone"
        )
        logger.info("No context available to generate response. Returning default grounded fallback.")
        return fallback_msg, [], []

    # Format context for Gemini
    context_blocks = []
    for idx, chunk in enumerate(retrieved_chunks, 1):
        meta = chunk.get("metadata", {})
        source_name = meta.get("source_filename", "Document")
        page_num = meta.get("page_number", "Unknown")
        context_blocks.append(
            f"--- CONTEXT BLOCK {idx} [Source: {source_name}, Page: {page_num}] ---\n"
            f"{chunk['text'].strip()}\n"
        )

    full_context = "\n".join(context_blocks)

    user_prompt = f"{SYSTEM_PROMPT}\n\n" \
                  f"Provided Course Context:\n{full_context}\n\n" \
                  f"User Question: {question}\n\n" \
                  f"Detailed Grounded Answer:"

    api_key = settings.GEMINI_API_KEY
    if not api_key or api_key == "your_gemini_api_key_here":
        err_msg = (
            "Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env to enable LLM generation."
        )
        logger.warning(err_msg)
        raise GenerationError(err_msg)

    try:
        genai.configure(api_key=api_key)
        
        # Try available Gemini models in order of preference
        model_names = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-pro"]
        raw_answer = None
        last_error = None

        for model_name in model_names:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(user_prompt)
                if response and response.text:
                    raw_answer = response.text.strip()
                    logger.info(f"Gemini response generated successfully using model '{model_name}'.")
                    break
            except Exception as e:
                logger.warning(f"Failed to generate answer with model '{model_name}': {str(e)}")
                last_error = e

        if not raw_answer:
            raise GenerationError(f"Gemini API generation failed for all attempted models: {str(last_error)}")

        # Append source citation section if not already present in response text
        sources_formatted = "\n".join([f"- {src}" for src in sources_list])
        final_answer = f"{raw_answer}\n\nSources:\n{sources_formatted}"

        return final_answer, retrieved_chunks, sources_list

    except Exception as e:
        if isinstance(e, GenerationError):
            raise e
        logger.error(f"Error during Gemini generation: {str(e)}")
        raise GenerationError(f"Gemini LLM error: {str(e)}")
