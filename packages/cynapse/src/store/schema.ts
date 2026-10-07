import { randomUUID } from 'node:crypto'
import { uuidv7 } from '../ids.js'
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
	// 2: the store-wide change token (ADR-0013, need 10). `store_clock` holds one row: the
	// store's own id, which a token carries so a token from another store is refused, and
	// `change`, bumped by every append. `channels.change` is the value at the channel's last
	// append, so `changes(since)` is a range read on its index. Existing channels are
	// numbered 1..n by their latest entry, and the clock starts at n, so the first
	// `changes()` after the upgrade sees every channel that has entries.
	(db) => {
		db.exec(`
CREATE TABLE store_clock (
	singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
	store TEXT NOT NULL,
	change INTEGER NOT NULL
) STRICT;
ALTER TABLE channels ADD COLUMN change INTEGER NOT NULL DEFAULT 0;
UPDATE channels SET change = ranked.n
FROM (
	SELECT channel, ROW_NUMBER() OVER (ORDER BY MAX(recorded_at), channel) AS n FROM entries GROUP BY channel
) AS ranked
WHERE ranked.channel = channels.id;
CREATE INDEX channels_change ON channels (change);
`)
		db.prepare(
			'INSERT INTO store_clock (singleton, store, change) VALUES (1, ?, (SELECT COALESCE(MAX(change), 0) FROM channels))',
		).run(randomUUID())
	},
	// 3: channel kinds and subject keys (ADR-0012). Every channel so far is a work channel
	// with no owner. `channel_subjects` holds a channel's keys: the one its id was derived
	// from, then the aliases a move adds, in rowid order.
	`
ALTER TABLE channels ADD COLUMN kind TEXT NOT NULL DEFAULT 'work' CHECK (kind IN ('address', 'work'));
ALTER TABLE channels ADD COLUMN owner TEXT;

CREATE TABLE channel_subjects (
	store TEXT NOT NULL,
	native_id TEXT NOT NULL,
	channel TEXT NOT NULL REFERENCES channels (id),
	PRIMARY KEY (store, native_id)
) STRICT;
CREATE INDEX channel_subjects_channel ON channel_subjects (channel);
`,
	// 4: the participant registry (ADR-0013, needs 1 and 8). A registered participant has the
	// `key` its id was derived from and the unit that registered it. Every participant so far
	// is live, with no key: it keeps working and resolves by name, but has no address channel.
	`
ALTER TABLE participants ADD COLUMN key TEXT;
ALTER TABLE participants ADD COLUMN status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'retired'));
ALTER TABLE participants ADD COLUMN registered_by TEXT;
CREATE UNIQUE INDEX participants_key ON participants (key);
CREATE INDEX participants_name ON participants (name);
CREATE INDEX participants_registered_by ON participants (registered_by);
`,
	// 5: deleted entries (ADR-0014). A deleted entry keeps its row, with its content erased, as
	// a tombstone: `seq` is never reused and replies still resolve their parent and root.
	`
ALTER TABLE entries ADD COLUMN deleted_at TEXT;
ALTER TABLE entries ADD COLUMN deleted_by TEXT;
`,
	// 6: the owner of an address channel is a member of it, with role `owner`, so the channel
	// counts in the owner's unread. Each backfilled membership is logged as
	// `cynapse.member.joined`, by the author who created the channel, as creating it does now.
	(db) => {
		const missing = db
			.prepare(
				`SELECT c.id AS channel, c.owner AS owner,
					(SELECT e.author FROM entries e WHERE e.channel = c.id ORDER BY e.seq LIMIT 1) AS author
				FROM channels c
				WHERE c.kind = 'address' AND c.owner IS NOT NULL
					AND NOT EXISTS (SELECT 1 FROM members m WHERE m.channel = c.id AND m.participant = c.owner)
				ORDER BY c.created_at, c.id`,
			)
			.all() as { channel: string; owner: string; author: string | null }[]
		const join = db.prepare(
			`INSERT INTO members (channel, participant, role) VALUES (?, ?, 'owner')
			ON CONFLICT (channel, participant) DO UPDATE SET role = excluded.role`,
		)
		const log = db.prepare(
			`INSERT INTO entries (id, channel, seq, author, type, refs, tags, body, data, recorded_at)
			VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM entries WHERE channel = ?2), ?, 'cynapse.member.joined',
				'[]', '[]', '', ?, ?)`,
		)
		const tick = db.prepare('UPDATE store_clock SET change = change + 1')
		const touch = db.prepare('UPDATE channels SET change = (SELECT change FROM store_clock) WHERE id = ?')
		for (const { channel, owner, author } of missing) {
			join.run(channel, owner)
			const data = JSON.stringify({ participant: owner, role: 'owner' })
			log.run(uuidv7(), channel, author ?? owner, data, new Date().toISOString())
			tick.run()
			touch.run(channel)
		}
	},
]

/** The version a database is at once every migration has run. */
export const SCHEMA_VERSION = MIGRATIONS.length
