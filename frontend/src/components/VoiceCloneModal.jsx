import React, { useState, useEffect, useRef } from 'react';
import { getAvailableVoices, cloneProfessorVoice, deleteClonedVoice } from '../services/api';

export default function VoiceCloneModal({
  isOpen,
  onClose,
  selectedVoiceId,
  onSelectVoice,
}) {
  const [voices, setVoices] = useState([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('select'); // 'select' | 'clone'
  const [deletingVoiceId, setDeletingVoiceId] = useState(null);

  // Clone Form State
  const [professorName, setProfessorName] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState('');
  const [cloneSuccess, setCloneSuccess] = useState('');

  // Audio preview playback for preset voices
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    loadVoices();
  }, [isOpen]);

  const loadVoices = async () => {
    try {
      setIsLoading(true);
      const res = await getAvailableVoices();
      setVoices(res.voices || []);
      setIsConfigured(Boolean(res.elevenlabs_configured));
    } catch (err) {
      console.warn('Could not load voices:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviewVoice = (voice) => {
    if (playingVoiceId === voice.voice_id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const previewUrl = voice.preview_url || `/voices/${encodeURIComponent(voice.voice_id)}/preview`;
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    setPlayingVoiceId(voice.voice_id);
    audio.play().catch(() => setPlayingVoiceId(null));
    audio.onended = () => {
      setPlayingVoiceId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingVoiceId(null);
      audioRef.current = null;
    };
  };

  const handleDeleteVoice = async (e, voice) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Are you sure you want to delete the cloned voice "${voice.name}"? This will remove it from ElevenLabs.`
    );
    if (!confirmed) return;

    try {
      setDeletingVoiceId(voice.voice_id);
      await deleteClonedVoice(voice.voice_id);

      // Stop audio preview if this voice was playing
      if (playingVoiceId === voice.voice_id) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        setPlayingVoiceId(null);
      }

      // If active voice was deleted, fallback to another voice
      if (selectedVoiceId === voice.voice_id && onSelectVoice) {
        const fallback = voices.find((v) => v.voice_id !== voice.voice_id);
        if (fallback) onSelectVoice(fallback);
      }

      // Reload list of voices
      await loadVoices();
    } catch (err) {
      alert(err.message || 'Failed to delete cloned voice.');
    } finally {
      setDeletingVoiceId(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCloneError('');
    setCloneSuccess('');

    // Check size limit: 15MB
    if (file.size > 15 * 1024 * 1024) {
      setCloneError('Audio file exceeds 15MB limit. Please upload a shorter sample (1-3 minutes).');
      return;
    }

    setAudioFile(file);
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setAudioPreviewUrl(URL.createObjectURL(file));
  };

  const handleCloneSubmit = async (e) => {
    e.preventDefault();
    if (!professorName.trim()) {
      setCloneError('Please enter the professor’s name.');
      return;
    }
    if (!audioFile) {
      setCloneError('Please select an audio recording file (MP3, WAV, M4A).');
      return;
    }

    try {
      setIsCloning(true);
      setCloneError('');
      setCloneSuccess('');

      const formData = new FormData();
      formData.append('professor_name', professorName.trim());
      formData.append('file', audioFile);

      const newVoice = await cloneProfessorVoice(formData);
      setCloneSuccess(`Successfully cloned voice for ${newVoice.name}!`);
      setProfessorName('');
      setAudioFile(null);
      setAudioPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Reload list and auto-select new voice
      await loadVoices();
      if (newVoice.voice_id && onSelectVoice) {
        onSelectVoice(newVoice);
      }
      setTimeout(() => {
        setActiveTab('select');
      }, 1200);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('instant voice cloning') || msg.includes('upgrade your plan') || msg.includes('paid_plan_required')) {
        setCloneError('ElevenLabs Free tier does not include custom voice cloning (requires ElevenLabs Starter plan). However, all standard professor voices on the "Academic Presets" tab are fully active and free to use!');
      } else {
        setCloneError(msg || 'Failed to clone professor voice. Ensure ElevenLabs API key is configured.');
      }
    } finally {
      setIsCloning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="voice-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="voice-modal-title">
      <div className="voice-modal-card glass-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="voice-modal-head">
          <div>
            <span className="eyebrow">ELEVENLABS VOICE STUDIO</span>
            <h2 id="voice-modal-title">Professor Voice Selection &amp; Cloning</h2>
          </div>
          <button className="voice-modal-close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="voice-modal-tabs">
          <button
            className={`voice-tab-btn ${activeTab === 'select' ? 'active' : ''}`}
            onClick={() => setActiveTab('select')}
          >
            Academic Presets &amp; Cloned Voices ({voices.length})
          </button>
          <button
            className={`voice-tab-btn ${activeTab === 'clone' ? 'active' : ''}`}
            onClick={() => setActiveTab('clone')}
          >
            + Clone New Professor Voice
          </button>
        </div>

        {/* Configuration Notice if API Key not set */}
        {!isConfigured && (
          <div className="voice-notice-banner">
            <div className="voice-notice-icon">✓</div>
            <div>
              <strong>Studio Neural Professor Voices Active</strong>
              <p>
                Broadcast-grade neural speech is active across all academic presets.
                To clone a specific professor's voice by uploading an audio sample, add your <code>ELEVENLABS_API_KEY</code> in <code>backend/.env</code>.
              </p>
            </div>
          </div>
        )}

        {/* TAB 1: SELECT VOICE */}
        {activeTab === 'select' && (
          <div className="voice-list-container">
            {isLoading ? (
              <div className="loading-state">Loading available voices...</div>
            ) : voices.length === 0 ? (
              <div className="empty-substate">
                <p>No voices available.</p>
              </div>
            ) : (
              <div className="voice-grid">
                {voices.map((voice) => {
                  const isSelected = selectedVoiceId === voice.voice_id;
                  const isPlaying = playingVoiceId === voice.voice_id;
                  const isCloned = voice.is_cloned || voice.category === 'Cloned Professor';
                  const isDeleting = deletingVoiceId === voice.voice_id;

                  return (
                    <div
                      key={voice.voice_id}
                      className={`voice-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => onSelectVoice && onSelectVoice(voice)}
                    >
                      <div className="voice-card-top">
                        <div className="voice-avatar-initials">
                          {voice.name.replace(/^Prof\.\s*/i, '').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="voice-card-meta">
                          <div className="voice-name-row">
                            <h4>{voice.name}</h4>
                            <div className="voice-badges-group">
                              {isSelected && <span className="active-badge">Active</span>}
                              {isCloned && (
                                <button
                                  type="button"
                                  className="delete-voice-icon-btn"
                                  title="Delete this cloned voice permanently"
                                  disabled={isDeleting}
                                  onClick={(e) => handleDeleteVoice(e, voice)}
                                >
                                  {isDeleting ? '…' : '✕'}
                                </button>
                              )}
                            </div>
                          </div>
                          <span className="voice-tags">
                            <span className="voice-category-tag">{voice.category || 'Academic'}</span>
                            {voice.accent && <span className="voice-accent-tag">{voice.accent}</span>}
                            {voice.gender && <span className="voice-gender-tag">{voice.gender}</span>}
                          </span>
                        </div>
                      </div>

                      <p className="voice-desc">{voice.description || 'Natural academic speaking style.'}</p>

                      <div className="voice-card-actions">
                        <button
                          type="button"
                          className={`preview-voice-btn ${isPlaying ? 'playing' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewVoice(voice);
                          }}
                        >
                          {isPlaying ? '⏹ Stop' : '▶ Preview Sample'}
                        </button>
                        <div className="voice-action-buttons">
                          {isCloned && (
                            <button
                              type="button"
                              className="delete-voice-btn"
                              title="Delete this cloned voice from ElevenLabs"
                              disabled={isDeleting}
                              onClick={(e) => handleDeleteVoice(e, voice)}
                            >
                              {isDeleting ? 'Deleting…' : 'Delete'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="button button-sm button-secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectVoice && onSelectVoice(voice);
                            }}
                          >
                            {isSelected ? 'Selected' : 'Use Voice'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CLONE PROFESSOR VOICE */}
        {activeTab === 'clone' && (
          <form className="voice-clone-form" onSubmit={handleCloneSubmit}>
            <div className="clone-instructions">
              <h4>Clone Any Professor’s Voice</h4>
              <p>
                Upload a 1–3 minute clean audio sample of a professor or instructor speaking.
                ElevenLabs Instant Voice Cloning will analyze their timbre, pitch, and cadence
                to narrate all slides in this lecture with their exact voice.
              </p>
            </div>

            {cloneError && <div className="error-banner">{cloneError}</div>}
            {cloneSuccess && <div className="success-banner">{cloneSuccess}</div>}

            <div className="field-group">
              <label className="field-label" htmlFor="prof-name-input">
                Professor Name <span className="required-star">*</span>
              </label>
              <input
                id="prof-name-input"
                type="text"
                className="input-field"
                placeholder="e.g. Richard Feynman, Andrew Ng, Jane Smith"
                value={professorName}
                onChange={(e) => setProfessorName(e.target.value)}
                disabled={isCloning}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">
                Audio Sample (MP3, WAV, M4A, AAC) <span className="required-star">*</span>
              </label>
              <div className="file-drop-area">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/mp3,audio/wav,audio/m4a,audio/aac,audio/ogg"
                  onChange={handleFileChange}
                  disabled={isCloning}
                />
                <div className="drop-info">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  <span>{audioFile ? audioFile.name : 'Click to select or drop audio sample'}</span>
                  <small>Clean speech with minimal background noise yields the highest fidelity.</small>
                </div>
              </div>

              {audioPreviewUrl && (
                <div className="audio-uploaded-preview">
                  <span>Selected Sample:</span>
                  <audio controls src={audioPreviewUrl} />
                </div>
              )}
            </div>

            <div className="voice-clone-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setActiveTab('select')}
                disabled={isCloning}
              >
                Back to Voices
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={isCloning || !audioFile || !professorName.trim()}
              >
                {isCloning ? 'Cloning Professor Voice...' : 'Clone Voice with ElevenLabs →'}
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="voice-modal-foot">
          <span className="selected-hint">
            Active Voice: <b>{voices.find((v) => v.voice_id === selectedVoiceId)?.name || 'Default Academic Voice'}</b>
          </span>
          <button className="button button-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
