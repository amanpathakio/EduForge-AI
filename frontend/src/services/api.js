/**
 * EduForge AI API Service
 */

// In local Vite development, use the same-origin proxy configured in
// vite.config.js. It avoids browser CORS/network differences between
// localhost and 127.0.0.1. Production uses the explicitly configured API.
const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');
import { supabase } from '../lib/supabase';

async function authHeaders(extra = {}) {
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  return data.session?.access_token ? { ...extra, Authorization: `Bearer ${data.session.access_token}` } : extra;
}

async function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers: await authHeaders(options.headers || {}) });
}

export const API_HEALTH = `${API_BASE_URL}/health`;
export const API_UPLOAD = `${API_BASE_URL}/documents/upload`;
export const API_CHAT = `${API_BASE_URL}/chat`;

/**
 * Check backend health, vector store chunk count, and Gemini API key status.
 */
export async function checkSystemHealth() {
  // Header liveness must not depend on an expiring user session. Detailed
  // /health diagnostics remain authenticated on the backend. Deliberately
  // bypass authHeaders here so a damaged local session cannot imply an outage.
  const response = await fetch(`${API_BASE_URL}/health/live`);
  if (!response.ok) {
    throw new Error(`Health check returned status ${response.status}`);
  }
  return response.json();
}

/**
 * Upload a PDF document to the RAG pipeline with upload progress tracking.
 * @param {File} file - PDF file to upload
 * @param {Function} onProgress - Callback receiving percentage (0-100)
 * @returns {Promise<Object>} Backend upload and indexing response
 */
export function uploadDocument(file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percentage = Math.round((e.loaded / e.total) * 100);
        // Leave margin for backend chunking & vector indexing
        const displayPercent = Math.min(percentage, 95);
        onProgress(displayPercent);
      }
    });

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (onProgress) onProgress(100);
            resolve(data);
          } catch {
            resolve({ status: 'success' });
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.detail || 'Failed to process document'));
          } catch {
            reject(new Error(`Upload failed with HTTP status ${xhr.status}`));
          }
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network transport error during upload'));

    xhr.open('POST', API_UPLOAD, true);
    xhr.send(formData);
  });
}

/**
 * Send a question to the course RAG tutor endpoint.
 * @param {string} questionText - User's question
 * @returns {Promise<Object>} { question, answer, sources, retrieved_chunks }
 */
export async function sendChatMessage(questionText) {
  const response = await apiFetch('/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question: questionText }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || 'RAG engine failed to generate answer');
  }

  return response.json();
}

// ----------------- Course API -----------------

export async function getCourses() {
  const res = await apiFetch('/courses');
  if (!res.ok) throw new Error('Failed to load courses');
  return res.json();
}

export async function getCourse(courseId) {
  const res = await apiFetch(`/courses/${courseId}`);
  if (!res.ok) throw new Error(`Failed to load course ${courseId}`);
  return res.json();
}

export async function createCourse(data) {
  const res = await apiFetch('/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create course');
  }
  return res.json();
}

export async function updateCourse(courseId, data) {
  const res = await apiFetch(`/courses/${courseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update course');
  return res.json();
}

export async function deleteCourse(courseId) {
  const res = await apiFetch(`/courses/${courseId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete course');
  return true;
}

export async function getCourseDocuments(courseId) {
  const res = await apiFetch(`/courses/${courseId}/documents`);
  if (!res.ok) throw new Error('Failed to load course documents');
  return res.json();
}

export function uploadCourseDocument(courseId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percentage = Math.round((e.loaded / e.total) * 100);
        const displayPercent = Math.min(percentage, 95);
        onProgress(displayPercent);
      }
    });

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (onProgress) onProgress(100);
            resolve(data);
          } catch {
            resolve({ status: 'success' });
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.detail || 'Failed to process document'));
          } catch {
            reject(new Error(`Upload failed with HTTP status ${xhr.status}`));
          }
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network transport error during upload'));
    (async () => { xhr.open('POST', `${API_BASE_URL}/courses/${courseId}/documents/upload`, true); const headers = await authHeaders(); if (headers.Authorization) xhr.setRequestHeader('Authorization', headers.Authorization); xhr.send(formData); })();
  });
}

