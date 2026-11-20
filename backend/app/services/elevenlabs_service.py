import os
import json
import asyncio
import concurrent.futures
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import httpx
from fastapi import HTTPException, status
from app.config import settings

logger = logging.getLogger(__name__)

CURATED_PROFESSOR_VOICES: List[Dict[str, Any]] = [
    {
        "voice_id": "prof-brian-systems",
        "elevenlabs_id": "ErXwobaYiN019PkySvjV",
        "edge_voice": "en-US-BrianNeural",
        "name": "Prof. Brian",
        "category": "Neural Academic",
        "gender": "male",
        "accent": "American",
        "description": "Intellectual, authoritative, and deliberate computer science professor.",
    },
    {
        "voice_id": "prof-george-ryan",
        "elevenlabs_id": "JBFqnCBsd6RMkjVDRZzb",
        "edge_voice": "en-GB-RyanNeural",
        "name": "Prof. George",
        "category": "Neural Academic",
        "gender": "male",
        "accent": "British",
        "description": "Warm, intellectual, and resonant Oxford university orator.",
    },
    {
        "voice_id": "prof-rachel-emma",
        "elevenlabs_id": "21m00Tcm4TlvDq8ikWAM",
        "edge_voice": "en-US-EmmaNeural",
        "name": "Prof. Rachel",
        "category": "Neural Academic",
        "gender": "female",
        "accent": "American",
        "description": "Calm, articulate, and engaging pedagogical educator.",
    },
    {
        "voice_id": "prof-andrew-multilingual",
        "elevenlabs_id": "AZnzlk1XvdvUeBnXmlld",
        "edge_voice": "en-US-AndrewNeural",
        "name": "Prof. Andrew",
        "category": "Neural Academic",
        "gender": "male",
        "accent": "American",
        "description": "Conversational, engaging, and clear masterclass instructor.",
    },
    {
        "voice_id": "prof-christopher-narrative",
        "elevenlabs_id": "VR6AewLTigWG4xSOukaG",
        "edge_voice": "en-US-ChristopherNeural",
        "name": "Prof. Christopher",
        "category": "Neural Academic",
        "gender": "male",
        "accent": "American",
        "description": "Deep, narrative, and thought-provoking engineering lecturer.",
    },
    {
        "voice_id": "prof-ava-stem",
        "elevenlabs_id": "EXAVITQu4vr4xnSDxMaL",
        "edge_voice": "en-US-AvaNeural",
        "name": "Prof. Ava",
        "category": "Neural Academic",
        "gender": "female",
        "accent": "American",
        "description": "Expressive, structured, and warm STEM educator.",
    },
]

