import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import CitationBadge from './CitationBadge';
import { isSpeechSynthesisSupported, speakText, stopSpeaking } from '../lib/speech';

function findMatchedChunk(sourceStr, messageChunks = [], allChunks = []) {
  if (!sourceStr) return null;
  const normSource = sourceStr.toLowerCase().trim();
  const pool = [...(messageChunks || []), ...(allChunks || [])];

  return (
    pool.find((c) => {
      if (!c || !c.metadata) return false;
      const formatted = `${c.metadata.source_filename} — Page ${c.metadata.page_number}`.toLowerCase();
      if (formatted === normSource) return true;
      const docName = (c.metadata.source_filename || '').toLowerCase();
      const pageNum = String(c.metadata.page_number || '');
      return normSource.includes(docName) && normSource.includes(pageNum);
    }) || null
  );
}

// Clean raw trailing "Sources:" or "**Sources:**" text dump from the message bubble
// because the interactive Grounded Sources badges are already rendered below the bubble.
function cleanDisplayText(text = '') {
  if (!text) return '';
  return String(text)
    .replace(/(?:\r?\n){1,2}(?:\*{0,2}(?:Sources|References|Citations|Grounded Sources):?\*{0,2})[\s\S]*$/i, '')
    .trim();
}

export default function MessageBubble({ message, allChunks = [], onCitationClick }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  if (message.isSkeleton) {
    return (
      <div className="chat-msg assistant skeleton">
        <div className="msg-bubble">
          <div className="skeleton-line w-90"></div>
          <div className="skeleton-line w-80"></div>
          <div className="skeleton-line w-60"></div>
        </div>
      </div>
    );
  }

  const isUser = message.sender === 'user';
  const ttsSupported = isSpeechSynthesisSupported();
  const displayText = isUser ? message.text : cleanDisplayText(message.text);

  const toggleSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    speakText(displayText, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  return (
    <div className={`chat-msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="msg-bubble">
        {isUser ? (
          displayText
        ) : (
          <ReactMarkdown>{displayText}</ReactMarkdown>
        )}
      </div>

      {!isUser && ttsSupported && (
        <div className="msg-voice-row">
          <button
            type="button"
            className={`msg-speak-btn ${isSpeaking ? 'speaking' : ''}`}
            onClick={toggleSpeak}
            title={isSpeaking ? 'Stop speech' : 'Listen to AI tutor response with natural voice'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path strokeLinecap="round" d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            {isSpeaking ? 'Stop Audio' : 'Listen'}
          </button>
        </div>
      )}

      {!isUser && message.sources && message.sources.length > 0 && (
        <div className="msg-citations">
          <span className="citations-title">Grounded Sources:</span>
          <div className="citations-list">
            {message.sources.map((sourceStr, idx) => {
              const matched = findMatchedChunk(sourceStr, message.chunks, allChunks);
              return (
                <CitationBadge
                  key={idx}
                  sourceStr={sourceStr}
                  matchedChunk={matched}
                  onClick={onCitationClick}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
