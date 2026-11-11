ALTER TABLE classes
    ADD COLUMN deleted_at timestamptz;

CREATE INDEX ix_classes_active_created
    ON classes (created_at, id)
    WHERE deleted_at IS NULL;