class ElevenLabsService:
    BASE_URL = "https://api.elevenlabs.io/v1"

    @classmethod
    def is_configured(cls) -> bool:
        return bool(settings.ELEVENLABS_API_KEY and settings.ELEVENLABS_API_KEY.strip())

    @classmethod
    def get_audio_storage_dir(cls, lecture_id: str) -> Path:
        dir_path = Path(settings.AUDIO_DIR) / "lectures" / str(lecture_id)
        dir_path.mkdir(parents=True, exist_ok=True)
        return dir_path

    @classmethod
    def get_available_voices(cls) -> List[Dict[str, Any]]:
        """
        Returns list of voices. If ElevenLabs API Key is present, fetches
        cloned and account voices from ElevenLabs API; otherwise returns curated presets.
        """
        voices = [{**v, "is_cloned": False} for v in CURATED_PROFESSOR_VOICES]

        if not cls.is_configured():
            return voices

        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.get(
                    f"{cls.BASE_URL}/voices",
                    headers={"xi-api-key": settings.ELEVENLABS_API_KEY}
                )
                if res.status_code == 200:
                    data = res.json()
                    raw_voices = data.get("voices", [])
                    custom_voices = []
                    for v in raw_voices:
                        category = v.get("category", "")
                        if category in ("cloned", "generated", "professional"):
                            custom_voices.append({
                                "voice_id": v.get("voice_id"),
                                "name": v.get("name"),
                                "category": "Cloned Professor",
                                "gender": v.get("labels", {}).get("gender", "neutral"),
                                "accent": v.get("labels", {}).get("accent", "custom"),
                                "description": v.get("description") or f"Custom cloned voice for {v.get('name')}",
                                "preview_url": v.get("preview_url"),
                                "is_cloned": True,
                            })
                    if custom_voices:
                        voices = custom_voices + voices
        except Exception as e:
            logger.warning(f"Could not retrieve dynamic ElevenLabs voices: {e}")

        return voices

    @classmethod
    def get_edge_voice_for_id(cls, voice_id: Optional[str]) -> str:
        """Map any selected voice id to the corresponding Microsoft Edge Neural Voice."""
        if not voice_id:
            return "en-US-BrianNeural"
        for v in CURATED_PROFESSOR_VOICES:
            if v["voice_id"] == voice_id or v.get("elevenlabs_id") == voice_id:
                return v.get("edge_voice", "en-US-BrianNeural")
        return "en-US-BrianNeural"

    @classmethod
    def clone_professor_voice(cls, professor_name: str, audio_bytes: bytes, filename: str) -> Dict[str, Any]:
        """
        Clones a professor's voice by uploading an audio sample to ElevenLabs Instant Voice Cloning.
        """
        if not cls.is_configured():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ElevenLabs API Key is not configured. Please set ELEVENLABS_API_KEY in backend/.env to clone custom voices."
            )

        content_type = "audio/mpeg"
        if filename.lower().endswith(".wav"):
            content_type = "audio/wav"
        elif filename.lower().endswith(".m4a"):
            content_type = "audio/m4a"

        try:
            with httpx.Client(timeout=60.0) as client:
                files = {
                    "files": (filename, audio_bytes, content_type)
                }
                data = {
                    "name": f"Prof. {professor_name}".strip(),
                    "description": f"Cloned voice for {professor_name} via EduForge AI Lecture Studio.",
                }
                res = client.post(
                    f"{cls.BASE_URL}/voices/add",
                    headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
                    data=data,
                    files=files
                )

                if res.status_code != 200:
                    err_detail = res.text
                    try:
                        err_detail = res.json().get("detail", {}).get("message", res.text)
                    except Exception:
                        pass
                    raise HTTPException(
                        status_code=res.status_code,
                        detail=f"ElevenLabs voice cloning failed: {err_detail}"
                    )

                result = res.json()
                voice_id = result.get("voice_id")
                return {
                    "voice_id": voice_id,
                    "name": f"Prof. {professor_name}".strip(),
                    "category": "Cloned Professor",
                    "status": "ready"
                }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error in clone_professor_voice: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal error connecting to ElevenLabs voice cloning: {str(e)}"
            )

    @classmethod
    def delete_voice(cls, voice_id: str) -> Dict[str, Any]:
        """
        Deletes a custom cloned voice from ElevenLabs and cleans up any local preview cache.
        """
        if not cls.is_configured():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ElevenLabs API Key is not configured."
            )

        # Disallow deleting curated presets
        for preset in CURATED_PROFESSOR_VOICES:
            if preset["voice_id"] == voice_id or preset.get("elevenlabs_id") == voice_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Curated academic presets cannot be deleted."
                )

        try:
            with httpx.Client(timeout=20.0) as client:
                res = client.delete(
                    f"{cls.BASE_URL}/voices/{voice_id}",
                    headers={"xi-api-key": settings.ELEVENLABS_API_KEY}
                )
                if res.status_code not in (200, 204):
                    err_detail = res.text
                    try:
                        err_detail = res.json().get("detail", {}).get("message", res.text)
                    except Exception:
                        pass
                    # If 404, voice is already deleted in ElevenLabs
                    if res.status_code != 404:
                        logger.warning(f"ElevenLabs voice delete returned status {res.status_code}: {err_detail}")
                        raise HTTPException(
                            status_code=res.status_code,
                            detail=f"ElevenLabs voice deletion failed: {err_detail}"
                        )

            # Clean up local preview cache if exists
            preview_dir = Path(settings.AUDIO_DIR) / "previews"
            clean_voice_id = voice_id.replace(" ", "_")[:64]
            preview_path = preview_dir / f"preview_{clean_voice_id}.mp3"
            if preview_path.exists():
                try:
                    preview_path.unlink()
                except Exception as e:
                    logger.warning(f"Failed deleting preview file: {e}")

            logger.info(f"Cloned voice '{voice_id}' deleted successfully from ElevenLabs.")
            return {
                "status": "success",
                "voice_id": voice_id,
                "message": "Cloned voice deleted successfully."
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error in delete_voice: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error deleting voice: {str(e)}"
            )

    @classmethod
    def _synthesize_with_edge_tts(cls, text: str, voice_name: str, out_path: Path) -> List[Dict[str, Any]]:
        """
        Asynchronously streams Edge Neural TTS, collects exact SentenceBoundary timing cues,
        and saves MP3 and cues to disk.
        """
        import edge_tts

        cues: List[Dict[str, Any]] = []

        async def _run():
            nonlocal cues
            comm = edge_tts.Communicate(text, voice_name)
            audio_data = []
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    audio_data.append(chunk["data"])
                elif chunk["type"] == "SentenceBoundary":
                    # offset & duration in 100-nanoseconds -> seconds
                    start_sec = round(chunk["offset"] / 10_000_000, 2)
                    dur_sec = round(chunk["duration"] / 10_000_000, 2)
                    cues.append({
                        "start": start_sec,
                        "end": round(start_sec + dur_sec, 2),
                        "text": chunk.get("text", "").strip()
                    })
            if audio_data:
                out_path.write_bytes(b"".join(audio_data))

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                pool.submit(asyncio.run, _run()).result()
        else:
            asyncio.run(_run())

        return cues

    @classmethod
    def synthesize_slide_audio(
        cls,
        lecture_id: str,
        slide_id: str,
        text: str,
        voice_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Synthesizes high-fidelity audio for a slide's comprehensive lecture narration.
        - Uses ElevenLabs when configured and active.
        - Uses Microsoft Edge Neural Speech (broadcast quality) when ElevenLabs key is unset.
        - Caches generated MP3 and exact sentence timing cues to disk for perfect subtitle sync.
        """
        clean_text = (text or "").strip()
        if not clean_text:
            return {
                "audio_url": None,
                "duration_seconds": 3.0,
                "source": "empty",
                "cues": [],
                "is_cached": True
            }

        effective_voice_id = voice_id or "prof-brian-systems"
        voice_tag = effective_voice_id.replace("prof-", "")[:8]

        storage_dir = cls.get_audio_storage_dir(lecture_id)
        audio_filename = f"slide_{slide_id}_{voice_tag}.mp3"
        audio_filepath = storage_dir / audio_filename
        subtitles_filepath = storage_dir / f"slide_{slide_id}_{voice_tag}.json"

        relative_audio_url = f"/lectures/{lecture_id}/slides/{slide_id}/audio?voice_id={effective_voice_id}"

        # 1. Check disk cache with existing subtitles
        if audio_filepath.exists() and audio_filepath.stat().st_size > 512 and subtitles_filepath.exists():
            try:
                cues = json.loads(subtitles_filepath.read_text(encoding="utf-8"))
                duration = cues[-1]["end"] if cues else cls.estimate_duration(clean_text)
                return {
                    "audio_url": relative_audio_url,
                    "duration_seconds": duration,
                    "cues": cues,
                    "source": "neural_speech",
                    "is_cached": True
                }
            except Exception as e:
                logger.warning(f"Failed reading cached subtitles json: {e}")

        # 2. If ElevenLabs is configured, try ElevenLabs first
        if cls.is_configured():
            eleven_id = effective_voice_id
            for v in CURATED_PROFESSOR_VOICES:
                if v["voice_id"] == effective_voice_id:
                    eleven_id = v.get("elevenlabs_id", effective_voice_id)
                    break

            try:
                with httpx.Client(timeout=45.0) as client:
                    res = client.post(
                        f"{cls.BASE_URL}/text-to-speech/{eleven_id}",
                        headers={
                            "xi-api-key": settings.ELEVENLABS_API_KEY,
                            "Content-Type": "application/json",
                            "Accept": "audio/mpeg"
                        },
                        json={
                            "text": clean_text,
                            "model_id": settings.ELEVENLABS_MODEL_ID or "eleven_turbo_v2_5",
                            "voice_settings": {
                                "stability": 0.5,
                                "similarity_boost": 0.75
                            }
                        }
                    )

                    if res.status_code == 200:
                        audio_filepath.write_bytes(res.content)
                        duration = cls.estimate_duration(clean_text)
                        return {
                            "audio_url": relative_audio_url,
                            "duration_seconds": duration,
                            "source": "elevenlabs",
                            "cues": [],
                            "is_cached": False
                        }
                    else:
                        logger.warning(f"ElevenLabs returned {res.status_code}, falling back to Edge Neural TTS: {res.text}")
            except Exception as e:
                logger.warning(f"ElevenLabs TTS failed: {e}; falling back to Edge Neural TTS")

        # 3. High-Fidelity Edge Neural Speech synthesis with exact sentence boundary timestamps
        edge_voice_name = cls.get_edge_voice_for_id(effective_voice_id)
        try:
            cues = cls._synthesize_with_edge_tts(clean_text, edge_voice_name, audio_filepath)
            try:
                subtitles_filepath.write_text(json.dumps(cues), encoding="utf-8")
            except Exception as e:
                logger.warning(f"Could not persist subtitles file: {e}")

            duration = cues[-1]["end"] if cues else cls.estimate_duration(clean_text)
            return {
                "audio_url": relative_audio_url,
                "duration_seconds": duration,
                "source": "neural_speech",
                "engine": "edge_neural",
                "voice": edge_voice_name,
                "cues": cues,
                "is_cached": False
            }
        except Exception as e:
            logger.error(f"Edge-TTS synthesis error: {e}")
            duration = cls.estimate_duration(clean_text)
            return {
                "audio_url": None,
                "duration_seconds": duration,
                "source": "error",
                "cues": [],
                "error": str(e)
            }

    @staticmethod
    def estimate_duration(text: str) -> float:
        """Estimate spoken duration based on natural lecture pace (~130 words per minute)."""
        words = len((text or "").split())
        if words == 0:
            return 3.0
        # ~2.16 words per second
        return max(4.0, round((words / 2.16), 1))
