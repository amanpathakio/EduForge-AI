import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from app.services.elevenlabs_service import ElevenLabsService
from app.auth import get_current_user
from app.models.auth import Profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voices", tags=["Voices"])

@router.get("", response_model=Dict[str, Any])
def list_voices(user: Profile = Depends(get_current_user)):
    """
    List available professor voices, including academic presets and any cloned voices.
    """
    is_configured = ElevenLabsService.is_configured()
    voices = ElevenLabsService.get_available_voices()
    return {
        "elevenlabs_configured": is_configured,
        "voices": voices
    }

@router.get("/{voice_id}/preview")
def get_voice_preview(voice_id: str):
    """
    Generate or stream an instant neural audio preview sample for a selected voice.
    Uses ElevenLabs with high speaker fidelity when configured, falling back to Edge TTS.
    """
    from fastapi.responses import FileResponse
    from pathlib import Path
    import httpx
    from app.config import settings

    preview_dir = Path(settings.AUDIO_DIR) / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    clean_voice_id = voice_id.replace(" ", "_")[:64]
    preview_path = preview_dir / f"preview_{clean_voice_id}.mp3"

    if not preview_path.exists() or preview_path.stat().st_size < 512:
        # Find voice name
        name = "Professor"
        for v in ElevenLabsService.get_available_voices():
            if v["voice_id"] == voice_id or v.get("elevenlabs_id") == voice_id:
                name = v["name"]
                break
        sample_text = f"Hello, I am {name}. Welcome to our academic studio. Today we will explore your course concepts with depth and rigorous clarity."

        # 1. Try ElevenLabs first if configured
        if ElevenLabsService.is_configured():
            eleven_id = voice_id
            for v in ElevenLabsService.get_available_voices():
                if v["voice_id"] == voice_id and v.get("elevenlabs_id"):
                    eleven_id = v["elevenlabs_id"]
                    break

            try:
                with httpx.Client(timeout=30.0) as client:
                    model = settings.ELEVENLABS_MODEL_ID or "eleven_multilingual_v2"
                    res = client.post(
                        f"{ElevenLabsService.BASE_URL}/text-to-speech/{eleven_id}",
                        headers={
                            "xi-api-key": settings.ELEVENLABS_API_KEY,
                            "Content-Type": "application/json",
                            "Accept": "audio/mpeg"
                        },
                        json={
                            "text": sample_text,
                            "model_id": model,
                            "voice_settings": {
                                "stability": 0.65,
                                "similarity_boost": 0.88,
                                "use_speaker_boost": True
                            }
                        }
                    )
                    if res.status_code == 200:
                        preview_path.write_bytes(res.content)
                        return FileResponse(
                            path=str(preview_path),
                            media_type="audio/mpeg",
                            filename=f"preview_{clean_voice_id}.mp3"
                        )
            except Exception as e:
                logger.warning(f"ElevenLabs preview generation failed: {e}; falling back to Edge TTS")

        # 2. Fallback to Microsoft Edge Neural TTS
        edge_voice = ElevenLabsService.get_edge_voice_for_id(voice_id)
        ElevenLabsService._synthesize_with_edge_tts(sample_text, edge_voice, preview_path)

    return FileResponse(
        path=str(preview_path),
        media_type="audio/mpeg",
        filename=f"preview_{clean_voice_id}.mp3"
    )

@router.post("/clone", status_code=status.HTTP_201_CREATED)
async def clone_professor_voice(
    professor_name: str = Form(...),
    file: UploadFile = File(...),
    user: Profile = Depends(get_current_user)
):
    """
    Upload an audio sample to clone a professor's voice using ElevenLabs Instant Voice Cloning.
    """
    if not professor_name or not professor_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Professor name is required for voice cloning."
        )

    # Validate audio file extension
    valid_extensions = (".mp3", ".wav", ".m4a", ".aac", ".ogg")
    filename = file.filename or "sample.mp3"
    if not any(filename.lower().endswith(ext) for ext in valid_extensions):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid audio format. Supported formats: {', '.join(valid_extensions)}"
        )

    # Read audio bytes (max 15MB)
    audio_bytes = await file.read()
    if len(audio_bytes) > 15 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio sample exceeds 15MB limit. Please upload a 1-3 minute sample."
        )

    if len(audio_bytes) < 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is too small or empty."
        )

    return ElevenLabsService.clone_professor_voice(
        professor_name=professor_name.strip(),
        audio_bytes=audio_bytes,
        filename=filename
    )
