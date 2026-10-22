import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ApiKeyWarning from './components/ApiKeyWarning';
import SidebarNav from './components/SidebarNav';
import CitationDrawer from './components/CitationDrawer';

// Pages
import DashboardOverview from './pages/DashboardOverview';
import CoursesView from './pages/CoursesView';
import CourseWorkspace from './pages/CourseWorkspace';
import LectureStudioView from './pages/LectureStudioView';
import DocumentsView from './pages/DocumentsView';
import StudentTutor from './pages/StudentTutor';
import StudentLearningView from './pages/StudentLearningView';

import { checkSystemHealth, getCourses, createCourse, deleteCourse } from './services/api';
import AuthScreen from './components/AuthScreen';
import { supabase, isSupabaseConfigured } from './lib/supabase';

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    if (!supabase) { setSession(null); return undefined; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'courses' | 'course-workspace' | 'ask-ai' | 'studio' | 'documents'
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
      setChunkCount(data.total_indexed_chunks || 0);
      setGeminiConfigured(Boolean(data.gemini_api_key_configured));
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
    if (isSupabaseConfigured && !session) return undefined;
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

  const handleDeleteCourse = async (courseId) => {
    await deleteCourse(courseId);
    if (activeCourse && activeCourse.id === courseId) {
      setActiveCourse(null);
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

  // This gate is intentionally after every hook: React must see the same hook
  // order before and after a user signs in or out.
  if (isSupabaseConfigured && session === undefined) return null;
  if (isSupabaseConfigured && !session) return <AuthScreen />;

  return (
    <div className="app-container">
      {/* Floating Ambient Background Blobs */}
      <div className="bg-blob blob-purple"></div>
      <div className="bg-blob blob-blue"></div>

      {/* Warning Banner for Gemini API Key configuration */}
      <ApiKeyWarning isConfigured={geminiConfigured} />

      {/* Main Header */}
      <Header status={healthStatus} onLogout={supabase ? () => supabase.auth.signOut() : undefined} />

      {/* Primary Application Layout with Sidebar */}
      <div className="app-body-layout">
        <SidebarNav
          currentView={currentView}
          onSelectView={(viewId) => {
            setCurrentView(viewId);
            if (viewId === 'studio') {
              setActiveLectureId(null);
            }
          }}
          activeCourse={activeCourse}
          onClearActiveCourse={() => setActiveCourse(null)}
        />

        <main className="main-content-viewport">
          <div className="view-transition">
          {/* 1. DASHBOARD OVERVIEW */}
          {currentView === 'dashboard' && (
            <DashboardOverview
              courses={courses}
              chunkCount={chunkCount}
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
              onOpenCourse={handleOpenCourse}
              onCreateCourse={handleCreateCourse}
              onDeleteCourse={handleDeleteCourse}
            />
          )}

          {/* 3. COURSE WORKSPACE */}
          {currentView === 'course-workspace' && activeCourse && (
            <CourseWorkspace
              course={activeCourse}
              onBackToCourses={() => setCurrentView('courses')}
              onOpenStudioForCourse={(course) => handleOpenStudioForCourse(course)}
              onOpenCitation={handleOpenCitation}
              onOpenLecture={handleOpenLecture}
            />
          )}

          {/* 4. ASK AI (STUDENT TUTOR) */}
          {currentView === 'ask-ai' && (
            <StudentTutor
              chunkCount={chunkCount}
              onUploadSuccess={fetchHealth}
              onCitationClick={handleOpenCitation}
            />
          )}

          {currentView === 'student-learning' && (
            <StudentLearningView
              courses={courses}
              onOpenCourse={handleOpenCourse}
              onOpenTutor={() => setCurrentView('ask-ai')}
            />
          )}

          {/* 5. LECTURE STUDIO */}
          {currentView === 'studio' && (
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

          {/* 6. DOCUMENTS VIEW */}
          {currentView === 'documents' && (
            <DocumentsView
              courses={courses}
              onSelectCourse={(courseId) => {
                const found = courses.find((c) => c.id === courseId);
                if (found) setActiveCourse(found);
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
