import React from 'react';
import ReactMarkdown from 'react-markdown';
import CitationBadge from './CitationBadge';

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

export default function MessageBubble({ message, allChunks = [], onCitationClick }) {
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

  return (
    <div className={`chat-msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="msg-bubble">
        {isUser ? (
          message.text
        ) : (
          <ReactMarkdown>{message.text}</ReactMarkdown>
        )}
      </div>

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
