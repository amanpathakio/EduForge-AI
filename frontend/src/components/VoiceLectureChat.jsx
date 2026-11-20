import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { sendCourseChatMessage } from '../services/api';
import {
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speakText,
  startVoiceListening,
  stopSpeaking,
} from '../lib/speech';

export default function VoiceLectureChat({
  courseId,
  lectureTitle = '',
  slide = null,
  roleLabel = 'Studio Voice Chat',
  onOpenCitation,
  onClose,
}) {
  const [turns, setTurns] = useState([]);
  const [draftQuery, setDraftQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voiceNotice, setVoiceNotice] = useState('');

  const recognitionRef = useRef(null);
  const endRef = useRef(null);

  const micSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, isSending]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  const handleSpeak = (text) => {
    if (!ttsSupported || !text) return;
    speakText(text, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const handleReadSlideAloud = () => {
    if (!slide) return;
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    const parts = [
      slide.title ? `Slide ${slide.slide_number || ''}: ${slide.title}.` : '',
      ...(slide.content || []),
      slide.speaker_notes ? `Presenter notes: ${slide.speaker_notes}` : '',
    ].filter(Boolean);
    handleSpeak(parts.join(' '));
  };

  const sendVoiceTurn = async (rawQuestion) => {
    const question = (rawQuestion || draftQuery).trim();
    if (!question || !courseId || isSending) return;

    setDraftQuery('');
    setVoiceNotice('');
    stopSpeaking();
    setIsSpeaking(false);

    const scopedPrompt = slide
      ? `Regarding lecture "${lectureTitle}", Slide ${slide.slide_number || ''} ("${slide.title || ''}"): ${question}`
      : question;

    const userTurn = {
      id: `v-user-${Date.now()}`,
      sender: 'user',
      text: question,
    };
    setTurns((prev) => [...prev, userTurn]);
    setIsSending(true);

    try {
      const data = await sendCourseChatMessage(courseId, scopedPrompt);
      const replyTurn = {
        id: `v-ai-${Date.now()}`,
        sender: 'assistant',
        text: data.answer,
        sources: data.sources || [],
        chunks: data.retrieved_chunks || [],
      };
      setTurns((prev) => [...prev, replyTurn]);
      if (autoSpeak && ttsSupported) {
        handleSpeak(data.answer);
      }
    } catch (err) {
      setVoiceNotice(err?.message || 'Unable to process voice question right now.');
    } finally {
      setIsSending(false);
    }
  };

  const toggleMic = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    stopSpeaking();
    setIsSpeaking(false);
    setVoiceNotice('');
    setIsListening(true);

    recognitionRef.current = startVoiceListening({
      onInterim: (transcript) => setDraftQuery(transcript),
      onResult: (finalTranscript) => {
        setIsListening(false);
        if (finalTranscript) {
          sendVoiceTurn(finalTranscript);
        }
      },
      onError: (msg) => {
        setVoiceNotice(msg);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  };

  return (
    <section className="voice-lecture-drawer glass-card" aria-label="Lecture Voice Chat">
      <div className="voice-drawer-head">
        <div className="voice-drawer-title">
          <span className={`voice-live-dot ${isListening || isSpeaking ? 'active' : ''}`} aria-hidden="true" />
          <div>
            <span className="eyebrow">{roleLabel}</span>
            <h4>
              {slide
                ? `Slide ${String(slide.slide_number || 1).padStart(2, '0')} · ${slide.title || 'Discussion'}`
                : lectureTitle || 'Course Voice Session'}
            </h4>
          </div>
        </div>

        <div className="voice-drawer-controls">
          {slide && ttsSupported && (
            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={handleReadSlideAloud}
            >
              {isSpeaking ? 'Stop Audio' : 'Read Slide'}
            </button>
          )}
          {ttsSupported && (
            <button
              type="button"
              className={`voice-pill-toggle ${autoSpeak ? 'on' : ''}`}
              onClick={() => {
                if (autoSpeak && isSpeaking) {
                  stopSpeaking();
                  setIsSpeaking(false);
                }
                setAutoSpeak((v) => !v);
              }}
              title="Automatically read AI replies aloud"
            >
              {autoSpeak ? 'Voice On' : 'Muted'}
            </button>
          )}
          {onClose && (
            <button type="button" className="icon-button" onClick={onClose} title="Close Voice Chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="voice-turns-list">
        {turns.length === 0 ? (
          <div className="voice-empty-prompt">
            <div className={`voice-orb ${isListening ? 'listening' : isSpeaking ? 'speaking' : ''}`} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
              </svg>
            </div>
            <p>
              {isListening
                ? 'Listening… ask a question about this slide.'
                : 'Tap the mic to ask a question aloud or read this slide.'}
            </p>
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className={`voice-turn ${turn.sender}`}>
              <div className="voice-turn-meta">
                <span>{turn.sender === 'user' ? 'You' : 'Tutor Voice'}</span>
                {turn.sender === 'assistant' && ttsSupported && (
                  <button
                    type="button"
                    className="voice-replay-btn"
                    onClick={() => handleSpeak(turn.text)}
                  >
                    Listen
                  </button>
                )}
              </div>
              <div className="voice-turn-body">
                {turn.sender === 'user' ? turn.text : <ReactMarkdown>{turn.text}</ReactMarkdown>}
              </div>
              {turn.sources?.length > 0 && (
                <div className="voice-turn-sources">
                  {turn.sources.map((src, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="wb-cit-pill"
                      onClick={() => {
                        if (onOpenCitation) {
                          onOpenCitation({
                            chunk: turn.chunks?.[idx] || turn.chunks?.[0] || null,
                            sourceTitle: src,
                          });
                        }
                      }}
                    >
                      {src}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {isSending && <div className="voice-turn assistant sending">Synthesizing grounded answer…</div>}
        <div ref={endRef} />
      </div>

      {voiceNotice && <p className="voice-notice-bar">{voiceNotice}</p>}

      <form
        className="voice-composer-bar"
        onSubmit={(e) => {
          e.preventDefault();
          sendVoiceTurn(draftQuery);
        }}
      >
        <button
          type="button"
          className={`voice-mic-btn ${isListening ? 'listening' : ''}`}
          onClick={toggleMic}
          disabled={!courseId || isSending}
          title={micSupported ? (isListening ? 'Stop listening' : 'Speak question') : 'Voice input unavailable'}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" />
          </svg>
          <span>{isListening ? 'Listening…' : 'Speak'}</span>
        </button>
        <input
          type="text"
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          placeholder={isListening ? 'Capturing your voice…' : 'Or type a slide question…'}
          disabled={isSending}
        />
        <button
          type="submit"
          className="button button-primary button-sm"
          disabled={!draftQuery.trim() || !courseId || isSending}
        >
          Send
        </button>
      </form>
    </section>
  );
}
