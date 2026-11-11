CREATE TABLE classes (
    id text PRIMARY KEY,
    name text NOT NULL,
    total_seats integer NOT NULL CHECK (total_seats > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE holds (
    hold_id text PRIMARY KEY,
    class_id text NOT NULL REFERENCES classes (id),
    student_id varchar(17) NOT NULL CHECK (student_id ~ '^[0-9]{17}$'),
    status text NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_holds_active_student_class
    ON holds (class_id, student_id)
    WHERE status IN ('HELD', 'CONFIRMED');

CREATE INDEX ix_holds_class_status_expiry
    ON holds (class_id, status, expires_at);

CREATE INDEX ix_holds_student_created
    ON holds (student_id, created_at DESC);
