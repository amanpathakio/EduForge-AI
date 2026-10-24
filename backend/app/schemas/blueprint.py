from datetime import datetime
from pydantic import BaseModel, ConfigDict

class CourseModuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str; position: int; title: str; objective: str; evidence_pages: list[int] = []; status: str

class CourseBlueprintRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str; course_id: str; agent_run_id: str | None = None; title: str; summary: str | None = None; status: str
    created_at: datetime; approved_at: datetime | None = None; modules: list[CourseModuleRead] = []
