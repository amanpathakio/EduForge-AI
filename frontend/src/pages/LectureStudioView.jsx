import React, { useState, useEffect } from 'react';
import VoiceLectureChat from '../components/VoiceLectureChat';
import VoiceCloneModal from '../components/VoiceCloneModal';
import VideoLecturePlayer from '../components/VideoLecturePlayer';
import {
  generateCourseLecture,
  getLecture,
  updateLectureSlide,
  deleteLectureSlide,
  regenerateLectureSlide,
  deleteLecture,
  publishLecture,
} from '../services/api';

export default function LectureStudioView({
  courses,
  initialCourseId,
  initialLectureId,
  onOpenCitation,
  onBackToCourse,
}) {
  const [selectedCourseId, setSelectedCourseId] = useState(
    initialCourseId || (courses.length > 0 ? courses[0].id : '')
  );

  useEffect(() => {
    if (initialCourseId) {
      setSelectedCourseId(initialCourseId);
    } else if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
  }, [initialCourseId, courses, selectedCourseId]);

  // Form State for New Lecture Generation
  const [topic, setTopic] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [difficulty, setDifficulty] = useState('intermediate');
  const [slideCount, setSlideCount] = useState(8);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [teachingStyle, setTeachingStyle] = useState('conceptual');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');

  // Active Lecture Editor State
  const [currentLecture, setCurrentLecture] = useState(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [isLoadingLecture, setIsLoadingLecture] = useState(false);

  // Active Slide Editable State
  const [editTitle, setEditTitle] = useState('');
  const [editBullets, setEditBullets] = useState([]);
  const [editSpeakerNotes, setEditSpeakerNotes] = useState('');
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(false);
  const [isSavingSlide, setIsSavingSlide] = useState(false);
  const [slideSaveMsg, setSlideSaveMsg] = useState('');

  // AI Slide Regeneration State
  const [regenInstruction, setRegenInstruction] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState('');

  // Editor Inline Errors & Confirmation Dialog State
  const [editorError, setEditorError] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // { type: 'slide' | 'lecture', slideIndex?, label }
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(null);

  const handlePublishLecture = async () => {
    if (!currentLecture || isPublishing) return;
    try {
      setIsPublishing(true);
      setEditorError('');
      const updated = await publishLecture(currentLecture.id);
      setCurrentLecture(updated);
    } catch (err) {
      setEditorError(err.message || 'Failed to publish lecture');
    } finally {
      setIsPublishing(false);
    }
  };

  // Load lecture if initialLectureId provided
  useEffect(() => {
    if (initialLectureId) {
      loadLectureData(initialLectureId);
    }
  }, [initialLectureId]);

  const loadLectureData = async (lectureId) => {
    try {
      setIsLoadingLecture(true);
      const data = await getLecture(lectureId);
      setCurrentLecture(data);
      setSelectedSlideIndex(0);
      syncSlideToEditState(data.slides[0]);
    } catch (err) {
      console.warn('Failed to load lecture:', err);
    } finally {
      setIsLoadingLecture(false);
    }
  };

  const syncSlideToEditState = (slide) => {
    if (!slide) return;
    setEditTitle(slide.title || '');
    setEditBullets(Array.isArray(slide.content) ? [...slide.content] : []);
    setEditSpeakerNotes(slide.speaker_notes || '');
    setSlideSaveMsg('');
    setRegenInstruction('');
    setRegenError('');
  };

  const handleSelectSlide = (index) => {
    setSelectedSlideIndex(index);
    if (currentLecture && currentLecture.slides[index]) {
      syncSlideToEditState(currentLecture.slides[index]);
    }
  };

  // Generate Lecture Submit
  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!selectedCourseId) {
      setGenerationError('Please select a course first.');
      return;
    }
    if (!topic.trim()) {
      setGenerationError('Please enter a lecture topic.');
      return;
    }

    try {
      setIsGenerating(true);
      setGenerationError('');
      const styleGuidance = {
        conceptual: 'Teach from first principles. Use a clear mental model and one analogy only when supported by the supplied material.',
        practical: 'Prioritize a worked example, decision points, and an applied takeaway grounded in the supplied material.',
        assessment: 'Build toward retrieval practice: include a short check-for-understanding and a concise recap grounded in the supplied material.',
      };
      const generated = await generateCourseLecture(selectedCourseId, {
        topic: topic.trim(),
        duration_minutes: Number(durationMinutes),
        difficulty,
        slide_count: Number(slideCount),
        additional_instructions: [styleGuidance[teachingStyle], additionalInstructions.trim()].filter(Boolean).join(' '),
      });

      setCurrentLecture(generated);
      setSelectedSlideIndex(0);
      syncSlideToEditState(generated.slides[0]);
    } catch (err) {
      setGenerationError(err.message || 'Lecture generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save manual slide edits
  const handleSaveSlide = async () => {
    if (!currentLecture) return;
    const slide = currentLecture.slides[selectedSlideIndex];
    if (!slide) return;

    try {
      setIsSavingSlide(true);
      setSlideSaveMsg('');
      setEditorError('');
      const updated = await updateLectureSlide(currentLecture.id, slide.id, {
        title: editTitle.trim(),
        content: editBullets.filter((b) => b.trim().length > 0),
        speaker_notes: editSpeakerNotes,
      });

      const updatedSlides = [...currentLecture.slides];
      updatedSlides[selectedSlideIndex] = updated;
      setCurrentLecture({ ...currentLecture, slides: updatedSlides });
      setSlideSaveMsg('Slide saved successfully!');
      setTimeout(() => setSlideSaveMsg(''), 3000);
    } catch (err) {
      setEditorError(`Failed to save slide: ${err.message}`);
    } finally {
      setIsSavingSlide(false);
    }
  };

  // Request Slide Delete Confirmation
  const handleDeleteSlide = (slideIndex, e) => {
    e.stopPropagation();
    if (!currentLecture) return;
    const slide = currentLecture.slides[slideIndex];
    if (!slide) return;
    setEditorError('');
    setPendingDelete({
      type: 'slide',
      slideIndex,
      label: `Slide ${slide.slide_number}: "${slide.title || 'Untitled'}"`,
    });
  };

  // Regenerate Single Slide with AI
  const handleRegenerateSlide = async () => {
    if (!currentLecture || !regenInstruction.trim()) return;
    const slide = currentLecture.slides[selectedSlideIndex];
    if (!slide) return;

    try {
      setIsRegenerating(true);
      setRegenError('');
      const regeneratedSlide = await regenerateLectureSlide(
        currentLecture.id,
        slide.id,
        regenInstruction.trim()
      );

      const updatedSlides = [...currentLecture.slides];
      updatedSlides[selectedSlideIndex] = regeneratedSlide;
      setCurrentLecture({ ...currentLecture, slides: updatedSlides });
      syncSlideToEditState(regeneratedSlide);
      setSlideSaveMsg('Slide regenerated with grounded citations!');
      setTimeout(() => setSlideSaveMsg(''), 4000);
    } catch (err) {
      setRegenError(err.message || 'Slide regeneration failed');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Request Entire Lecture Delete Confirmation
  const handleDeleteLecture = () => {
    if (!currentLecture) return;
    setEditorError('');
    setPendingDelete({
      type: 'lecture',
      label: `lecture "${currentLecture.title}"`,
    });
  };

  const executePendingDelete = async () => {
    if (!pendingDelete || !currentLecture) return;
    try {
      setIsDeletingItem(true);
      setEditorError('');
      if (pendingDelete.type === 'slide') {
        const slideIndex = pendingDelete.slideIndex;
        const slide = currentLecture.slides[slideIndex];
        if (!slide) return;
        await deleteLectureSlide(currentLecture.id, slide.id);
        const reloaded = await getLecture(currentLecture.id);
        setCurrentLecture(reloaded);
        const nextIndex = Math.max(0, slideIndex - 1);
        setSelectedSlideIndex(nextIndex);
        syncSlideToEditState(reloaded.slides[nextIndex]);
      } else if (pendingDelete.type === 'lecture') {
        await deleteLecture(currentLecture.id);
        setCurrentLecture(null);
        if (onBackToCourse) onBackToCourse();
      }
      setPendingDelete(null);
    } catch (err) {
      setEditorError(`Delete failed: ${err.message}`);
      setPendingDelete(null);
    } finally {
      setIsDeletingItem(false);
    }
  };

  // Citation click handler mapping to CitationDrawer
  const handleCitationClick = (citation) => {
    const chunkData = {
      text: citation.chunk_text || 'Source text not available',
      distance: citation.distance,
      id: citation.chunk_id || citation.id,
      metadata: {
        source_filename: citation.filename,
        page_number: citation.page_number,
      },
    };
    onOpenCitation({
      chunk: chunkData,
      sourceTitle: `${citation.filename} · Page ${citation.page_number}`,
    });
  };

  // ================= RENDER =================

  // 1. Loading state
  if (isLoadingLecture) {
    return (
      <div className="studio-loading-view">
        <div className="spinner" />
        <p>Loading lecture and slide citations...</p>
      </div>
    );
  }

  // 2. Editor Mode: When a lecture is loaded
  if (currentLecture) {
    const currentSlide = currentLecture.slides[selectedSlideIndex] || null;
    const citedSlides = currentLecture.slides.filter((slide) => (slide.citations?.length || 0) > 0).length;
    const evidenceCoverage = currentLecture.slides.length
      ? Math.round((citedSlides / currentLecture.slides.length) * 100)
      : 0;

    return (
      <div className="lecture-editor-container">
        {/* Editor Top Bar */}
        <div className="editor-top-bar glass-card">
          <div className="editor-top-left">
            <button
              className="back-btn"
              onClick={() => {
                if (onBackToCourse) onBackToCourse();
                else setCurrentLecture(null);
              }}
            >
              ← Back to Course
            </button>
            <div>
              <div className="editor-badges">
                <span className="badge lec-badge">{currentLecture.status}</span>
                <span className="meta-pill">{currentLecture.difficulty}</span>
                <span className="meta-pill">{currentLecture.duration_minutes} min</span>
              </div>
              <h2 className="editor-title">{currentLecture.title}</h2>
              <span className="editor-topic">Topic: {currentLecture.topic}</span>
            </div>
          </div>

          <div className="editor-top-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowVoiceModal(true)}
              title="Configure ElevenLabs Professor Voice & Voice Cloning"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              {selectedVoice ? selectedVoice.name : 'Professor Voice'}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setShowVideoPlayer(true)}
              title="Watch full synchronized 16:9 Video Lecture"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Watch Video Lecture
            </button>
            <button
              type="button"
              className={`button ${showVoiceChat ? 'button-primary' : 'button-secondary'}`}
              onClick={() => setShowVoiceChat((v) => !v)}
            >
              {showVoiceChat ? 'Hide Voice Chat' : 'Voice Chat'}
            </button>
            {currentLecture.status !== 'published' ? (
              <button
                className="button button-primary"
                onClick={handlePublishLecture}
                disabled={isPublishing}
              >
                {isPublishing ? 'Publishing…' : 'Publish to Students ✓'}
              </button>
            ) : (
              <span className="meta-pill published-pill">Published to Students</span>
            )}
            <button
              className="button button-secondary"
              onClick={() => setCurrentLecture(null)}
            >
              + Create Another Lecture
            </button>
            <button
              className="button button-danger"
              onClick={handleDeleteLecture}
              title="Delete this lecture"
            >
              Delete
            </button>
          </div>
        </div>

        <section className="lecture-blueprint glass-card">
          <div className="blueprint-heading">
            <div><span className="eyebrow">AGENT BLUEPRINT</span><h3>Teaching plan & evidence health</h3></div>
            <div className="coverage-meter" title={`${citedSlides} of ${currentLecture.slides.length} slides contain source citations`}>
              <div className="coverage-ring" style={{ '--coverage': `${evidenceCoverage}%` }}><b>{evidenceCoverage}%</b></div>
              <span><b>Evidence coverage</b><small>{citedSlides}/{currentLecture.slides.length} slides cite course material</small></span>
            </div>
          </div>
          <div className="blueprint-objectives">
            {(currentLecture.learning_objectives || []).slice(0, 3).map((objective, index) => <div className="blueprint-objective" key={objective}><span>{String(index + 1).padStart(2, '0')}</span><p>{objective}</p></div>)}
            {(!currentLecture.learning_objectives || currentLecture.learning_objectives.length === 0) && <p className="blueprint-empty">No learning objectives were returned for this draft.</p>}
          </div>
        </section>

        {/* Editor Main Content: Outline on left, Main Slide on right */}
        {editorError && <div className="error-banner">{editorError}</div>}
        <div className="editor-workspace-layout">
          {/* LEFT OUTLINE SIDEBAR */}
          <div className="slides-outline-sidebar glass-card">
            <div className="outline-header">
              <h4>Slides Outline</h4>
              <span className="meta-pill">{currentLecture.slides.length} slides</span>
            </div>

            <div className="outline-list">
              {currentLecture.slides.map((slide, idx) => {
                const isSelected = idx === selectedSlideIndex;
                return (
                  <div
                    key={slide.id || idx}
                    className={`outline-item ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelectSlide(idx)}
                  >
                    <div className="outline-item-number">{slide.slide_number}</div>
                    <div className="outline-item-info">
                      <span className="outline-item-title">{slide.title || `Slide ${idx + 1}`}</span>
                      <span className="outline-item-meta">
                        {slide.citations?.length || 0} citation{(slide.citations?.length === 1) ? '' : 's'}
                      </span>
                    </div>
                    {currentLecture.slides.length > 1 && (
                      <button
                        className="outline-item-del"
                        title="Delete slide"
                        onClick={(e) => handleDeleteSlide(idx, e)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT MAIN SLIDE EDITOR */}
          <div className="slide-main-editor glass-card">
            {currentSlide ? (
              <div className="slide-editor-inner">
                <section className={`slide-stage-preview slide-style-${selectedSlideIndex % 3}`} aria-label="Live lecture slide preview">
                  <div className="slide-stage-kicker"><span>EDUFORGE LECTURE DRAFT</span><span>{String(currentSlide.slide_number).padStart(2, '0')} / {String(currentLecture.slides.length).padStart(2, '0')}</span></div>
                  <h1>{editTitle || 'Untitled slide'}</h1>
                  <div className="slide-stage-content">
                    <ul>{editBullets.filter(Boolean).slice(0, 4).map((bullet, idx) => <li key={idx}>{bullet}</li>)}</ul>
                    <div className="slide-evidence-stamp"><b>{currentSlide.citations?.length || 0}</b><span>source{currentSlide.citations?.length === 1 ? '' : 's'} linked</span></div>
                  </div>
                  <div className="slide-stage-footer"><span>{currentLecture.title}</span><span>Evidence-first teaching draft</span></div>
                </section>
                {/* Slide Header */}
                <div className="slide-editor-header">
                  <div>
                    <span className="badge slide-num-badge">
                      Slide {currentSlide.slide_number} of {currentLecture.slides.length}
                    </span>
                    <label className="field-label" htmlFor="slide-title-input">Slide Title</label>
                    <input
                      id="slide-title-input"
                      type="text"
                      className="slide-title-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>

                  <div className="slide-actions-top">
                    {slideSaveMsg && <span className="save-success-msg">{slideSaveMsg}</span>}
                    <button
                      className="button button-primary save-slide-btn"
                      onClick={handleSaveSlide}
                      disabled={isSavingSlide}
                    >
                      {isSavingSlide ? 'Saving...' : 'Save Slide'}
                    </button>
                  </div>
                </div>

                {/* Bullet Points Section */}
                <div className="slide-bullets-section">
                  <div className="section-title-row">
                    <label className="field-label">Slide Content (Key Points)</label>
                    <button
                      className="button button-sm button-secondary"
                      onClick={() => setEditBullets([...editBullets, ''])}
                    >
                      + Add Bullet
                    </button>
                  </div>

                  <div className="bullets-inputs-list">
                    {editBullets.map((bullet, bIdx) => (
                      <div key={bIdx} className="bullet-input-row">
                        <span className="bullet-dot">•</span>
                        <input
                          type="text"
                          className="bullet-input"
                          value={bullet}
                          onChange={(e) => {
                            const copy = [...editBullets];
                            copy[bIdx] = e.target.value;
                            setEditBullets(copy);
                          }}
                          placeholder="Bullet point text..."
                        />
                        <button
                          className="bullet-del-btn"
                          title="Remove bullet"
                          onClick={() => {
                            const copy = editBullets.filter((_, i) => i !== bIdx);
                            setEditBullets(copy);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="speaker-notes-section">
                  <button type="button" className="notes-disclosure" onClick={() => setShowSpeakerNotes((visible) => !visible)} aria-expanded={showSpeakerNotes}>
                    <span>Presenter notes <small>Optional · delivery &amp; voice script</small></span>
                    <span>{showSpeakerNotes ? 'Hide' : 'Show'}</span>
                  </button>
                  {showSpeakerNotes && <textarea
                    id="speaker-notes-input"
                    rows="3"
                    className="speaker-notes-textarea"
                    value={editSpeakerNotes}
                    onChange={(e) => setEditSpeakerNotes(e.target.value)}
                    placeholder="Optional presenter talking points — students do not see these on the slide."
                  />}
                </div>

                {/* Grounded Citations Section */}
                <div className="slide-citations-section">
                  <div className="section-title-row">
                    <label className="field-label">
                      Grounded Citations ({currentSlide.citations?.length || 0})
                    </label>
                    <span className="citations-hint">Click a badge to inspect the exact course chunk</span>
                  </div>

                  {currentSlide.citations && currentSlide.citations.length > 0 ? (
                    <div className="slide-citations-list">
                      {currentSlide.citations.map((cit, cIdx) => (
                        <button
                          key={cit.id || cIdx}
                          type="button"
                          className="citation-badge"
                          onClick={() => handleCitationClick(cit)}
                          title={`Click to inspect chunk from ${cit.filename}`}
                        >
                          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          <span>{cit.filename} · Page {cit.page_number || '?'}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="no-citations-sub">
                      No specific chunk citations attached to this slide.
                    </div>
                  )}
                </div>

                {/* AI TARGETED REGENERATION BOX */}
                <div className="ai-regen-box glass-card">
                  <div className="regen-header">
                    <div className="regen-title">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 18, height: 18 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <h4>How should EduForge improve this slide?</h4>
                    </div>
                    <span className="regen-sub">Regenerates ONLY this slide using grounded course context</span>
                  </div>

                  {regenError && <div className="error-banner">{regenError}</div>}

                  <div className="regen-input-row">
                    <input
                      type="text"
                      className="regen-input"
                      placeholder="e.g. Make this simpler and add a practical real-world example..."
                      value={regenInstruction}
                      onChange={(e) => setRegenInstruction(e.target.value)}
                      disabled={isRegenerating}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isRegenerating && regenInstruction.trim()) {
                          handleRegenerateSlide();
                        }
                      }}
                    />
                    <button
                      className="button button-primary regen-btn"
                      onClick={handleRegenerateSlide}
                      disabled={isRegenerating || !regenInstruction.trim()}
                    >
                      {isRegenerating ? (
                        <>
                          <div className="spinner-sm" /> Regenerating...
                        </>
                      ) : (
                        'Regenerate Slide'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-substate">Select a slide from the outline to edit.</div>
            )}
          </div>
        </div>

        {showVoiceChat && (
          <VoiceLectureChat
            key={`studio-voice-${currentLecture.id}-${currentSlide?.id || selectedSlideIndex}`}
            courseId={currentLecture.course_id || selectedCourseId}
            lectureTitle={currentLecture.title}
            slide={currentSlide}
            roleLabel="PROFESSOR STUDIO VOICE CHAT"
            onOpenCitation={onOpenCitation}
            onClose={() => setShowVoiceChat(false)}
          />
        )}

        {pendingDelete && (
          <div className="modal-overlay" onClick={() => !isDeletingItem && setPendingDelete(null)}>
            <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="modal-header">
                <h3>Confirm Removal</h3>
                <button
                  type="button"
                  className="icon-button close-btn"
                  onClick={() => !isDeletingItem && setPendingDelete(null)}
                >
                  ×
                </button>
              </div>
              <p className="confirm-modal-copy">
                Are you sure you want to remove <strong>{pendingDelete.label}</strong>?
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setPendingDelete(null)}
                  disabled={isDeletingItem}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={executePendingDelete}
                  disabled={isDeletingItem}
                >
                  {isDeletingItem ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        )}
        {showVoiceModal && (
          <VoiceCloneModal
            isOpen={showVoiceModal}
            onClose={() => setShowVoiceModal(false)}
            selectedVoiceId={selectedVoice?.voice_id}
            onSelectVoice={(v) => {
              setSelectedVoice(v);
            }}
          />
        )}

        {showVideoPlayer && currentLecture && (
          <VideoLecturePlayer
            lectureId={currentLecture.id}
            lectureTitle={currentLecture.title}
            initialVoiceId={selectedVoice?.voice_id}
            onClose={() => setShowVideoPlayer(false)}
            onOpenVoiceModal={() => {
              setShowVideoPlayer(false);
              setShowVoiceModal(true);
            }}
          />
        )}
      </div>
    );
  }

  // 3. New Lecture Generation Form Mode
  return (
    <div className="lecture-studio-container">
      <div className="studio-header">
        <div>
          <h1 className="view-title">AI Lecture Studio</h1>
          <p className="view-subtitle">
            Slide-by-slide decks strictly grounded in your course PDFs.
          </p>
        </div>
        {selectedCourseId && (
          <button
            type="button"
            className={`button ${showVoiceChat ? 'button-primary' : 'button-secondary'}`}
            onClick={() => setShowVoiceChat((v) => !v)}
          >
            {showVoiceChat ? 'Hide Voice Chat' : 'Course Voice Chat'}
          </button>
        )}
      </div>

      {showVoiceChat && selectedCourseId && (
        <VoiceLectureChat
          key={`studio-course-voice-${selectedCourseId}`}
          courseId={selectedCourseId}
          lectureTitle={courses.find((c) => c.id === selectedCourseId)?.title || 'Course Session'}
          roleLabel="STUDIO VOICE CHAT"
          onOpenCitation={onOpenCitation}
          onClose={() => setShowVoiceChat(false)}
        />
      )}

      <div className="generator-card-wrapper">
        <div className="generator-card glass-card">
          <form onSubmit={handleGenerate} className="studio-form">
            {generationError && (
              <div className="error-banner">
                <strong>Generation Error:</strong> {generationError}
              </div>
            )}

            {/* Course Selector */}
            <div className="form-group">
              <label htmlFor="course-select">Select Course *</label>
              <select
                id="course-select"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                required
              >
                <option value="">-- Choose a course --</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.document_count || 0} documents)
                  </option>
                ))}
              </select>
            </div>

            {/* Topic Input */}
            <div className="form-group">
              <label htmlFor="topic-input">Lecture Topic *</label>
              <input
                id="topic-input"
                type="text"
                placeholder="e.g. CPU Scheduling & Round Robin Algorithm"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
                disabled={isGenerating}
              />
            </div>

            {/* Duration and Difficulty Grid */}
            <div className="form-row-grid">
              <div className="form-group">
                <label htmlFor="duration-select">Duration</label>
                <select
                  id="duration-select"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  disabled={isGenerating}
                >
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                  <option value={120}>120 minutes</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="difficulty-select">Target Difficulty</label>
                <select
                  id="difficulty-select"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  disabled={isGenerating}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="slides-input">Slide Count ({slideCount})</label>
                <input
                  id="slides-input"
                  type="range"
                  min="3"
                  max="20"
                  step="1"
                  value={slideCount}
                  onChange={(e) => setSlideCount(Number(e.target.value))}
                  disabled={isGenerating}
                />
              </div>
            </div>

            {/* Additional Instructions */}
            <div className="form-group">
              <label>Teaching Mode</label>
              <div className="teaching-mode-grid">
                {[
                  ['conceptual', 'Build understanding', 'Mental models and clean explanations'],
                  ['practical', 'Apply it', 'Worked examples and decisions'],
                  ['assessment', 'Make it stick', 'Checks for understanding and recap'],
                ].map(([id, label, detail]) => (
                  <button key={id} type="button" className={`teaching-mode ${teachingStyle === id ? 'selected' : ''}`} onClick={() => setTeachingStyle(id)} disabled={isGenerating}>
                    <b>{label}</b><small>{detail}</small>
                  </button>
                ))}
              </div>
            </div>

            {/* Additional Instructions */}
            <div className="form-group">
              <label htmlFor="instructions-input">Additional Instructions (Optional)</label>
              <textarea
                id="instructions-input"
                rows="3"
                placeholder="e.g. Focus on FCFS, SJF and Round Robin with practical examples and comparison metrics."
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                disabled={isGenerating}
              />
            </div>

            {/* Submit Action */}
            <div className="form-submit-row">
              <button
                type="submit"
                className="button button-primary generate-main-btn"
                disabled={isGenerating || !topic.trim() || !selectedCourseId}
              >
                {isGenerating ? (
                  <>
                    <div className="spinner-sm" /> Synthesizing Grounded Lecture...
                  </>
                ) : (
                  <>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 20, height: 20, marginRight: 8 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                    Generate Lecture
                  </>
                )}
              </button>
            </div>
          </form>

          {isGenerating && (
            <div className="generation-progress-box">
              <div className="progress-steps-list">
                <div className="step-item active">
                  <span className="step-dot" />
                  <span>Building an evidence map from your course material...</span>
                </div>
                <div className="step-item active">
                  <span className="step-dot" />
                  <span>Planning a learning arc, examples, and knowledge checks...</span>
                </div>
                <div className="step-item active">
                  <span className="step-dot" />
                  <span>Drafting a cited teaching deck and checking its evidence trail...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
