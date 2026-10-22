import React from 'react';
import { useState } from 'react';
import StudentQuizPlayer from '../components/StudentQuizPlayer';

export default function StudentLearningView({ courses, onOpenTutor }) {
  const [practiceCourse, setPracticeCourse] = useState(null);
  return (
    <div className="student-space">
      <section className="student-hero glass-card">
        <span className="eyebrow">STUDENT LEARNING SPACE</span>
        <h1>Study with a path, not a blank chat box.</h1>
        <p>Open a course to learn from professor-approved material, practise concepts, and use the grounded tutor when you get stuck.</p>
        <div className="student-hero-actions"><button className="button button-primary" onClick={onOpenTutor}>Ask the course tutor →</button><span>Evidence-linked explanations, not guesses.</span></div>
      </section>
      <section className="student-journey">
        <div className="student-section-heading"><div><span className="eyebrow">YOUR LEARNING LOOP</span><h2>Learn, practise, reflect</h2></div><p>Professor-approved content will appear here as it is published.</p></div>
        <div className="student-loop-grid"><article><span>01</span><h3>Learn</h3><p>Read a verified lesson or lecture draft with its supporting material.</p></article><article><span>02</span><h3>Practise</h3><p>Complete source-grounded quizzes and see explanations for every answer.</p></article><article><span>03</span><h3>Improve</h3><p>Get a clear next step based on the concepts that need more work.</p></article></div>
      </section>
      <section className="student-courses glass-card">
        <div className="student-section-heading"><div><span className="eyebrow">AVAILABLE COURSES</span><h2>Choose where to begin</h2></div></div>
        {courses.length === 0 ? <div className="student-empty"><span>⌁</span><div><h3>Your learning space will appear here.</h3><p>A professor needs to create a course and publish material first.</p></div></div> : <div className="student-course-grid">{courses.map((course) => <button key={course.id} className="student-course-card" onClick={() => setPracticeCourse(course)}><span className="student-course-icon">{course.title.slice(0, 1).toUpperCase()}</span><span><b>{course.title}</b><small>{course.document_count || 0} resources · {course.lecture_count || 0} lecture drafts</small><em>Open learning path →</em></span></button>)}</div>}
      </section>
      {practiceCourse && <StudentQuizPlayer course={practiceCourse} />}
    </div>
  );
}
