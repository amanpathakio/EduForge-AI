/**
 * EduForge AI API Service
 */

// In local Vite development, use the same-origin proxy configured in
// vite.config.js. It avoids browser CORS/network differences between
// localhost and 127.0.0.1. Production uses the explicitly configured API or the live Render backend.
const DEFAULT_API_BASE = 'https://eduforge-ai-mvkk.onrender.com';
const API_BASE_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE);
import { getAccessToken } from '../lib/auth';

async function authHeaders(extra = {}) {
  const token = getAccessToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers: await authHeaders(options.headers || {}) });
}

export const API_HEALTH = `${API_BASE_URL}/status`;
export const API_UPLOAD = `${API_BASE_URL}/documents/upload`;
export const API_CHAT = `${API_BASE_URL}/chat`;

/**
 * Check backend health, vector store chunk count, and Gemini API key status.
 * Uses /status (with /status/live, /health fallbacks) to avoid ad blocker ERR_BLOCKED_BY_CLIENT on /health.
 */
export async function checkSystemHealth() {
  // 1. Try /status
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE_URL}/status`, { headers });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // try fallback
  }

  // 2. Try public /status/live
  try {
    const response = await fetch(`${API_BASE_URL}/status/live`);
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // try legacy fallback
  }

  // 3. Try legacy /health
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE_URL}/health`, { headers });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // try legacy /health/live
  }

  // 4. Try legacy /health/live
  try {
    const response = await fetch(`${API_BASE_URL}/health/live`);
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Both failed
  }

  throw new Error('Backend health check failed');
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

export async function publishLecture(lectureId) {
  const res = await apiFetch(`/lectures/${lectureId}/publish`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to publish lecture');
  }
  return res.json();
}

// ----------------- Stage 2: Course Invites & Roster -----------------
export async function joinCourseByInviteCode(code) {
  const res = await apiFetch('/courses/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Invalid or inactive course invite code');
  }
  return res.json();
}

export async function getCourseInvites(courseId) {
  const res = await apiFetch(`/courses/${courseId}/invites`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load course invite codes');
  }
  return res.json();
}

export async function createCourseInvite(courseId) {
  const res = await apiFetch(`/courses/${courseId}/invites`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate invite code');
  }
  return res.json();
}

export async function revokeCourseInvite(courseId, inviteId) {
  const res = await apiFetch(`/courses/${courseId}/invites/${inviteId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to revoke invite code');
  }
  return true;
}

export async function getCourseStudents(courseId) {
  const res = await apiFetch(`/courses/${courseId}/students`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load course roster');
  }
  return res.json();
}

export async function removeCourseStudent(courseId, userId) {
  const res = await apiFetch(`/courses/${courseId}/students/${userId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to remove student');
  }
  return true;
}

// ----------------- Video Lecture & ElevenLabs Voice Studio -----------------

export async function getAvailableVoices() {
  const res = await apiFetch('/voices');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load voices');
  }
  return res.json();
}

export async function cloneProfessorVoice(formData) {
  const token = getAccessToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE_URL}/voices/clone`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to clone professor voice');
  }
  return res.json();
}

export async function deleteClonedVoice(voiceId) {
  const res = await apiFetch(`/voices/${encodeURIComponent(voiceId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete cloned voice');
  }
  return res.json();
}

export async function getLectureVideoManifest(lectureId, voiceId = null) {
  const query = voiceId ? `?voice_id=${encodeURIComponent(voiceId)}` : '';
  const res = await apiFetch(`/lectures/${lectureId}/video-manifest${query}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load video lecture manifest');
  }
  return res.json();
}

export async function synthesizeSlideAudio(lectureId, slideId, voiceId = null) {
  const query = voiceId ? `?voice_id=${encodeURIComponent(voiceId)}` : '';
  const res = await apiFetch(`/lectures/${lectureId}/slides/${slideId}/synthesize-audio${query}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to synthesize slide audio');
  }
  return res.json();
}

export function getSlideAudioStreamUrl(lectureId, slideId, voiceId = null) {
  const token = getAccessToken();
  const params = new URLSearchParams();
  if (voiceId) params.set('voice_id', voiceId);
  if (token) params.set('token', token);
  const qs = params.toString();
  return `${API_BASE_URL}/lectures/${lectureId}/slides/${slideId}/audio${qs ? `?${qs}` : ''}`;
}

// ==================== SUPER ADMIN SERVICES ====================

export async function getAdminStats() {
  const res = await apiFetch('/admin/stats');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load administrative analytics');
  }
  return res.json();
}

export async function getAdminUsers() {
  const res = await apiFetch('/admin/users');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load user accounts');
  }
  return res.json();
}

export async function updateUserRole(userId, role) {
  const res = await apiFetch(`/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update user role');
  }
  return res.json();
}

export async function deleteUserAccount(userId) {
  const res = await apiFetch(`/admin/users/${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete user account');
  }
  return res.json();
}

export async function createAdminUser(userData) {
  const res = await apiFetch('/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to provision user account');
  }
  return res.json();
}

export async function adminResetPassword(userId, newPassword) {
  const res = await apiFetch(`/admin/users/${userId}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to reset password');
  }
  return res.json();
}

export async function upgradeUserRole(code) {
  const res = await apiFetch('/auth/upgrade-role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ educator_code: code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Invalid authorization code');
  }
  return res.json();
}
