import sys
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.config import settings
from app.db.session import SessionLocal, init_db
from app.main import app
from app.models.course import Course
from app.models.lecture import Lecture, LectureSlide

client = TestClient(app)


def _unique_email(prefix: str) -> str:
    return f"{prefix}.{uuid.uuid4().hex[:8]}@example.edu"


@pytest.fixture(autouse=True)
def ensure_educator_code():
    init_db()
    with patch.object(settings, "EDUCATOR_ACCESS_CODE", "TEST-EDU-SECRET-2026"):
        yield


def test_register_and_login_role_separation():
    prof_email = _unique_email("prof")
    stud_email = _unique_email("stud")

    # 1. Wrong educator code must be rejected (no silent self-promotion)
    bad_prof = client.post(
        "/auth/register",
        json={
            "email": prof_email,
            "password": "Password123",
            "full_name": "Fake Prof",
            "requested_role": "professor",
            "educator_code": "WRONG-CODE",
        },
    )
    assert bad_prof.status_code == 403

    # 2. Valid educator code grants professor role + JWT
    prof_res = client.post(
        "/auth/register",
        json={
            "email": prof_email,
            "password": "Password123",
            "full_name": "Dr. Priya Nair",
            "requested_role": "professor",
            "educator_code": "TEST-EDU-SECRET-2026",
        },
    )
    assert prof_res.status_code == 201
    prof_data = prof_res.json()
    assert prof_data["user"]["role"] == "professor"
    prof_headers = {"Authorization": f"Bearer {prof_data['access_token']}"}

    # 3. Student self-signup gets strict student role
    stud_res = client.post(
        "/auth/register",
        json={
            "email": stud_email,
            "password": "Password123",
            "full_name": "Aarav Patel",
            "requested_role": "student",
        },
    )
    assert stud_res.status_code == 201
    stud_data = stud_res.json()
    assert stud_data["user"]["role"] == "student"
    stud_headers = {"Authorization": f"Bearer {stud_data['access_token']}"}

    # 4. /auth/me validates identity cleanly
    me_res = client.get("/auth/me", headers=stud_headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == stud_email
    assert me_res.json()["role"] == "student"

    # 5. Student cannot create courses (403)
    denied_create = client.post("/courses", json={"title": "Unauthorized Course"}, headers=stud_headers)
    assert denied_create.status_code == 403

    # 6. Login endpoint verifies password & blocks wrong password
    wrong_pw = client.post("/auth/login", json={"email": prof_email, "password": "BadPassword!"})
    assert wrong_pw.status_code == 401
    ok_login = client.post("/auth/login", json={"email": prof_email, "password": "Password123"})
    assert ok_login.status_code == 200
    assert ok_login.json()["user"]["role"] == "professor"

    # 7. Professor creates course, generates invite, creates draft + published lecture
    course_res = client.post(
        "/courses",
        json={"title": "Distributed Systems 401", "description": "Consensus & replication"},
        headers=prof_headers,
    )
    assert course_res.status_code == 201
    course_id = course_res.json()["id"]
    assert course_res.json()["my_role"] == "professor"

    invite_res = client.post(f"/courses/{course_id}/invites", headers=prof_headers)
    assert invite_res.status_code == 201
    invite_code = invite_res.json()["code"]
    assert invite_code.startswith("EF-")

    # Unenrolled student cannot read course
    assert client.get(f"/courses/{course_id}", headers=stud_headers).status_code == 403

    # Seed one draft lecture inside DB for that course
    with SessionLocal() as db:
        draft_lec = Lecture(course_id=course_id, title="Raft Consensus Draft", topic="Raft", status="draft")
        db.add(draft_lec)
        db.flush()
        db.add(LectureSlide(lecture_id=draft_lec.id, slide_number=1, title="Leader Election", content=["Term numbers"]))
        db.commit()
        lecture_id = draft_lec.id

    # Student joins via invite code
    join_res = client.post("/courses/join", json={"code": invite_code.lower()}, headers=stud_headers)
    assert join_res.status_code == 200
    assert join_res.json()["id"] == course_id
    assert join_res.json()["my_role"] == "student"

    # Draft lecture MUST be hidden from enrolled student
    stud_lecs = client.get(f"/courses/{course_id}/lectures", headers=stud_headers)
    assert stud_lecs.status_code == 200
    assert stud_lecs.json() == []
    assert client.get(f"/lectures/{lecture_id}", headers=stud_headers).status_code == 404

    # Professor sees draft & publishes it
    prof_lecs = client.get(f"/courses/{course_id}/lectures", headers=prof_headers)
    assert prof_lecs.status_code == 200
    assert len(prof_lecs.json()) == 1

    # Student cannot publish lecture (403)
    assert client.post(f"/lectures/{lecture_id}/publish", headers=stud_headers).status_code == 403

    pub_res = client.post(f"/lectures/{lecture_id}/publish", headers=prof_headers)
    assert pub_res.status_code == 200
    assert pub_res.json()["status"] == "published"

    # Now student CAN read published lecture
    assert len(client.get(f"/courses/{course_id}/lectures", headers=stud_headers).json()) == 1
    assert client.get(f"/lectures/{lecture_id}", headers=stud_headers).status_code == 200

    # Professor sees student in roster & can remove them
    roster = client.get(f"/courses/{course_id}/students", headers=prof_headers).json()
    assert len(roster) == 1
    assert roster[0]["email"] == stud_email

    # Clean up test course & test users
    assert client.delete(f"/courses/{course_id}", headers=prof_headers).status_code == 204
    with SessionLocal() as db:
        from app.models.auth import Profile
        db.query(Profile).filter(Profile.email.in_([prof_email, stud_email])).delete(synchronize_session=False)
        db.commit()
