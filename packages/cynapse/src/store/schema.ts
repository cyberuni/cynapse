import type { Migration } from './migrate.js'

/**
 * The SQLite schema, as an ordered list of forward migrations. The database records how
 * many have run in `PRAGMA user_version`; `migrate` runs the rest when the store opens.
 *
 * Entries are shared rows; read state (cursors) is a row per reader. `entry_tags`,
 * `members`, `context`, `pins`, `states` and `views` are current-state tables folded from
 * entries in the same transaction that writes the entry, so the channel stays the record.
 *
 * To change the schema, append a migration; never edit one that has shipped, because
 * databases already past it will not run it again. A step is SQL, or a function given the
 * database for work SQL cannot express. Every pending step runs in one transaction, so a
 * step must not begin or commit its own. Then add a test in `migrate.test.ts` that opens a
 * database at the previous version, with rows in it, and checks what the step did to them.
 */
export const MIGRATIONS: readonly Migration[] = [
	// 1: the schema as it stood before versioning. `IF NOT EXISTS` lets it adopt those
	// databases, which have these tables at `user_version` 0.
	`
CREATE TABLE IF NOT EXISTS participants (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL,
	name TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS channels (
	id TEXT PRIMARY KEY,
	handle TEXT NOT NULL UNIQUE,
	type TEXT NOT NULL,
	title TEXT NOT NULL,
	purpose TEXT,
	parent_channel TEXT REFERENCES channels (id),
	parent_entry TEXT,
	traits TEXT NOT NULL,
	state TEXT NOT NULL,
	conventions TEXT NOT NULL,
	created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS channels_parent ON channels (parent_channel);

CREATE TABLE IF NOT EXISTS channel_handles (
	handle TEXT PRIMARY KEY,
	channel TEXT NOT NULL REFERENCES channels (id)
) STRICT;

CREATE TABLE IF NOT EXISTS entries (
	id TEXT PRIMARY KEY,
	channel TEXT NOT NULL REFERENCES channels (id),
	seq INTEGER NOT NULL,
	author TEXT NOT NULL,
	type TEXT NOT NULL,
	parent TEXT,
	root TEXT,
	refs TEXT NOT NULL,
	-- the tags given at write time, sorted; the current set is in entry_tags
	tags TEXT NOT NULL,
	body TEXT NOT NULL,
	data TEXT,
	recorded_at TEXT NOT NULL,
	UNIQUE (channel, seq)
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
	channel TEXT NOT NULL REFERENCES channels (id),
	participant TEXT NOT NULL,
	role TEXT NOT NULL,
	PRIMARY KEY (channel, participant)
) STRICT;
CREATE INDEX IF NOT EXISTS members_participant ON members (participant);

CREATE TABLE IF NOT EXISTS cursors (
	channel TEXT NOT NULL REFERENCES channels (id),
	participant TEXT NOT NULL,
	seq INTEGER NOT NULL,
	PRIMARY KEY (channel, participant)
) STRICT;

CREATE TABLE IF NOT EXISTS context (
	channel TEXT NOT NULL REFERENCES channels (id),
	ref TEXT NOT NULL,
	PRIMARY KEY (channel, ref)
) STRICT;

CREATE TABLE IF NOT EXISTS pins (
	channel TEXT NOT NULL REFERENCES channels (id),
	entry TEXT NOT NULL REFERENCES entries (id),
	PRIMARY KEY (channel, entry)
) STRICT;

CREATE TABLE IF NOT EXISTS states (
	channel TEXT NOT NULL REFERENCES channels (id),
	key TEXT NOT NULL,
	kind TEXT NOT NULL,
	status TEXT NOT NULL,
	subject TEXT,
	entry TEXT,
	value TEXT,
	seq INTEGER NOT NULL,
	updated_at TEXT NOT NULL,
	PRIMARY KEY (channel, key)
) STRICT;

CREATE TABLE IF NOT EXISTS views (
	channel TEXT NOT NULL REFERENCES channels (id),
	name TEXT NOT NULL,
	filter TEXT NOT NULL,
	PRIMARY KEY (channel, name)
) STRICT;
`,
]

/** The version a database is at once every migration has run. */
export const SCHEMA_VERSION = MIGRATIONS.length
