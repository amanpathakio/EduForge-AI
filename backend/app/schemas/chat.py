from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class CourseChatRequest(BaseModel):
    message: Optional[str] = Field(default=None, description="User query / prompt")
    question: Optional[str] = Field(default=None, description="User query alias")
    top_k: Optional[int] = Field(default=None, description="Number of context chunks to retrieve")

    def get_query(self) -> str:
        q = (self.message or self.question or "").strip()
        return q

class ChatResponse(BaseModel):
    question: str
    answer: str
    sources: List[str]
    retrieved_chunks: List[Dict[str, Any]]
