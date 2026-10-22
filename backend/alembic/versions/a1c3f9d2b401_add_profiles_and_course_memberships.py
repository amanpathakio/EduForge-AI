"""add profiles, membership authorization, and course owner

Revision ID: a1c3f9d2b401
Revises: e3f9945c1953
"""
from alembic import op
import sqlalchemy as sa

revision = "a1c3f9d2b401"
down_revision = "e3f9945c1953"
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    # The guards make this safe to re-run after an interrupted SQLite migration.
    if "profiles" not in tables:
        op.create_table("profiles", sa.Column("id", sa.String(128), primary_key=True), sa.Column("email", sa.String(320), nullable=True), sa.Column("role", sa.String(24), nullable=False, server_default="student"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
        op.create_index("ix_profiles_email", "profiles", ["email"], unique=True)
    course_columns = {column["name"] for column in inspector.get_columns("courses")}
    if "owner_id" not in course_columns:
        op.add_column("courses", sa.Column("owner_id", sa.String(128), nullable=True))
    # SQLite cannot ALTER TABLE to add an FK. Batch mode rebuilds only this table,
    # copying its data, and works on PostgreSQL too.
    inspector = sa.inspect(bind)
    foreign_keys = {fk.get("name") for fk in inspector.get_foreign_keys("courses")}
    if "fk_courses_owner_id_profiles" not in foreign_keys:
        with op.batch_alter_table("courses") as batch_op:
            batch_op.create_foreign_key("fk_courses_owner_id_profiles", "profiles", ["owner_id"], ["id"], ondelete="RESTRICT")
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("courses")}
    if "ix_courses_owner_id" not in indexes:
        op.create_index("ix_courses_owner_id", "courses", ["owner_id"])
    if "course_memberships" not in sa.inspect(bind).get_table_names():
        op.create_table("course_memberships", sa.Column("id", sa.String(36), primary_key=True), sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False), sa.Column("user_id", sa.String(128), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False), sa.Column("role", sa.String(24), nullable=False, server_default="student"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("course_id", "user_id", name="uq_course_membership"))
        op.create_index("ix_course_memberships_course_id", "course_memberships", ["course_id"])
        op.create_index("ix_course_memberships_user_id", "course_memberships", ["user_id"])

def downgrade():
    op.drop_table("course_memberships")
    op.drop_index("ix_courses_owner_id", table_name="courses")
    op.drop_constraint("fk_courses_owner_id_profiles", "courses", type_="foreignkey")
    op.drop_column("courses", "owner_id")
    op.drop_table("profiles")
