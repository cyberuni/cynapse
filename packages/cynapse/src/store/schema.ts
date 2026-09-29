/**
 * The SQLite schema. Idempotent, so every open can run it.
 *
 * Entries are shared rows; read state (cursors) is a row per reader. `entry_tags`,
 * `members`, `context`, `pins`, `states` and `views` are current-state tables folded from
 * entries in the same transaction that writes the entry, so the stream stays the record.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS participants (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL,
	name TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS streams (
	id TEXT PRIMARY KEY,
	handle TEXT NOT NULL UNIQUE,
	type TEXT NOT NULL,
	title TEXT NOT NULL,
	purpose TEXT,
	parent_stream TEXT REFERENCES streams (id),
	parent_entry TEXT,
	traits TEXT NOT NULL,
	state TEXT NOT NULL,
	conventions TEXT NOT NULL,
	created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS streams_parent ON streams (parent_stream);

CREATE TABLE IF NOT EXISTS stream_handles (
	handle TEXT PRIMARY KEY,
	stream TEXT NOT NULL REFERENCES streams (id)
) STRICT;

CREATE TABLE IF NOT EXISTS entries (
	id TEXT PRIMARY KEY,
	stream TEXT NOT NULL REFERENCES streams (id),
	seq INTEGER NOT NULL,
	author TEXT NOT NULL,
	type TEXT NOT NULL,
	parent TEXT,
	root TEXT,
	refs TEXT NOT NULL,
	body TEXT NOT NULL,
	data TEXT,
	recorded_at TEXT NOT NULL,
	UNIQUE (stream, seq)
) STRICT;
CREATE INDEX IF NOT EXISTS entries_type ON entries (type);
CREATE INDEX IF NOT EXISTS entries_root ON entries (root);

CREATE TABLE IF NOT EXISTS entry_tags (
	entry TEXT NOT NULL REFERENCES entries (id),
	tag TEXT NOT NULL,
	PRIMARY KEY (entry, tag)
) STRICT;
CREATE INDEX IF NOT EXISTS entry_tags_tag ON entry_tags (tag);

CREATE TABLE IF NOT EXISTS members (
	stream TEXT NOT NULL REFERENCES streams (id),
	participant TEXT NOT NULL,
	role TEXT NOT NULL,
	PRIMARY KEY (stream, participant)
) STRICT;
CREATE INDEX IF NOT EXISTS members_participant ON members (participant);

CREATE TABLE IF NOT EXISTS cursors (
	stream TEXT NOT NULL REFERENCES streams (id),
	participant TEXT NOT NULL,
	seq INTEGER NOT NULL,
	PRIMARY KEY (stream, participant)
) STRICT;

CREATE TABLE IF NOT EXISTS context (
	stream TEXT NOT NULL REFERENCES streams (id),
	ref TEXT NOT NULL,
	PRIMARY KEY (stream, ref)
) STRICT;

CREATE TABLE IF NOT EXISTS pins (
	stream TEXT NOT NULL REFERENCES streams (id),
	entry TEXT NOT NULL REFERENCES entries (id),
	PRIMARY KEY (stream, entry)
) STRICT;

CREATE TABLE IF NOT EXISTS states (
	stream TEXT NOT NULL REFERENCES streams (id),
	key TEXT NOT NULL,
	kind TEXT NOT NULL,
	status TEXT NOT NULL,
	subject TEXT,
	entry TEXT,
	value TEXT,
	seq INTEGER NOT NULL,
	updated_at TEXT NOT NULL,
	PRIMARY KEY (stream, key)
) STRICT;

CREATE TABLE IF NOT EXISTS views (
	stream TEXT NOT NULL REFERENCES streams (id),
	name TEXT NOT NULL,
	filter TEXT NOT NULL,
	PRIMARY KEY (stream, name)
) STRICT;
`