export async function sendCourseChatMessage(courseId, messageText, topK) {
  const res = await apiFetch(`/courses/${courseId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: messageText, top_k: topK }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Course tutor failed to generate answer');
  }

  return res.json();
}

// ----------------- Lecture Studio API -----------------

export async function getCourseLectures(courseId) {
  const res = await apiFetch(`/courses/${courseId}/lectures`);
  if (!res.ok) throw new Error('Failed to load course lectures');
  return res.json();
}

export async function generateCourseLecture(courseId, lectureConfig) {
  const res = await apiFetch(`/courses/${courseId}/lectures/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lectureConfig),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate lecture');
  }

  return res.json();
}

export async function getLecture(lectureId) {
  const res = await apiFetch(`/lectures/${lectureId}`);
  if (!res.ok) throw new Error(`Failed to load lecture ${lectureId}`);
  return res.json();
}

export async function updateLecture(lectureId, data) {
  const res = await apiFetch(`/lectures/${lectureId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update lecture');
  return res.json();
}

export async function deleteLecture(lectureId) {
  const res = await apiFetch(`/lectures/${lectureId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete lecture');
  return true;
}

export async function updateLectureSlide(lectureId, slideId, data) {
  const res = await apiFetch(`/lectures/${lectureId}/slides/${slideId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update slide');
  return res.json();
}

export async function deleteLectureSlide(lectureId, slideId) {
  const res = await apiFetch(`/lectures/${lectureId}/slides/${slideId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete slide');
  return true;
}

// ----------------- Quiz API -----------------
export async function getCourseQuizzes(courseId) {
  const res = await apiFetch(`/courses/${courseId}/quizzes`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Could not load assessments (HTTP ${res.status}).`);
  }
  return res.json();
}

export async function createCourseQuiz(courseId, data) {
  const res = await apiFetch(`/courses/${courseId}/quizzes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to create quiz'); }
  return res.json();
}

export async function generateCourseQuiz(courseId, data) {
  const res = await apiFetch(`/courses/${courseId}/quizzes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate a quiz from this course material');
  }
  return res.json();
}

export async function publishCourseQuiz(courseId, quizId) {
  const res = await apiFetch(`/courses/${courseId}/quizzes/${quizId}/publish`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to publish quiz');
  return res.json();
}

export async function getPublishedCourseQuizzes(courseId) {
  const res = await apiFetch(`/courses/${courseId}/quizzes/published`);
  if (!res.ok) throw new Error('Failed to load published quizzes');
  return res.json();
}

export async function submitQuizAttempt(courseId, quizId, questionId, data) {
  const res = await apiFetch(`/courses/${courseId}/quizzes/${quizId}/questions/${questionId}/attempts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to submit answer');
  return res.json();
}

export async function getCourseAgentRuns(courseId) {
  const res = await apiFetch(`/courses/${courseId}/agent-runs`);
  if (!res.ok) throw new Error('Failed to load agent runs');
  return res.json();
}

export async function startCourseArchitect(courseId, data) {
  const res = await apiFetch(`/courses/${courseId}/agent-runs/course-architect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Course Architect could not start'); }
  return res.json();
}

export async function getLatestCourseBlueprint(courseId) {
  const res = await apiFetch(`/courses/${courseId}/blueprints/latest`);
  if (!res.ok) throw new Error('Failed to load course blueprint');
  return res.json();
}

export async function approveCourseBlueprint(courseId, blueprintId) {
  const res = await apiFetch(`/courses/${courseId}/blueprints/${blueprintId}/approve`, { method: 'POST' });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to approve course blueprint'); }
  return res.json();
}

export async function produceBlueprintLessons(courseId, blueprintId) {
  const res = await apiFetch(`/courses/${courseId}/blueprints/${blueprintId}/produce`, { method: 'POST' });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Lesson production failed'); }
  return res.json();
}

export async function regenerateLectureSlide(lectureId, slideId, instruction) {
  const res = await apiFetch(`/lectures/${lectureId}/slides/${slideId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to regenerate slide');
  }

  return res.json();
}
