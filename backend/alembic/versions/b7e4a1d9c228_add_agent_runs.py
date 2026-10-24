"""add inspectable course architect runs

Revision ID: b7e4a1d9c228
Revises: a1c3f9d2b401
"""
from alembic import op
import sqlalchemy as sa

revision = "b7e4a1d9c228"
down_revision = "a1c3f9d2b401"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("agent_runs", sa.Column("id", sa.String(36), primary_key=True), sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False), sa.Column("initiated_by", sa.String(128), sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False), sa.Column("agent_type", sa.String(64), nullable=False), sa.Column("goal", sa.Text(), nullable=False), sa.Column("status", sa.String(24), nullable=False), sa.Column("result", sa.JSON(), nullable=True), sa.Column("error", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_agent_runs_course_id", "agent_runs", ["course_id"]); op.create_index("ix_agent_runs_initiated_by", "agent_runs", ["initiated_by"])
    op.create_table("agent_run_steps", sa.Column("id", sa.String(36), primary_key=True), sa.Column("run_id", sa.String(36), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False), sa.Column("position", sa.Integer(), nullable=False), sa.Column("tool", sa.String(64), nullable=False), sa.Column("title", sa.String(255), nullable=False), sa.Column("status", sa.String(24), nullable=False), sa.Column("detail", sa.Text(), nullable=True), sa.Column("output", sa.JSON(), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_agent_run_steps_run_id", "agent_run_steps", ["run_id"])

def downgrade():
    op.drop_table("agent_run_steps"); op.drop_table("agent_runs")
