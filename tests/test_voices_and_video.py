import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.elevenlabs_service import ElevenLabsService, CURATED_PROFESSOR_VOICES

client = TestClient(app)

def test_elevenlabs_service_duration_estimation():
    # Empty string should return minimum 3.0s
    assert ElevenLabsService.estimate_duration("") == 3.0
    # 20 words at ~2.16 wps -> ~9.3s
    words_20 = "word " * 20
    duration = ElevenLabsService.estimate_duration(words_20)
    assert 8.0 <= duration <= 11.0

def test_elevenlabs_available_voices():
    voices = ElevenLabsService.get_available_voices()
    assert isinstance(voices, list)
    assert len(voices) >= len(CURATED_PROFESSOR_VOICES)
    names = [v["name"] for v in voices]
    assert "Prof. George" in names
    assert "Prof. Rachel" in names

def test_voices_api_and_clone_flow():
    # 1. Register test professor
    prof_email = f"prof_{uuid.uuid4().hex[:6]}@eduforge.ai"
    reg_res = client.post(
        "/auth/register",
        json={
            "email": prof_email,
            "password": "Password123!",
            "full_name": "Prof Test Voice",
            "requested_role": "professor",
            "educator_code": "EDUFORGE-PROF-2026"
        }
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. List voices
    list_res = client.get("/voices", headers=headers)
    assert list_res.status_code == 200
    data = list_res.json()
    assert "elevenlabs_configured" in data
    assert "voices" in data
    assert len(data["voices"]) >= 6

    # 3. Validation on voice cloning endpoint
    # Missing parameters
    empty_clone = client.post("/voices/clone", headers=headers)
    assert empty_clone.status_code == 422
