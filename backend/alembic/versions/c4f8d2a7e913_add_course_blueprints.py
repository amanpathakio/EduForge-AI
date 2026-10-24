"""add materialized course architect blueprints

Revision ID: c4f8d2a7e913
Revises: b7e4a1d9c228
"""
from alembic import op
import sqlalchemy as sa

revision = "c4f8d2a7e913"
down_revision = "b7e4a1d9c228"
branch_labels = None
depends_on = None

def upgrade():
    inspector = sa.inspect(op.get_bind())
    op.create_table("course_blueprints", sa.Column("id", sa.String(36), primary_key=True), sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False), sa.Column("agent_run_id", sa.String(36), sa.ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True), sa.Column("title", sa.String(255), nullable=False), sa.Column("summary", sa.Text(), nullable=True), sa.Column("status", sa.String(24), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_course_blueprints_course_id", "course_blueprints", ["course_id"]); op.create_index("ix_course_blueprints_agent_run_id", "course_blueprints", ["agent_run_id"])
    op.create_table("course_modules", sa.Column("id", sa.String(36), primary_key=True), sa.Column("blueprint_id", sa.String(36), sa.ForeignKey("course_blueprints.id", ondelete="CASCADE"), nullable=False), sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False), sa.Column("position", sa.Integer(), nullable=False), sa.Column("title", sa.String(255), nullable=False), sa.Column("objective", sa.Text(), nullable=False), sa.Column("evidence_pages", sa.JSON(), nullable=False), sa.Column("status", sa.String(24), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_course_modules_blueprint_id", "course_modules", ["blueprint_id"]); op.create_index("ix_course_modules_course_id", "course_modules", ["course_id"])
    op.add_column("lectures", sa.Column("module_id", sa.String(36), nullable=True)); op.create_index("ix_lectures_module_id", "lectures", ["module_id"])
    # Earlier development databases created quiz tables through create_all(). A clean
    # Alembic database needs them explicitly before the architect can create drafts.
    if "quizzes" not in inspector.get_table_names():
        op.create_table("quizzes", sa.Column("id", sa.String(36), primary_key=True), sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False), sa.Column("module_id", sa.String(36), nullable=True), sa.Column("title", sa.String(255), nullable=False), sa.Column("status", sa.String(24), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
        op.create_index("ix_quizzes_course_id", "quizzes", ["course_id"]); op.create_index("ix_quizzes_module_id", "quizzes", ["module_id"])
        op.create_table("quiz_questions", sa.Column("id", sa.String(36), primary_key=True), sa.Column("quiz_id", sa.String(36), sa.ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False), sa.Column("position", sa.Integer(), nullable=False), sa.Column("prompt", sa.Text(), nullable=False), sa.Column("options", sa.JSON(), nullable=False), sa.Column("correct_option", sa.Integer(), nullable=False), sa.Column("explanation", sa.Text(), nullable=False), sa.Column("learning_objective", sa.String(255), nullable=True), sa.Column("source_chunk_id", sa.String(100), nullable=True), sa.Column("source_page", sa.Integer(), nullable=True)); op.create_index("ix_quiz_questions_quiz_id", "quiz_questions", ["quiz_id"])
        op.create_table("quiz_attempts", sa.Column("id", sa.String(36), primary_key=True), sa.Column("question_id", sa.String(36), sa.ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False), sa.Column("learner_id", sa.String(100), nullable=False), sa.Column("selected_option", sa.Integer(), nullable=False), sa.Column("is_correct", sa.Boolean(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)); op.create_index("ix_quiz_attempts_question_id", "quiz_attempts", ["question_id"]); op.create_index("ix_quiz_attempts_learner_id", "quiz_attempts", ["learner_id"])
    else:
        op.add_column("quizzes", sa.Column("module_id", sa.String(36), nullable=True)); op.create_index("ix_quizzes_module_id", "quizzes", ["module_id"])

def downgrade():
    op.drop_index("ix_quizzes_module_id", table_name="quizzes"); op.drop_column("quizzes", "module_id")
    op.drop_index("ix_lectures_module_id", table_name="lectures"); op.drop_column("lectures", "module_id")
    op.drop_table("course_modules"); op.drop_table("course_blueprints")
