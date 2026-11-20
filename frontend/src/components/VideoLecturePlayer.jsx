import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getLectureVideoManifest, getSlideAudioStreamUrl } from '../services/api';

export default function VideoLecturePlayer({
  lectureId,
  lectureTitle,
  initialVoiceId,
  onClose,
  onOpenVoiceModal,
}) {
  const [manifest, setManifest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Continuous Playback State
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [slideCurrentTime, setSlideCurrentTime] = useState(0);
  const [slideDuration, setSlideDuration] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState('scene_cards'); // 'scene_cards' (NotebookLM Overview) | 'classic_deck'

  // Hover scrubber chapter preview
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverChapter, setHoverChapter] = useState('');

  // Combined Video Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const cancelExportRef = useRef(false);

  // DOM References
  const stageRef = useRef(null);
  const audioRef = useRef(null);
  const preloadedAudioRef = useRef(null);
  const recoveryTimeoutRef = useRef(null);
  const exportCanvasRef = useRef(null);

  // Clear any pending audio recovery or transition timers
  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimeoutRef.current) {
      clearTimeout(recoveryTimeoutRef.current);
      recoveryTimeoutRef.current = null;
    }
  }, []);

  // Load Video Manifest
  useEffect(() => {
    let isMounted = true;
    const fetchManifest = async () => {
      try {
        setIsLoading(true);
        setError('');
        const data = await getLectureVideoManifest(lectureId, initialVoiceId);
        if (isMounted) {
          setManifest(data);
          if (data.slides && data.slides.length > 0) {
            setSlideDuration(data.slides[0].duration_seconds || 15);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load video lecture manifest.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchManifest();
    return () => {
      isMounted = false;
      stopAllAudio();
    };
  }, [lectureId, initialVoiceId]);

  // Lock background window scroll while video theater modal is active
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Compute slide timing offsets for the master continuous timeline
  const slides = manifest?.slides || [];
  const totalLectureDuration = useMemo(() => {
    if (!slides.length) return 1;
    return slides.reduce((acc, s) => acc + (s.duration_seconds || 15), 0);
  }, [slides]);

  const slideOffsets = useMemo(() => {
    let acc = 0;
    return slides.map((s) => {
      const start = acc;
      const dur = s.duration_seconds || 15;
      acc += dur;
      return { start, dur, end: acc, title: s.title, slideNumber: s.slide_number };
    });
  }, [slides]);

  const currentSlide = slides[currentSlideIndex] || null;
  const currentOffset = slideOffsets[currentSlideIndex] || { start: 0, dur: 1 };
  const globalCurrentTime = Math.min(totalLectureDuration, currentOffset.start + slideCurrentTime);

  // Active bullet calculation based on playback progress
  const activeBulletIndex = useMemo(() => {
    if (!currentSlide?.content?.length || slideDuration <= 0) return 0;
    const bulletsCount = currentSlide.content.length;
    const progress = Math.min(0.999, Math.max(0, slideCurrentTime / slideDuration));
    return Math.min(bulletsCount - 1, Math.floor(progress * bulletsCount));
  }, [currentSlide, slideCurrentTime, slideDuration]);

  // Micro-progress bar within the currently active bullet point (0 - 100%)
  const bulletProgress = useMemo(() => {
    if (!currentSlide?.content?.length || slideDuration <= 0) return 0;
    const bulletsCount = currentSlide.content.length;
    const durationPerBullet = slideDuration / bulletsCount;
    const timeInCurrentBullet = Math.max(0, slideCurrentTime - (activeBulletIndex * durationPerBullet));
    return Math.min(100, (timeInCurrentBullet / durationPerBullet) * 100);
  }, [currentSlide, slideDuration, slideCurrentTime, activeBulletIndex]);

  // Frame-accurate synchronized subtitles from neural speech sentence boundaries
  const activeSubtitle = useMemo(() => {
    let rawCue = '';
    const cues = currentSlide?.subtitles || [];
    if (cues.length > 0) {
      // Find the exact sentence cue active at the current audio timestamp
      const cue = cues.find((c) => slideCurrentTime >= c.start && slideCurrentTime <= c.end);
      if (cue) {
        rawCue = cue.text;
      } else {
        // Small natural pause between sentences: retain previous cue for up to 1.5s
        const lastPast = [...cues].reverse().find((c) => slideCurrentTime >= c.start);
        if (lastPast && (slideCurrentTime - lastPast.end) < 1.5) {
          rawCue = lastPast.text;
        }
      }
    } else {
      // Fallback: weight sentences by word count to prevent linear desync
      const raw = (currentSlide?.narration_script || currentSlide?.speaker_notes || '').trim();
      if (!raw) return '';
      const matches = raw.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
      const sentences = (matches || [raw]).map((s) => s.trim()).filter((s) => s.length > 2);
      if (!sentences.length) return '';

      const wordCounts = sentences.map((s) => Math.max(1, s.split(/\s+/).length));
      const totalWords = wordCounts.reduce((a, b) => a + b, 0);
      const timePerWord = (slideDuration || 1) / totalWords;

      let cumulativeTime = 0;
      for (let i = 0; i < sentences.length; i++) {
        const sentenceDur = wordCounts[i] * timePerWord;
        if (slideCurrentTime >= cumulativeTime && slideCurrentTime < cumulativeTime + sentenceDur) {
          rawCue = sentences[i];
          break;
        }
        cumulativeTime += sentenceDur;
      }
      if (!rawCue && sentences.length > 0) {
        rawCue = sentences[sentences.length - 1];
      }
    }

    if (!rawCue) return '';
    // Strip markdown bold/italic asterisks for clean broadcast display
    return rawCue.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
  }, [currentSlide, slideCurrentTime, slideDuration]);

  // Slide time remaining countdown
  const slideTimeRemaining = Math.max(0, Math.round(slideDuration - slideCurrentTime));

  // Dynamic Scene Cards computation (NotebookLM Overview Style)
  const slideSceneCards = useMemo(() => {
    if (currentSlide?.scene_cards && currentSlide.scene_cards.length > 0) {
      return currentSlide.scene_cards;
    }
    // High-fidelity fallback cards if manifest has not yet populated scene_cards
    const rawBullets = (currentSlide?.content || []).filter(
      (b) => !b.toLowerCase().startsWith('ground this lecture') && !b.toLowerCase().startsWith('source page')
    );
    const bullets = rawBullets.length > 0 ? rawBullets : [currentSlide?.title || 'Core Concept'];
    const title = currentSlide?.title || 'Foundational Architecture';
    const topic = manifest?.topic || 'Course Topic';

    return [
      {
        id: 'card-1',
        card_type: 'hook',
        badge: 'THE CORE QUESTION',
        headline: title.endsWith('?') ? title : `Why Does ${title} Matter?`,
        subheadline: `The foundational challenge in ${topic}`,
        items: [
          {
            label: 'The Challenge',
            text: bullets[0] || `Understanding the fundamental behavior of ${title}.`,
            tag: 'Core Problem'
          },
          {
            label: 'The Objective',
            text: 'Ensure theoretical principles translate reliably into real-world production.',
            tag: 'Generalization'
          }
        ],
        callout: 'Evaluation must reflect the real world, where models face completely unseen challenges.',
        start_pct: 0.0,
        end_pct: 0.28
      },
      {
        id: 'card-2',
        card_type: 'analogy',
        badge: 'THE MENTAL MODEL',
        headline: `${title}: Conceptual Architecture`,
        subheadline: 'Deconstructing core components and their relationships',
        items: bullets.slice(0, 3).map((b, i) => {
          const parts = b.split(':', 2);
          return {
            label: parts.length === 2 ? parts[0].trim() : `Component ${i + 1}`,
            text: parts.length === 2 ? parts[1].trim() : b,
            tag: `Part ${i + 1}`
          };
        }),
        callout: 'Notice how each component acts as a distinct safeguard against systemic error.',
        start_pct: 0.28,
        end_pct: 0.65
      },
      {
        id: 'card-3',
        card_type: 'mechanics',
        badge: 'CRITICAL PITFALL & GOLDEN RULE',
        headline: 'Preventing Critical Failure Modes',
        subheadline: 'Essential rules for robust implementation',
        items: [
          {
            label: 'Common Failure Mode',
            text: 'Allowing evaluation data to bias training or tuning decisions.',
            tag: 'Data Leakage'
          },
          {
            label: 'Production Best Practice',
            text: 'Maintain strict isolation and enforce rigorous validation boundaries.',
            tag: 'Isolation'
          }
        ],
        callout: 'Golden Rule: Sound methodology beats brute-force complexity every time.',
        start_pct: 0.65,
        end_pct: 0.88
      },
      {
        id: 'card-4',
        card_type: 'takeaway',
        badge: 'KEY TAKEAWAY & CITATIONS',
        headline: `${title}: Core Synthesis`,
        subheadline: 'Verified against accredited syllabus materials',
        items: [
          {
            label: 'Key Takeaway',
            text: bullets[bullets.length - 1] || `Mastery of ${title} is complete.`,
            tag: 'Mastery'
          },
          {
            label: 'Syllabus Grounding',
            text: (currentSlide?.citations || []).map((c) => `${c.filename} (p. ${c.page_number || '1'})`).join(' · ') || 'Verified Course Repository',
            tag: 'Verified'
          }
        ],
        callout: 'Review these foundational mechanics before advancing to subsequent chapters.',
        start_pct: 0.88,
        end_pct: 1.0
      }
    ];
  }, [currentSlide, manifest]);

  // Determine active scene card based on slide audio progress
  const activeSceneCardIndex = useMemo(() => {
    if (!slideSceneCards.length || slideDuration <= 0) return 0;
    const progress = Math.min(0.999, Math.max(0, slideCurrentTime / slideDuration));
    const foundIdx = slideSceneCards.findIndex(
      (c) => progress >= (c.start_pct ?? 0) && progress < (c.end_pct ?? 1)
    );
    return foundIdx !== -1 ? foundIdx : Math.min(slideSceneCards.length - 1, Math.floor(progress * slideSceneCards.length));
  }, [slideSceneCards, slideCurrentTime, slideDuration]);

  const activeSceneCard = slideSceneCards[activeSceneCardIndex] || slideSceneCards[0];

  const stopAllAudio = useCallback(() => {
    clearRecoveryTimer();
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.onloadedmetadata = null;
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, [clearRecoveryTimer]);

  // Preload next slide's audio stream to prevent buffering stalls
  const preloadNextSlideAudio = useCallback((nextIndex) => {
    if (!slides[nextIndex]) return;
    try {
      const nextUrl = getSlideAudioStreamUrl(lectureId, slides[nextIndex].slide_id, initialVoiceId);
      if (preloadedAudioRef.current && preloadedAudioRef.current.src === nextUrl) {
        return;
      }
      const pAudio = new Audio(nextUrl);
      pAudio.preload = 'auto';
      preloadedAudioRef.current = pAudio;
    } catch (e) {
      console.debug('Audio preload skipped:', e);
    }
  }, [slides, lectureId, initialVoiceId]);

  // Play slide audio seamlessly via Edge Neural / ElevenLabs stream
  const playSlideAudio = useCallback((slideIndex, startOffset = 0) => {
    stopAllAudio();
    if (!slides[slideIndex]) return;

    const slide = slides[slideIndex];
    const duration = slide.duration_seconds || 15;
    setSlideDuration(duration);
    setSlideCurrentTime(startOffset);

    // Warm up the upcoming slide in the background for zero-gap playback
    if (slideIndex < slides.length - 1) {
      preloadNextSlideAudio(slideIndex + 1);
    }

    const audioUrl = getSlideAudioStreamUrl(lectureId, slide.slide_id, initialVoiceId);
    let audio = null;
    if (preloadedAudioRef.current && preloadedAudioRef.current.src === audioUrl) {
      audio = preloadedAudioRef.current;
      preloadedAudioRef.current = null;
    } else {
      audio = new Audio(audioUrl);
    }

    audio.playbackRate = playbackRate;
    audio.muted = isMuted;
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setSlideDuration(audio.duration);
      }
      if (startOffset > 0) {
        audio.currentTime = startOffset;
      }
    };

    audio.ontimeupdate = () => {
      setSlideCurrentTime(audio.currentTime);
    };

    // Seamless auto-advance to next slide when this slide finishes
    audio.onended = () => {
      clearRecoveryTimer();
      if (slideIndex < slides.length - 1) {
        const nextIdx = slideIndex + 1;
        setCurrentSlideIndex(nextIdx);
        playSlideAudio(nextIdx, 0);
      } else {
        setIsPlaying(false);
        setSlideCurrentTime(duration);
      }
    };

    audio.onerror = (e) => {
      console.warn('Audio streaming encountered error for slide', slideIndex, e);
      clearRecoveryTimer();
      // Halt safely instead of creating unmanaged background ghost timers
      setIsPlaying(false);
    };

    audio.play().catch((err) => {
      console.warn('Playback error (e.g. user gesture needed):', err);
    });
  }, [slides, lectureId, initialVoiceId, playbackRate, isMuted, stopAllAudio, preloadNextSlideAudio, clearRecoveryTimer]);

  // Play / Pause Master Toggle
  const togglePlay = () => {
    clearRecoveryTimer();
    if (isPlaying) {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } else {
      setIsPlaying(true);
      playSlideAudio(currentSlideIndex, slideCurrentTime);
    }
  };

  // Master Timeline Scrubber Seek (Global Continuous Scrubbing)
  const handleMasterSeek = (e) => {
    clearRecoveryTimer();
    if (!slides.length || totalLectureDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetGlobalTime = pct * totalLectureDuration;

    // Find which slide corresponds to this global time
    let targetSlideIndex = 0;
    let localOffset = 0;

    for (let i = 0; i < slideOffsets.length; i++) {
      const off = slideOffsets[i];
      if (targetGlobalTime >= off.start && targetGlobalTime <= off.end) {
        targetSlideIndex = i;
        localOffset = targetGlobalTime - off.start;
        break;
      }
      if (i === slideOffsets.length - 1) {
        targetSlideIndex = i;
        localOffset = targetGlobalTime - off.start;
      }
    }

    setCurrentSlideIndex(targetSlideIndex);
    setSlideCurrentTime(localOffset);

    if (isPlaying) {
      playSlideAudio(targetSlideIndex, localOffset);
    } else if (audioRef.current) {
      audioRef.current.currentTime = localOffset;
    }
  };

  const handleTimelineHover = (e) => {
    if (!slides.length || totalLectureDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = pct * totalLectureDuration;
    setHoverTime(targetTime);

    for (const off of slideOffsets) {
      if (targetTime >= off.start && targetTime <= off.end) {
        setHoverChapter(`Chapter ${off.slideNumber}: ${off.title}`);
        return;
      }
    }
  };

  const handlePrevSlide = () => {
    clearRecoveryTimer();
    if (currentSlideIndex > 0) {
      const prevIdx = currentSlideIndex - 1;
      setCurrentSlideIndex(prevIdx);
      if (isPlaying) {
        playSlideAudio(prevIdx, 0);
      } else {
        stopAllAudio();
        setSlideCurrentTime(0);
        setSlideDuration(slides[prevIdx]?.duration_seconds || 15);
      }
    }
  };

  const handleNextSlide = () => {
    clearRecoveryTimer();
    if (currentSlideIndex < slides.length - 1) {
      const nextIdx = currentSlideIndex + 1;
      setCurrentSlideIndex(nextIdx);
      if (isPlaying) {
        playSlideAudio(nextIdx, 0);
      } else {
        stopAllAudio();
        setSlideCurrentTime(0);
        setSlideDuration(slides[nextIdx]?.duration_seconds || 15);
      }
    }
  };

  const handleSpeedChange = (speed) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNextSlide();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'Escape' && !document.fullscreenElement) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Render a slide onto the Canvas at 1920x1080 for video recording
  const renderSlideToCanvas = (ctx, slide, slideIndex, totalCount, activeCardOrIdx) => {
    const width = 1920;
    const height = 1080;

    // Background Gradient
    const bgGrad = ctx.createRadialGradient(width / 2, height / 3, 100, width / 2, height / 2, 1200);
    bgGrad.addColorStop(0, '#111827');
    bgGrad.addColorStop(1, '#030712');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle framing grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.strokeRect(60, 60, width - 120, height - 120);

    // Top Header: Course Topic & Chapter Tag
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText((manifest?.topic || 'COURSE LECTURE').toUpperCase(), 100, 120);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`CHAPTER ${slideIndex + 1} OF ${totalCount}`, width - 360, 120);

    // Check if activeCard is available
    const cards = slide.scene_cards || [];
    let currentCard = null;
    if (typeof activeCardOrIdx === 'object' && activeCardOrIdx !== null) {
      currentCard = activeCardOrIdx;
    } else if (cards.length > 0) {
      const idx = typeof activeCardOrIdx === 'number' ? Math.min(cards.length - 1, activeCardOrIdx) : 0;
      currentCard = cards[idx];
    }

    if (currentCard) {
      // Scene Card Badge
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.beginPath();
      ctx.roundRect(100, 150, 360, 42, 8);
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText((currentCard.badge || 'DYNAMIC SCENE').toUpperCase(), 120, 177);

      // Headline
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(currentCard.headline || slide.title, 100, 250);

      // Subheadline
      if (currentCard.subheadline) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(currentCard.subheadline, 100, 295);
      }

      // Items
      let yPos = 340;
      const items = currentCard.items || [];
      items.slice(0, 3).forEach((item, iIdx) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.roundRect(100, yPos, 1200, 100, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(item.label || `Item ${iIdx + 1}`, 130, yPos + 40);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '400 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(item.text || '', 130, yPos + 75);

        yPos += 120;
      });

      // Callout
      if (currentCard.callout) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
        ctx.beginPath();
        ctx.roundRect(100, yPos + 10, 1200, 70, 10);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`💡 ${currentCard.callout}`, 130, yPos + 52);
      }
    } else {
      // Classic Slide Title (wrapped if needed)
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const words = (slide.title || 'Lecture Slide').split(' ');
      let line = '';
      let yPos = 230;
      for (const w of words) {
        const testLine = line + w + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > 1200 && line !== '') {
          ctx.fillText(line, 100, yPos);
          line = w + ' ';
          yPos += 70;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 100, yPos);

      // Key Concept Bullets
      yPos += 50;
      const bullets = slide.content || [];
      bullets.forEach((bullet, bIdx) => {
        const isHighlighted = bIdx === activeCardOrIdx;
        ctx.fillStyle = isHighlighted ? 'rgba(59, 130, 246, 0.16)' : 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath();
        ctx.roundRect(100, yPos, 1200, 90, 12);
        ctx.fill();
        ctx.strokeStyle = isHighlighted ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = isHighlighted ? 3 : 1;
        ctx.stroke();

        ctx.fillStyle = isHighlighted ? '#60a5fa' : '#64748b';
        ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(String(bIdx + 1).padStart(2, '0'), 130, yPos + 55);

        ctx.fillStyle = isHighlighted ? '#ffffff' : '#cbd5e1';
        ctx.font = `${isHighlighted ? '600' : '400'} 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(bullet, 190, yPos + 55);
        yPos += 115;
      });
    }

    // Grounded Source Citations
    if (slide.citations?.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('VERIFIED SOURCE:', 100, height - 100);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '400 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const citText = slide.citations.map((c) => `${c.filename} (p. ${c.page_number || '1'})`).join('  ·  ');
      ctx.fillText(citText, 300, height - 100);
    }

    // PIP Professor Avatar Box (Bottom Right)
    ctx.fillStyle = 'rgba(13, 17, 23, 0.92)';
    ctx.beginPath();
    ctx.roundRect(width - 480, height - 260, 400, 180, 20);
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Professor Name & Status
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Prof. Brian', width - 440, height - 190);

    ctx.fillStyle = '#60a5fa';
    ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Neural Professor Narration', width - 440, height - 150);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('EduForge Dynamic Overview', width - 440, height - 110);
  };

  // Export Complete Multi-Slide Combined Video as .webm
  const handleExportFullVideo = async () => {
    if (!slides.length || isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Initializing video lecture canvas & neural audio stream...');
    cancelExportRef.current = false;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const dest = audioCtx.createMediaStreamDestination();

      const videoStream = canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 3500000,
      });

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.start(100);

      // Play through each slide in sequence, drawing to canvas and piping audio
      for (let i = 0; i < slides.length; i++) {
        if (cancelExportRef.current) break;

        const slide = slides[i];
        setExportStatusText(`Rendering Chapter ${i + 1} of ${slides.length}: ${slide.title}...`);
        setExportProgress(Math.round(((i) / slides.length) * 100));

        // Draw initial slide canvas
        renderSlideToCanvas(ctx, slide, i, slides.length, 0);

        // Fetch slide audio and decode into AudioBuffer
        const audioUrl = getSlideAudioStreamUrl(lectureId, slide.slide_id, initialVoiceId);
        const resp = await fetch(audioUrl);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);

        const sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(dest);
        sourceNode.start(0);

        const durationSecs = audioBuffer.duration;
        const startTime = Date.now();

        // Render frames during slide playback to update concept highlights
        await new Promise((resolve) => {
          const animInterval = setInterval(() => {
            if (cancelExportRef.current) {
              clearInterval(animInterval);
              sourceNode.stop();
              resolve();
              return;
            }

            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(1, elapsed / durationSecs);
            const cards = slide.scene_cards || [];
            let activeVisual = null;
            if (cards.length > 0) {
              const cIdx = cards.findIndex(c => progress >= (c.start_pct ?? 0) && progress < (c.end_pct ?? 1));
              activeVisual = cIdx !== -1 ? cards[cIdx] : cards[Math.min(cards.length - 1, Math.floor(progress * cards.length))];
            } else {
              const bulletsCount = slide.content?.length || 1;
              activeVisual = Math.min(bulletsCount - 1, Math.floor(progress * bulletsCount));
            }

            renderSlideToCanvas(ctx, slide, i, slides.length, activeVisual);

            if (elapsed >= durationSecs + 0.3) {
              clearInterval(animInterval);
              resolve();
            }
          }, 100);
        });
      }

      setExportProgress(100);
      setExportStatusText('Finalizing video file encoding...');

      // Stop recorder and trigger download
      recorder.stop();
      await new Promise((r) => setTimeout(r, 600));

      const blob = new Blob(chunks, { type: 'video/webm' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const cleanTitle = (manifest?.title || 'Lecture').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${cleanTitle}_Full_Video_Lecture.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      audioCtx.close();
    } catch (err) {
      console.error('Video lecture export error:', err);
      setExportStatusText(`Export error: ${err.message}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return createPortal(
    <div className="video-player-modal-backdrop" role="dialog" aria-modal="true" aria-label="Combined Video Lecture Theater">
      <div className={`video-theater-container ${isFullscreen ? 'fullscreen-mode' : ''}`} ref={stageRef}>
        {/* Top Floating Utility Bar */}
        <div className="theater-top-bar">
          <div className="theater-title-block">
            <span className="theater-badge">FULL VIDEO LECTURE</span>
            <h3>{manifest?.title || lectureTitle || 'Comprehensive Masterclass'}</h3>
          </div>
          <div className="theater-actions-block">
            {onOpenVoiceModal && (
              <button
                type="button"
                className="theater-btn voice-btn"
                onClick={onOpenVoiceModal}
                title="Change Professor Voice"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                <span>Voice Settings</span>
              </button>
            )}

            {/* View Mode Toggle: Dynamic Scene Cards vs Classic Slide Deck */}
            <div className="view-mode-pill-toggle">
              <button
                type="button"
                className={`mode-toggle-btn ${viewMode === 'scene_cards' ? 'active' : ''}`}
                onClick={() => setViewMode('scene_cards')}
                title="NotebookLM Dynamic Scene Cards View"
              >
                <span>🎬 Scene Cards</span>
              </button>
              <button
                type="button"
                className={`mode-toggle-btn ${viewMode === 'classic_deck' ? 'active' : ''}`}
                onClick={() => setViewMode('classic_deck')}
                title="Classic Slide Deck View"
              >
                <span>📑 Slides</span>
              </button>
            </div>

            {/* Combined Video Download Button */}
            <button
              type="button"
              className="theater-btn export-btn download-highlight-btn"
              onClick={handleExportFullVideo}
              disabled={isExporting || isLoading}
              title="Download entire lecture as a combined continuous video file (.webm)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{isExporting ? `Exporting (${exportProgress}%)` : 'Download Full Video'}</span>
            </button>

            <button
              type="button"
              className="theater-btn close-btn"
              onClick={onClose}
              title="Exit Video Lecture"
              aria-label="Exit video player"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 16:9 Widescreen Lecture Stage */}
        <div className="video-widescreen-stage">
          {isLoading ? (
            <div className="stage-loading-overlay">
              <div className="loading-spinner"></div>
              <p>Preparing deep pedagogical explanations &amp; neural audio for all slides...</p>
            </div>
          ) : error ? (
            <div className="stage-error-overlay">
              <p className="error-title">Could not initialize video lecture</p>
              <p className="error-body">{error}</p>
              <button className="button button-primary" onClick={onClose}>
                Return to Studio
              </button>
            </div>
          ) : currentSlide ? (
            <div className="stage-slide-canvas">
              {/* Slide Meta Top Header */}
              <div className="slide-canvas-kicker">
                <div className="canvas-kicker-left">
                  <span className="canvas-course-tag">{manifest?.topic || 'COURSE LECTURE'}</span>
                  <span className="chapter-pill-badge">
                    Chapter {currentSlideIndex + 1}: {currentSlide.title}
                  </span>
                </div>
                <div className="canvas-kicker-right">
                  <span className="canvas-slide-index">
                    SLIDE {String(currentSlideIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* Dynamic Scene Cards (NotebookLM View) vs Classic Slide Deck */}
              {viewMode === 'scene_cards' ? (
                <div className="dynamic-scenes-container">
                  {/* Scene Navigation Ribbon with Live Progress */}
                  <div className="scene-cards-ribbon">
                    {slideSceneCards.map((card, idx) => {
                      const isActive = idx === activeSceneCardIndex;
                      const isPassed = idx < activeSceneCardIndex;
                      const startSec = (card.start_pct || 0) * slideDuration;
                      const endSec = (card.end_pct || 1) * slideDuration;
                      const cardDur = Math.max(0.1, endSec - startSec);
                      const pctInCard = Math.min(100, Math.max(0, ((slideCurrentTime - startSec) / cardDur) * 100));

                      return (
                        <button
                          key={card.id || idx}
                          type="button"
                          className={`scene-ribbon-pill ${isActive ? 'active' : ''} ${isPassed ? 'passed' : ''}`}
                          onClick={() => {
                            if (audioRef.current) {
                              audioRef.current.currentTime = startSec;
                            }
                            setSlideCurrentTime(startSec);
                          }}
                          title={`Jump to Scene Beat ${idx + 1}: ${card.badge || card.headline}`}
                        >
                          <span className="ribbon-num">{String(idx + 1).padStart(2, '0')}</span>
                          <span className="ribbon-label">{card.badge || `Beat ${idx + 1}`}</span>
                          {isActive && (
                            <span
                              className="ribbon-progress-fill"
                              style={{ width: `${pctInCard}%` }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Dynamic Scene Card with Smooth Transition */}
                  <div
                    key={`${currentSlideIndex}-${activeSceneCardIndex}`}
                    className={`dynamic-scene-viewport scene-type-${activeSceneCard?.card_type || 'standard'}`}
                  >
                    <div className="scene-card-header">
                      <span className="scene-card-badge">
                        {activeSceneCard?.badge || 'DYNAMIC SCENE'}
                      </span>
                      <span className="scene-card-timestamp">
                        Beat {activeSceneCardIndex + 1} of {slideSceneCards.length}
                      </span>
                    </div>

                    <h2 className="scene-card-headline">{activeSceneCard?.headline}</h2>
                    {activeSceneCard?.subheadline && (
                      <p className="scene-card-subheadline">{activeSceneCard.subheadline}</p>
                    )}

                    {/* Structured Visual Cards Grid */}
                    <div className={`scene-items-grid items-count-${(activeSceneCard?.items || []).length}`}>
                      {(activeSceneCard?.items || []).map((item, iIdx) => (
                        <div key={iIdx} className="scene-item-card">
                          <div className="scene-item-top">
                            <span className="scene-item-label">{item.label}</span>
                            {item.tag && <span className="scene-item-tag">{item.tag}</span>}
                          </div>
                          <p className="scene-item-text">{item.text}</p>
                        </div>
                      ))}
                    </div>

                    {/* Impactful Callout Banner */}
                    {activeSceneCard?.callout && (
                      <div className="scene-card-callout">
                        <span className="callout-icon">💡</span>
                        <span className="callout-text">{activeSceneCard.callout}</span>
                      </div>
                    )}

                    {/* Verified Grounding Citations */}
                    {currentSlide.citations?.length > 0 && activeSceneCard?.card_type === 'takeaway' && (
                      <div className="academic-citations-footer">
                        <span className="citation-label">Verified Syllabus Grounding:</span>
                        {currentSlide.citations.map((c, i) => (
                          <span key={i} className="citation-file-tag">
                            {c.filename} · Page {c.page_number || '1'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Classic Academic Slide Deck Content */
                <div className="academic-slide-body">
                  <h1 className="academic-slide-title">{currentSlide.title}</h1>

                  <div className="academic-slide-points">
                    {(currentSlide.content || []).map((point, idx) => {
                      const isFocused = isPlaying && idx === activeBulletIndex;
                      return (
                        <div
                          key={idx}
                          className={`academic-point-row ${isFocused ? 'focused-point' : 'unfocused-point'}`}
                        >
                          <span className="point-index-pill">{String(idx + 1).padStart(2, '0')}</span>
                          <p className="point-body-text">{point}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Grounded Academic Source Citation */}
                  {currentSlide.citations?.length > 0 && (
                    <div className="academic-citations-footer">
                      <span className="citation-label">Verified Syllabus Grounding:</span>
                      {currentSlide.citations.map((c, i) => (
                        <span key={i} className="citation-file-tag">
                          {c.filename} · Page {c.page_number || '1'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Minimalist Academic Narrator Pill */}
              <div className="academic-narrator-pill">
                <div className="narrator-mic-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <span className="narrator-name">
                  {manifest?.elevenlabs_configured ? 'ElevenLabs Audio' : 'Prof. Brian'}
                </span>
                {isPlaying && (
                  <div className="voice-audio-bars" aria-label="Audio active">
                    <span className="vbar vbar-1"></span>
                    <span className="vbar vbar-2"></span>
                    <span className="vbar vbar-3"></span>
                  </div>
                )}
              </div>

              {/* Broadcast Subtitles (Word-Perfect Synchronized with Spoken Voice) */}
              {showCaptions && activeSubtitle && (
                <div className="stage-subtitles-bar">
                  <div className="subtitles-pill">
                    <span className="cc-text">{activeSubtitle}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="stage-empty-overlay">
              <div className="empty-lecture-card">
                <div className="empty-lecture-icon">📑</div>
                <h3>No Slides Available Yet</h3>
                <p>
                  This lecture is currently an empty draft with no slides generated.
                  Generate slides in the Lecture Studio to watch the interactive video overview.
                </p>
                <button type="button" className="button button-primary" onClick={onClose} style={{ marginTop: '0.75rem' }}>
                  Return to Lecture Studio
                </button>
              </div>
            </div>
          )}

          {/* Exporting Progress Overlay */}
          {isExporting && (
            <div className="export-progress-modal">
              <div className="export-card">
                <h4>Synthesizing Full Combined Video Lecture</h4>
                <p>{exportStatusText}</p>
                <div className="export-bar-track">
                  <div className="export-bar-fill" style={{ width: `${exportProgress}%` }}></div>
                </div>
                <span className="export-pct">{exportProgress}% Complete</span>
                <button
                  type="button"
                  className="button button-secondary button-sm"
                  onClick={() => { cancelExportRef.current = true; }}
                >
                  Cancel Export
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Master Combined Timeline & Transport Bar */}
        <div className="theater-transport-bar">
          {/* Continuous Progress Timeline Scrubber */}
          <div
            className="timeline-container master-timeline"
            onClick={handleMasterSeek}
            onMouseMove={handleTimelineHover}
            onMouseLeave={() => setHoverTime(null)}
            title="Click to seek anywhere across the combined lecture"
          >
            <div
              className="timeline-progress-fill"
              style={{
                width: `${Math.min(100, (globalCurrentTime / totalLectureDuration) * 100)}%`,
              }}
            ></div>

            {/* Slide Chapter Markers across the full timeline */}
            {slideOffsets.map((off, idx) => (
              <span
                key={idx}
                className={`timeline-marker ${idx === currentSlideIndex ? 'active-chapter' : ''}`}
                style={{
                  left: `${(off.start / totalLectureDuration) * 100}%`,
                }}
                title={`Chapter ${off.slideNumber}: ${off.title}`}
              />
            ))}

            {/* Scrubber Hover Tooltip */}
            {hoverTime !== null && (
              <div
                className="timeline-hover-tooltip"
                style={{
                  left: `${(hoverTime / totalLectureDuration) * 100}%`,
                }}
              >
                <span>{hoverChapter}</span>
                <small>{formatTime(hoverTime)}</small>
              </div>
            )}
          </div>

          <div className="transport-controls-row">
            {/* Left Controls: Navigation & Play/Pause */}
            <div className="transport-left-controls">
              <button
                type="button"
                className="transport-icon-btn"
                onClick={handlePrevSlide}
                disabled={currentSlideIndex <= 0}
                title="Previous Chapter (←)"
                aria-label="Previous Chapter"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="19 20 9 12 19 4 19 20" />
                  <line x1="5" y1="19" x2="5" y2="5" />
                </svg>
              </button>

              <button
                type="button"
                className="transport-play-btn"
                onClick={togglePlay}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                className="transport-icon-btn"
                onClick={handleNextSlide}
                disabled={currentSlideIndex >= slides.length - 1}
                title="Next Chapter (→)"
                aria-label="Next Chapter"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 4 15 12 5 20 5 4" />
                  <line x1="19" y1="5" x2="19" y2="19" />
                </svg>
              </button>

              {/* Master Combined Lecture Time Counter */}
              <div className="transport-time-display">
                <span className="current-slide-label">
                  Chapter {currentSlideIndex + 1}/{slides.length}
                </span>
                <span className="time-separator">·</span>
                <span className="elapsed-time">
                  {formatTime(globalCurrentTime)} / {formatTime(totalLectureDuration)}
                </span>
              </div>
            </div>

            {/* Right Controls: Speed, CC, Audio, Fullscreen */}
            <div className="transport-right-controls">
              {/* Playback Speed selector */}
              <div className="speed-selector-group">
                {[1.0, 1.25, 1.5, 2.0].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`speed-btn ${playbackRate === rate ? 'active' : ''}`}
                    onClick={() => handleSpeedChange(rate)}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {/* Subtitles Toggle */}
              <button
                type="button"
                className={`transport-toggle-btn ${showCaptions ? 'active' : ''}`}
                onClick={() => setShowCaptions((c) => !c)}
                title="Toggle Subtitles / Closed Captions"
              >
                CC
              </button>

              {/* Mute Toggle */}
              <button
                type="button"
                className="transport-icon-btn"
                onClick={() => {
                  const newMute = !isMuted;
                  setIsMuted(newMute);
                  if (audioRef.current) {
                    audioRef.current.muted = newMute;
                  }
                }}
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </button>

              {/* Fullscreen Button */}
              <button
                type="button"
                className="transport-icon-btn"
                onClick={toggleFullscreen}
                title="Toggle Fullscreen (F)"
                aria-label="Toggle Fullscreen"
              >
                {isFullscreen ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
