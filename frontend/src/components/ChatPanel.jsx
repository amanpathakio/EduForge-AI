import React, { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import StarterPrompts from './StarterPrompts';
import { sendChatMessage } from '../services/api';

export default function ChatPanel({
  chunkCount = 0,
  onCitationClick,
  onOpenCitation,
  customChatSender,
  courseContext,
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [allRetrievedChunks, setAllRetrievedChunks] = useState([]);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Adjust textarea height
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    adjustTextareaHeight();
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight - 4, 100)}px`;
    }
  };

  const submitQuestion = async (question) => {
    const q = (question || inputText).trim();
    if (!q || isGenerating) return;

    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Append user message
    const userMsg = { id: `user-${Date.now()}`, sender: 'user', text: q };
    const skeletonId = `skeleton-${Date.now()}`;
    const skeletonMsg = { id: skeletonId, isSkeleton: true };

    setMessages((prev) => [...prev, userMsg, skeletonMsg]);
    setIsGenerating(true);

    try {
      const sender = customChatSender || sendChatMessage;
      const data = await sender(q);

      if (data.retrieved_chunks && data.retrieved_chunks.length > 0) {
        setAllRetrievedChunks((prev) => [...prev, ...data.retrieved_chunks]);
      }

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: data.answer,
        sources: data.sources || [],
        chunks: data.retrieved_chunks || [],
      };

      setMessages((prev) => prev.filter((m) => m.id !== skeletonId).concat(assistantMsg));
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ **Error:** ${error.message}. Please verify the backend logs and check that your Gemini API key is configured properly.`,
        sources: [],
        chunks: [],
      };
      setMessages((prev) => prev.filter((m) => m.id !== skeletonId).concat(errorMsg));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    submitQuestion();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuestion();
    }
  };

  const handleClearChat = () => {
    if (messages.length === 0) return;
    setMessages([]);
    setAllRetrievedChunks([]);
  };

  return (
    <section className="chat-panel">
      <div className="glass-card chat-card-container">
        {/* Chat Header */}
        <div className="chat-header">
          <div className="chat-header-title-wrapper">
            <h2 className="chat-title">Grounded AI Chat Tutor</h2>
            <p className="chat-subtitle">
              {courseContext ? `Grounded in "${courseContext.title}" course documents.` : 'Ask questions based on your course material.'}
            </p>
          </div>
          <button
            id="clear-chat-btn"
            className="icon-button"
            title="Clear Chat History"
            onClick={handleClearChat}
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>

        {/* Chat Message Area */}
        <div id="chat-messages" className="chat-messages-container">
          {messages.length === 0 ? (
            <div id="welcome-screen" className="welcome-screen">
              <div className="welcome-icon-container">
                <svg className="welcome-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="welcome-heading">Welcome to EduForge AI</h3>
              <p className="welcome-tagline">Your course-grounded intelligent assistant.</p>

              <div className="welcome-steps">
                <div className="step-card">
                  <span className="step-num">1</span>
                  <h4 className="step-title">Upload Materials</h4>
                  <p className="step-desc">
                    Drop a course PDF on the left. The system will extract, chunk, and embed the text.
                  </p>
                </div>
                <div className="step-card">
                  <span className="step-num">2</span>
                  <h4 className="step-title">Ask Questions</h4>
                  <p className="step-desc">
                    Type your queries. The RAG engine retrieves course content relevant to your query.
                  </p>
                </div>
                <div className="step-card">
                  <span className="step-num">3</span>
                  <h4 className="step-title">Audit Citations</h4>
                  <p className="step-desc">
                    Review the generated answer and click citation sources to inspect original text chunks.
                  </p>
                </div>
              </div>

              {/* Suggestions */}
              <StarterPrompts
                isVisible={chunkCount > 0}
                onSelectPrompt={(promptText) => submitQuestion(promptText)}
              />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  allChunks={allRetrievedChunks}
                  onCitationClick={(chunk, sourceStr) => {
                    const trigger = onOpenCitation || onCitationClick;
                    if (trigger) {
                      trigger({ chunk, sourceTitle: sourceStr });
                    }
                  }}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Chat Input Form */}
        <form id="chat-form" className="chat-input-form" onSubmit={handleFormSubmit}>
          <div className="input-wrapper">
            <textarea
              id="chat-input"
              ref={textareaRef}
              placeholder="Ask a question about the course materials..."
              rows="1"
              required
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
            <button
              type="submit"
              id="send-btn"
              className="send-button"
              disabled={!inputText.trim() || isGenerating}
            >
              <svg className="send-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M22 2L11 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 2L15 22L11 13L2 9L22 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
