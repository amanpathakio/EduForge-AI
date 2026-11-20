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

export function cleanTextForSpeech(text = '') {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    utterance.rate = rate;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices?.() || [];
    const preferred =
      voices.find((v) => v.lang?.startsWith('en') && v.localService) ||
      voices.find((v) => v.lang?.startsWith('en')) ||
      null;
    if (preferred) {
      utterance.voice = preferred;
    }

    utterance.onstart = () => {
      if (onStart) onStart();
    };
    utterance.onend = () => {
      if (onEnd) onEnd();
    };
    utterance.onerror = (ev) => {
      if (onError) onError(ev);
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
