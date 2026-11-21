/**
 * Browser-native Speech Recognition & Text-to-Speech helpers for Voice Chat.
 * Leaves backend RAG and workspace logic untouched.
 */

export function isSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
}

/**
 * Strips raw citations, document references, markdown artifacts, code blocks,
 * and formatting so the AI response is spoken like a natural, conversational human tutor.
 */
export function cleanTextForSpeech(text = '') {
  if (!text) return '';
  let str = String(text);

  // 1. Completely strip trailing Sources / References / Grounded Sources block
  // e.g. "Sources:\n- Computer_Networks.pdf - Page 2"
  str = str.replace(/(?:\r?\n|\s)*(?:\*{0,2}(?:Sources|References|Citations|Grounded Sources):?\*{0,2})[\s\S]*$/i, '');

  // 2. Remove code blocks (never speak raw code brackets, braces, or syntax)
  str = str.replace(/```[\s\S]*?```/g, ' as outlined in the code snippet. ');

  // 3. Remove inline backticks
  str = str.replace(/`([^`]+)`/g, '$1');

  // 4. Remove Markdown links [text](url) -> text
  str = str.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 5. Remove citations like [1], [2], (Page 4), [Page 4], (Source: ...)
  str = str.replace(/\[\d+\]/g, '');
  str = str.replace(/\((?:Page|Source)\s*\d+[^)]*\)/gi, '');
  str = str.replace(/\[(?:Page|Source)\s*\d+[^\]]*\]/gi, '');

  // 6. Remove Markdown headers (#, ##, ###)
  str = str.replace(/^#{1,6}\s+/gm, '');

  // 7. Remove bold / italics (*, **, _, __)
  str = str.replace(/\*\*([^*]+)\*\*/g, '$1');
  str = str.replace(/\*([^*]+)\*/g, '$1');
  str = str.replace(/__([^_]+)__/g, '$1');

  // 8. Replace underscores in filenames or technical terms with spaces
  // so "Computer_Networks_Notes" is spoken as "Computer Networks Notes", not "Computer underscore Networks"
  str = str.replace(/_/g, ' ');

  // 9. Clean bullet points (- , * , • ) into smooth natural punctuation for conversational pauses
  str = str.replace(/^\s*[-*•]\s+/gm, '');

  // 10. Replace em-dashes and long hyphens with natural pause commas
  str = str.replace(/\s*[—–]\s*/g, ', ');

  // 11. Remove table formatting pipes
  str = str.replace(/\|/g, ' ');

  // 12. Remove HTML tags if any
  str = str.replace(/<[^>]+>/g, '');

  // 13. Normalize whitespace
  str = str.replace(/\s+/g, ' ').trim();

  return str;
}

/**
 * Selects the highest quality natural human voice available in the browser.
 * Prioritizes Microsoft Natural/Neural online voices and Google Assistant voices
 * over legacy 1990s robotic SAPI5 desktop synthesizers (like Microsoft David/Mark).
 */
export function getBestNaturalVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (!voices.length) return null;

  // 1. Natural / Neural online voices (Edge & Chrome broadcast-quality neural voices)
  const natural = voices.find(
    (v) =>
      v.lang?.toLowerCase().startsWith('en') &&
      (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Online'))
  );
  if (natural) return natural;

  // 2. High-grade platform voices (Google US English, Apple Samantha/Daniel/Siri)
  const highQuality = voices.find(
    (v) =>
      v.lang?.toLowerCase().startsWith('en') &&
      (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Karen'))
  );
  if (highQuality) return highQuality;

  // 3. Modern desktop voices that are NOT the old SAPI5 robotic David/Mark/Zira
  const modern = voices.find(
    (v) =>
      v.lang?.toLowerCase().startsWith('en') &&
      !v.name.includes('Desktop') &&
      !v.name.toLowerCase().includes('david') &&
      !v.name.toLowerCase().includes('mark') &&
      !v.name.toLowerCase().includes('zira')
  );
  if (modern) return modern;

  // 4. Fallback: Any English voice
  return voices.find((v) => v.lang?.toLowerCase().startsWith('en')) || voices[0] || null;
}

// Warm up voice cache in Chromium/Edge
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    getBestNaturalVoice();
  };
}

export function stopSpeaking() {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore synthesis cancel errors on inactive contexts
  }
}

export function speakText(text, { onStart, onEnd, onError, rate = 1.0 } = {}) {
  if (!isSpeechSynthesisSupported()) {
    if (onError) onError(new Error('Text-to-speech is not supported in this browser.'));
    return false;
  }

  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) {
    if (onEnd) onEnd();
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(cleaned);
    utterance.rate = rate; // 1.0 = crisp, conversational human speed
    utterance.pitch = 1.0;

    const voice = getBestNaturalVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || 'en-US';
    }

    utterance.onstart = () => {
      if (onStart) onStart();
    };
    utterance.onend = () => {
      if (onEnd) onEnd();
    };
    utterance.onerror = (ev) => {
      // Don't treat user-initiated stop or browser cancellation as an error
      if (ev.error !== 'interrupted' && ev.error !== 'canceled') {
        if (onError) onError(ev);
      }
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    if (onError) onError(err);
    if (onEnd) onEnd();
    return false;
  }
}

export function startVoiceListening({ onInterim, onResult, onError, onEnd, lang = 'en-US' } = {}) {
  const RecognitionCtor =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  if (!RecognitionCtor) {
    if (onError) {
      onError('Voice input requires Chrome, Edge, or Safari speech support. You can still type below and hear voice replies.');
    }
    if (onEnd) onEnd();
    return { stop: () => {} };
  }

  const recognition = new RecognitionCtor();
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const piece = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) {
        finalTranscript += `${piece} `;
      } else {
        interim += piece;
      }
    }
    const combined = `${finalTranscript}${interim}`.trim();
    if (onInterim && combined) {
      onInterim(combined);
    }
  };

  recognition.onerror = (event) => {
    const code = event?.error || 'audio-error';
    if (code === 'no-speech') {
      if (onError) onError('No speech detected. Tap the mic and speak clearly.');
    } else if (code === 'not-allowed' || code === 'service-not-allowed') {
      if (onError) onError('Microphone permission was blocked. Allow mic access or type below.');
    } else if (code !== 'aborted') {
      if (onError) onError(`Voice capture error (${code}).`);
    }
  };

  recognition.onend = () => {
    const cleanFinal = finalTranscript.trim();
    if (cleanFinal && onResult) {
      onResult(cleanFinal);
    }
    if (onEnd) onEnd();
  };

  try {
    recognition.start();
  } catch (err) {
    if (onError) onError(err?.message || 'Unable to start voice recognition.');
    if (onEnd) onEnd();
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors if already ended
      }
    },
  };
}
