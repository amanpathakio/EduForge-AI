from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field, ConfigDict

class CourseArchitectRequest(BaseModel):
    goal: str = Field(default="Map the course material into a teachable learning journey.", min_length=12, max_length=1000)

class AgentStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str; position: int; tool: str; title: str; status: str; detail: str | None = None; output: Any = None
    created_at: datetime; completed_at: datetime | None = None

class AgentRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str; course_id: str; agent_type: str; goal: str; status: str; result: Any = None; error: str | None = None
    created_at: datetime; completed_at: datetime | None = None; steps: list[AgentStepRead] = []
