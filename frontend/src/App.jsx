import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ApiKeyWarning from './components/ApiKeyWarning';
import SidebarNav from './components/SidebarNav';
import CitationDrawer from './components/CitationDrawer';
import LandingPage from './components/LandingPage';

// Pages
import DashboardOverview from './pages/DashboardOverview';
import CoursesView from './pages/CoursesView';
import CourseWorkspace from './pages/CourseWorkspace';
import LectureStudioView from './pages/LectureStudioView';
import DocumentsView from './pages/DocumentsView';
import StudentTutor from './pages/StudentTutor';
import StudentLearningView from './pages/StudentLearningView';

import { checkSystemHealth, getCourses, createCourse, deleteCourse, joinCourseByInviteCode } from './services/api';
import AuthScreen from './components/AuthScreen';
import { getSession, signOut, onAuthStateChange } from './lib/auth';

function parsePublicRoute(pathname) {
  const path = (pathname || '/').toLowerCase();
  if (path === '/signup' || path === '/register') return { showAuth: true, mode: 'signup' };
  if (path === '/reset' || path === '/forgot-password') return { showAuth: true, mode: 'reset' };
  if (
    path === '/login' ||
    path === '/signin' ||
    path.startsWith('/dashboard') ||
    path.startsWith('/courses') ||
    path.startsWith('/studio') ||
    path.startsWith('/documents') ||
    path.startsWith('/ask-ai') ||
    path.startsWith('/student-learning')
  ) {
    return { showAuth: true, mode: 'login' };
  }
  return { showAuth: false, mode: 'login' };
}

function getInitialTheme() {
  try {
    const stored = localStorage.getItem('eduforge-theme-v2');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Ignore storage access errors in private browsing
  }
  return 'dark';
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('eduforge-theme-v2', theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const [publicRoute, setPublicRoute] = useState(() => parsePublicRoute(window.location.pathname));
  useEffect(() => {
    const onPopState = () => setPublicRoute(parsePublicRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigatePublicAuth = useCallback((mode = 'login') => {
    const targetPath = mode === 'signup' ? '/signup' : mode === 'reset' ? '/reset' : '/login';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setPublicRoute({ showAuth: true, mode });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateBackToLanding = useCallback(() => {
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    setPublicRoute({ showAuth: false, mode: 'login' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const [session, setSession] = useState(undefined);
  useEffect(() => {
    let active = true;
    getSession().then((resolved) => {
      if (active) setSession(resolved);
    });
    const unsubscribe = onAuthStateChange((nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const currentUser = session?.user || null;
  const isEducator = currentUser?.role === 'professor' || currentUser?.role === 'admin';

  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'courses' | 'course-workspace' | 'ask-ai' | 'student-learning' | 'studio' | 'documents'
  useEffect(() => {
    if (!currentUser) return;
    if (!isEducator && ['dashboard', 'studio', 'documents'].includes(currentView)) {
      setCurrentView('student-learning');
    }
  }, [currentUser, isEducator, currentView]);
  const [healthStatus, setHealthStatus] = useState('connecting');
  const [chunkCount, setChunkCount] = useState(0);
  const [geminiConfigured, setGeminiConfigured] = useState(true);

  // Courses State
  const [courses, setCourses] = useState([]);
  const [activeCourse, setActiveCourse] = useState(null);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);

  // Active Lecture for Studio Editor
  const [activeLectureId, setActiveLectureId] = useState(null);

  // Citation Inspector State
  const [activeCitation, setActiveCitation] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await checkSystemHealth();
      setHealthStatus('online');
      if (typeof data.total_indexed_chunks === 'number') setChunkCount(data.total_indexed_chunks);
      if (typeof data.gemini_api_key_configured === 'boolean') setGeminiConfigured(data.gemini_api_key_configured);
    } catch (error) {
      console.warn('Backend health check error:', error.message);
      setHealthStatus('offline');
    }
  }, []);

  const fetchCourses = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setIsLoadingCourses(true);
      const data = await getCourses();
      setCourses(data);
      setActiveCourse((prev) => {
        if (!prev) return null;
        return data.find((c) => c.id === prev.id) || prev;
      });
    } catch (err) {
      console.warn('Failed to fetch courses:', err);
    } finally {
      if (showLoading) setIsLoadingCourses(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.access_token) return undefined;
    fetchHealth();
    fetchCourses(true);
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [fetchHealth, fetchCourses, session]);

  const handleCreateCourse = async (newCourseData) => {
    const created = await createCourse(newCourseData);
    await fetchCourses();
    setActiveCourse(created);
    setCurrentView('course-workspace');
    return created;
  };

  const handleJoinCourse = async (inviteCode) => {
    const joined = await joinCourseByInviteCode(inviteCode);
    await fetchCourses();
    setActiveCourse(joined);
    setCurrentView('course-workspace');
    return joined;
  };

  const handleDeleteCourse = async (courseId) => {
    await deleteCourse(courseId);
    if (activeCourse && activeCourse.id === courseId) {
      setActiveCourse(null);
      if (currentView === 'course-workspace') setCurrentView('courses');
    }
    await fetchCourses();
  };

  const handleOpenCourse = (course) => {
    setActiveCourse(course);
    setCurrentView('course-workspace');
  };

  const handleOpenStudioForCourse = (course, lectureId = null) => {
    setActiveCourse(course);
    setActiveLectureId(lectureId);
    setCurrentView('studio');
  };

  const handleOpenLecture = (lectureId, course) => {
    if (course) setActiveCourse(course);
    setActiveLectureId(lectureId);
    setCurrentView('studio');
  };

  const handleOpenCitation = useCallback((citationData) => {
    setActiveCitation(citationData);
    setIsDrawerOpen(true);
  }, []);

  const handleCloseCitation = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const handleLogout = useCallback(() => {
    signOut();
    setActiveCourse(null);
    setCurrentView('dashboard');
    navigateBackToLanding();
  }, [navigateBackToLanding]);

  // Public gate strictly after all hooks
  if (session === undefined) return null;
  if (!session?.access_token) {
    if (publicRoute.showAuth) {
      return (
        <AuthScreen
          initialMode={publicRoute.mode}
          onBackToLanding={navigateBackToLanding}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      );
    }
    return (
      <LandingPage
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenAuth={navigatePublicAuth}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Subtle Spatial Ambient Grid */}
      <div className="workspace-ambient" aria-hidden="true">
        <div className="workspace-grid-lines" />
        <div className="workspace-aura-top" />
      </div>

      {/* Warning Banner for Gemini API Key configuration */}
      <ApiKeyWarning isConfigured={geminiConfigured} />

      {/* Main Header */}
      <Header
        status={healthStatus}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        currentView={currentView}
        activeCourse={activeCourse}
        currentUser={currentUser}
      />

      {/* Primary Application Layout with Sidebar */}
      <div className="app-body-layout">
        <SidebarNav
          currentView={currentView}
          isEducator={isEducator}
          onSelectView={(viewId) => {
            setCurrentView(viewId);
            if (viewId === 'studio') {
              setActiveLectureId(null);
            }
          }}
          activeCourse={activeCourse}
          onClearActiveCourse={() => {
            setActiveCourse(null);
            if (currentView === 'course-workspace') {
              setCurrentView('courses');
            }
          }}
        />

        <main className="main-content-viewport">
          <div className="view-transition">
            {/* 1. DASHBOARD OVERVIEW */}
            {currentView === 'dashboard' && isEducator && (
              <DashboardOverview
                courses={courses}
                chunkCount={chunkCount}
                currentUser={currentUser}
                onNavigate={(viewId) => setCurrentView(viewId)}
                onOpenCourse={handleOpenCourse}
                onOpenStudio={(course) => {
                  if (course) setActiveCourse(course);
                  setActiveLectureId(null);
                  setCurrentView('studio');
                }}
              />
            )}

            {/* 2. COURSES DIRECTORY */}
            {currentView === 'courses' && (
              <CoursesView
                courses={courses}
                isLoading={isLoadingCourses}
                isEducator={isEducator}
                onOpenCourse={handleOpenCourse}
                onCreateCourse={handleCreateCourse}
                onDeleteCourse={handleDeleteCourse}
                onJoinCourse={handleJoinCourse}
              />
            )}

            {/* 3. COURSE WORKSPACE */}
            {currentView === 'course-workspace' && activeCourse && (
              <CourseWorkspace
                course={activeCourse}
                isEducator={isEducator || activeCourse.my_role === 'professor'}
                onBackToCourses={() => setCurrentView('courses')}
                onOpenStudioForCourse={(course) => handleOpenStudioForCourse(course)}
                onOpenCitation={handleOpenCitation}
                onOpenLecture={handleOpenLecture}
              />
            )}

            {/* 4. ASK AI (COURSE-GROUNDED TUTOR) */}
            {currentView === 'ask-ai' && (
              <StudentTutor
                courses={courses}
                activeCourse={activeCourse}
                isEducator={isEducator}
                onSelectCourse={(courseId) => {
                  const found = courses.find((c) => c.id === courseId);
                  if (found) setActiveCourse(found);
                }}
                chunkCount={chunkCount}
                onUploadSuccess={() => {
                  fetchHealth();
                  fetchCourses();
                }}
                onCitationClick={handleOpenCitation}
                onNavigateCourses={() => setCurrentView('courses')}
              />
            )}

            {/* 5. STUDENT LEARNING SPACE */}
            {currentView === 'student-learning' && (
              <StudentLearningView
                courses={courses}
                currentUser={currentUser}
                onOpenCourse={handleOpenCourse}
                onOpenTutor={() => setCurrentView('ask-ai')}
                onJoinCourse={handleJoinCourse}
              />
            )}

            {/* 6. LECTURE STUDIO */}
            {currentView === 'studio' && isEducator && (
              <LectureStudioView
                courses={courses}
                initialCourseId={activeCourse?.id}
                initialLectureId={activeLectureId}
                onOpenCitation={handleOpenCitation}
                onBackToCourse={() => {
                  if (activeCourse) {
                    setCurrentView('course-workspace');
                  } else {
                    setCurrentView('courses');
                  }
                }}
              />
            )}

            {/* 7. DOCUMENTS VIEW */}
            {currentView === 'documents' && isEducator && (
              <DocumentsView
                courses={courses}
                onSelectCourse={(courseId) => {
                  const found = courses.find((c) => c.id === courseId);
                  if (found) setActiveCourse(found);
                }}
                onDocumentsUpdated={() => {
                  fetchHealth();
                  fetchCourses();
                }}
              />
            )}
          </div>
        </main>
      </div>

      {/* Global Slide-out Citation Inspector Drawer Modal */}
      <CitationDrawer
        isOpen={isDrawerOpen}
        citation={activeCitation}
        onClose={handleCloseCitation}
      />
    </div>
  );
}
