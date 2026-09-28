# Evidence

Status is relative to the hypothesis: channel and DM share one model and differ mainly in name, membership rules, and discovery.

## Claim SD01

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Slack API docs — Conversation object
- URL: https://docs.slack.dev/reference/objects/conversation-object
- Type: official docs

Notes:
- Slack represents channels, private channels, DMs (`im`), and multi-person DMs (`mpim`)
  as **one object type** — the conversation object — distinguished by boolean flags:
  `is_channel`, `is_group` (legacy pre-March-2021 private channel), `is_im` ("a direct
  message between two distinguished individuals or a user and a bot"), `is_mpim` ("an
  unnamed private conversation between multiple users"), `is_private`, `is_shared`,
  `is_archived`.
- The docs explicitly say the legacy `channel`, `group`, `im`, and `mpim` object/method
  families now "reference pages are nested under this one for posterity, but they are
  all now represented by the conversation object" — i.e. a deliberate, documented
  unification onto one entity+flags model.
- Supports the "one model" half of the hypothesis at the data-model layer, but the
  presence of type-specific fields (`user` is "DM-specific") and type-gated methods
  (see SD02/SD08) shows behavior still branches heavily on type — hence "mixed" rather
  than "supports."

## Claim SD02

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Slack API docs — conversations.open method
- URL: https://docs.slack.dev/reference/methods/conversations.open
- Type: official docs

Notes:
- `conversations.open` opens or **resumes** a DM/MPIM: "When you supply user IDs via
  the `users` parameter, the API checks if a conversation with that exact membership
  already exists. If one does, it returns the existing conversation rather than
  creating a duplicate." This means a Slack DM/MPIM is uniquely keyed by its
  participant set — a structural identity rule with no channel equivalent (channels are
  named/created explicitly and never deduplicated by membership).
- User limits are hard-coded in the method: 1 user opens a 1:1 DM; the `users`
  parameter takes "1 to 8 user IDs," i.e. a group DM (MPIM) tops out at **9 total
  participants** (8 others + caller) — corroborated by independent search of Slack help
  content describing a 9-person MPDM cap.
- This membership-identity rule (dedup by participant set, fixed caller-exclusive
  `users` list) is a genuine structural difference from channels, not just a naming or
  discovery difference — it changes how the "create" operation itself behaves.

## Claim SD03

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Slack Developer Docs — Using the Conversations API
- URL: https://docs.slack.dev/apis/web-api/using-the-conversations-api
- Type: official docs

Notes:
- Official framing: "The Slack Conversations API provides you with a unified interface
  to work with all the channel-like things encountered in Slack," and "Public channels,
  private channels, DMs... They're all conversations!"
- Legacy scopes from `channels.*`, `groups.*`, `im.*`, `mpim.*` still work with the new
  unified `conversations.*` API — evidence this was a real architectural
  consolidation/migration, not just marketing language, i.e. genuinely supports "one
  model" at the API surface.

## Claim SD04

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Slack API docs — conversations.close method
- URL: https://docs.slack.dev/reference/methods/conversations.close/
- Type: official docs

Notes:
- `conversations.close` "close[s] a direct message or multi-person direct message" and
  explicitly does **not** apply to public/private channels — calling it on a channel
  returns error `method_not_supported_for_channel_type`.
- Lifecycle is structurally different: DMs/MPIMs are **closed** (hidden from the user's
  list, reopenable, history intact) while channels are **archived** (`conversations.archive`,
  a separate method) or the user **leaves** — leaving loses access to history unless
  re-added, per Slack help docs (see SD05). Close vs. archive vs. leave are three
  distinct lifecycle verbs gated by conversation type at the API level, not just UI
  wording.

## Claim SD05

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Slack Help Center — "Archive or delete a channel" / "Leave a channel"
- URL: https://slack.com/help/articles/213185307-Archive-or-delete-a-channel , https://slack.com/help/articles/201375146-Leave-a-channel
- Type: official docs (help center, not developer API reference)

Notes:
- Archiving a channel: "closed to new activity, but the message history is retained
  and searchable on paid plans."
- Leaving a conversation: "you will not be able to access the conversation history
  unless you are added back to the conversation" — same leave semantics for channels
  and closable for DMs, but the archive path (freeze-in-place, history kept, no
  membership loss) exists only for channels, per SD04.
- Confidence medium because these are help-center consumer docs, not the API
  reference; behavior is consistent with the API-level distinction in SD04.

## Claim SD06

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Slack Engineering — "Real-time Messaging"
- URL: https://slack.engineering/real-time-messaging/
- Type: engineering blog

Notes:
- Slack's real-time fan-out unit is called a "channel" at the transport layer, but the
  post defines it abstractly: "a 'channel' in this instance is an abstract term whose
  ID is assigned to an entity such as user, team, enterprise, file, huddle, or a regular
  Slack channel." DMs get channel IDs and are routed through the same consistent-hashed
  Channel Server (CS) infrastructure as ordinary channels — same delivery mechanism.
- This is evidence *against* structural difference at the fan-out/delivery layer
  specifically: Slack does NOT special-case DM delivery vs. channel delivery — both
  route through CS via consistent hashing on ID. Marked "contradicts" the broader
  hypothesis only insofar as delivery is one of the axes asked about; it actually
  *supports* the "one model" side for this one axis. (Status here reflects impact on
  the overall multi-axis hypothesis being mixed, not a contradiction of this specific
  sub-claim.)

## Claim SD07

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Slack help — mpim member limit corroboration (secondary summary of Slack help content)
- URL: https://slack.com/help/articles/1500002969782-Add-people-to-a-direct-message
- Type: official docs (help center)

Notes:
- Independent corroboration of the 9-person cap for multi-person DMs (MPDM), consistent
  with the `conversations.open` 1–8 `users` parameter limit in SD02. Retrieved via
  search summary rather than direct fetch of this exact URL — treat the specific URL
  attribution as medium confidence, but the number (9) is corroborated by two
  independent Slack sources (API method limit + help content).

## Claim SD08

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Slack Conversation object — is_im / is_mpim / is_private fields (same as SD01)
- URL: https://docs.slack.dev/reference/objects/conversation-object
- Type: official docs

Notes:
- `is_private` is true whenever `is_im` or `is_mpim` is true — DMs and MPIMs are
  structurally private by construction, with no separate "make it private" permission
  toggle the way channels have (public vs. private channel is a creation-time choice;
  DM/MPIM privacy is implied by type, not configurable).
- There is no role/permission-overwrite system on the conversation object for DMs —
  Slack has no analogue to Discord's per-channel permission overwrites; channel access
  control is coarser (public/private + workspace membership + invite), and DM access
  control is simply "being one of the fixed participants."

---

## Claim SD09

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Discord Developer Docs — Channel resource
- URL: https://docs.discord.com/developers/resources/channel
- Type: official docs

Notes:
- Discord uses one `Channel` object with a `type` enum, but the fields present differ
  sharply by type — this is the closest thing to a real test of "one entity, type flag
  only" and it fails: guild channels carry `guild_id`, `permission_overwrites`,
  `position`, `parent_id`; DM channels instead carry `recipients` (array of user
  objects) and have **no** `guild_id`, `permission_overwrites`, or `position`; Group DM
  channels carry `recipients` plus `owner_id` (id of the creator) and their own
  `name`/`icon`.
- Channel type enum confirmed: `GUILD_TEXT=0`, `DM=1`, `GUILD_VOICE=2`, `GROUP_DM=3`,
  `GUILD_CATEGORY=4`, `GUILD_ANNOUNCEMENT=5`, plus thread types `ANNOUNCEMENT_THREAD=10`,
  `PUBLIC_THREAD=11`, `PRIVATE_THREAD=12`, `GUILD_STAGE_VOICE=13`, `GUILD_DIRECTORY=14`,
  `GUILD_FORUM=15`, `GUILD_MEDIA=16`.
- Because whole field groups (permission overwrites vs. recipients/owner) are
  type-exclusive rather than universally present-but-unused, this is closer to a
  tagged-union/sum-type than a single flat record with a type flag — a genuine
  structural difference, not just naming.

## Claim SD10

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Discord Developer Docs — Permissions
- URL: https://docs.discord.com/developers/topics/permissions
- Type: official docs

Notes:
- Guild channels support **permission overwrites**: "Overwrites can be used to apply
  certain permissions to roles or members on a channel-level," with a documented
  resolution order (base guild permissions → @everyone deny → @everyone allow → role
  deny → role allow → member deny → member allow).
- The permissions docs do not address DM channels at all; DMs have no role system and
  no overwrite mechanism — access is simply membership in the fixed `recipients` list.
  This is a structural absence, not merely an unused field: the permission-overwrite
  concept doesn't apply to DMs because DMs have no roles or guild context to overwrite
  against.

## Claim SD11

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Discord Engineering blog — "How Discord Stores Billions of Messages"
- URL: https://discord.com/blog/how-discord-stores-billions-of-messages
- Type: engineering blog

Notes:
- Message storage is uniform across channel types: "all messages ... are stored in the
  same table using channel_id as the partition key," with the article stating
  "channel_id became the partition key since all queries operate on a channel." Primary
  key structure: `((channel_id, bucket), message_id)`, bucketed by time (~10 days per
  bucket to stay under 100MB per partition).
- The post does not differentiate DM vs. guild-channel storage strategy — same
  Cassandra table, same partitioning scheme, regardless of whether the channel_id
  belongs to a DM, group DM, or guild text channel. This is a clean "supports" for the
  storage axis specifically: Discord's message store treats channel_id as the only
  relevant key, agnostic to channel type.
- Note (from memory, not directly fetched, so flagged low confidence within this
  claim): Discord later blogged about migrating this store from Cassandra to ScyllaDB
  ("How Discord Migrated Trillions of Messages from Cassandra to ScyllaDB," ~2022/2023);
  I was not able to fetch that follow-up post in this session, so I cannot confirm
  whether the channel_id-keyed model was preserved unchanged in the migration. Treat
  that continuity claim as unverified.

## Claim SD12

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Discord Engineering blog — "How Discord Scaled Elixir to 5,000,000 Concurrent Users"
- URL: https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users
- Type: engineering blog

Notes:
- Real-time fan-out is architected around **guild processes**: "Users connect to a
  WebSocket and spin up a session process (a GenServer), which then communicates with
  remote Erlang nodes that contain guild processes." Presence and message fan-out for a
  guild is handled by that guild's process, and Discord built "Manifold" specifically
  to distribute fan-out work across nodes for huge guilds (e.g. a 30,000-concurrent-user
  subreddit's Discord).
- The post explicitly does **not** discuss DM or group DM delivery mechanisms — it is
  scoped entirely to guild channel fan-out. This is a gap, not a stated equivalence: I
  cannot confirm from this source whether DMs get a dedicated lightweight per-user
  delivery path or reuse guild-style fan-out (a DM/group-DM has no guild, so at minimum
  the "guild process" abstraction described cannot apply verbatim). Marked "mixed"
  because the asymmetry (guild channels definitely have a named large-scale fan-out
  problem and a bespoke solution; DMs are absent from this discussion entirely,
  suggesting they don't need one, consistent with small fixed participant counts) is
  suggestive but not confirmed by the source.

## Claim SD13

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: Discord support community posts on Group DM member limits
- URL: https://support.discord.com/hc/en-us/community/posts/360032331731-Raising-the-group-DM-member-limit-from-10-to-15
- Type: support/community (not primary engineering doc, but Discord's own support site)

Notes:
- Regular Group DMs are capped at **10 recipients**; there have been recurring user
  requests (community posts, unresolved as of this search) to raise it to 15. This is a
  hard, type-specific limit that has no channel analogue (guild channels don't have a
  small fixed member cap) — a structural/product difference in scale, not naming.
- Confidence medium: sourced from Discord's own support community rather than the
  developer API reference, which did not itself state a numeric cap (see SD09 — the
  Channel resource docs "do not specify a maximum recipient limit" in the fetched
  content).

## Claim SD14

Date: 2026-09-27
Status: mixed
Confidence: low

Source:
- Label: (memory, not fetched this session) Discord notification/mention defaults; Slack DM/channel default notification settings
- URL: n/a
- Type: memory — unverified

Notes:
- From general knowledge (not verified against a primary source in this session):
  Discord DMs notify by default for all messages from the small fixed participant set,
  while guild text channels typically default new members to "mentions only" for
  notification purposes unless changed; Slack similarly defaults DMs to always-notify
  while channel notification preferences are configurable per-channel and often default
  to less noisy settings for large/busy channels.
- This is flagged low confidence and should be independently verified against Discord's
  and Slack's notification-settings docs before being relied on in the cynapse design;
  I did not fetch a primary source for this claim in this session.

---

## Claim TR01

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Telegram API — Peer type
- URL: https://core.telegram.org/type/Peer
- Type: official docs

Notes:
- The `Peer` type has three distinct constructors: `peerUser` (`user_id:long`),
  `peerChat` (`chat_id:long`, "Group" = basic group), and `peerChannel`
  (`channel_id:long`, "Channel/supergroup").
- A private chat (DM) is addressed via `peerUser`; a basic group via `peerChat`; a
  channel or supergroup via `peerChannel`. These are three separate wire-level types
  with separate ID namespaces, not one entity with a type flag at the peer-addressing
  layer.

## Claim TR02

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Telegram API — Chat type constructors
- URL: https://core.telegram.org/type/Chat
- Type: official docs

Notes:
- `chat` (basic group) and `channel` (supergroup/broadcast channel) are separate TL
  constructors with different field sets. `channel` carries a `broadcast` flag,
  `megagroup` flag, `gigagroup` flag, `forum` flag, `monoforum` flag, plus
  `access_hash`, `usernames`, `admin_rights`, `banned_rights`, `restriction_reason`.
  `chat` carries `version`, `migrated_to`, `admin_rights`, `default_banned_rights`, no
  `access_hash`.
- So within "channels" (broadcast vs supergroup) the entity IS one constructor with a
  type flag (`megagroup`/`broadcast`/`gigagroup`/`forum`) — that part supports a
  "single model + flags" pattern. But a private chat (DM) has no `Chat`-type
  constructor at all; a 1:1 DM is not a `Chat`/`Channel` object, it's a `User` object
  addressed via `peerUser`. So DM vs group/channel is structurally distinct; within
  group/channel the flag-based model does hold.

## Claim TR03

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Telegram API — Handling Updates ("common message box" vs channel updates)
- URL: https://core.telegram.org/api/updates
- Type: official docs

Notes:
- Quote (paraphrased from fetch): private chats and basic groups of one user share
  "another common event sequence" — a single unified `pts` counter across all private
  chats and basic groups for that account, with message IDs consistent "across all
  sessions of the same account" but differing between accounts.
- Channels and supergroups each have "its own message box and its own event sequence."
  Channel message IDs are consistent across different accounts (server-assigned per
  channel), unlike common-box IDs which are account-relative.
- This is a first-class structural difference in message ID sequencing/storage: DM
  message IDs live in a per-account shared sequence; channel/supergroup message IDs
  live in a per-entity global sequence. Not just naming or membership.

## Claim TR04

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Telegram API — Handling Updates (channel difference)
- URL: https://core.telegram.org/api/updates
- Type: official docs

Notes:
- Update sync/fan-out differs by kind: private chats and basic groups use
  `updateNewMessage`/`updateEditMessage`/`updateDeleteMessages` plus the common
  `updates.getDifference` for gap recovery. Channels/supergroups use distinct update
  types (`updateNewChannelMessage`, `updateEditChannelMessage`,
  `updateDeleteChannelMessages`) and require the separate `updates.getChannelDifference`
  call, keyed by per-channel `pts`, to recover missed updates for actively-viewed
  channels — the common `getDifference` does not cover channels.
- This is a distinct sync/fan-out API surface, not just a filter on one call.

## Claim TR05

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Telegram API — Channels (member limits, migration)
- URL: https://core.telegram.org/api/channel
- Type: official docs

Notes:
- Member limits differ structurally by kind: basic groups (`chat`) max 200 members;
  supergroups (`channel` with `megagroup`) up to 200,000; gigagroups remove the
  participant cap; broadcast channels have unlimited subscribers. A 1:1 DM has exactly
  2 participants and no "member list" concept at all (no join/leave, no participant
  count field).
- Basic-group participants are fully loaded; supergroup/channel participants are
  loaded on-demand by clients (lazy pagination) — a storage/retrieval difference tied
  to scale, not just a UI choice.

## Claim TR06

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Telegram API method — messages.migrateChat
- URL: https://core.telegram.org/method/messages.migrateChat
- Type: official docs

Notes:
- Converting a basic group to a supergroup is an explicit, admin-only, irreversible
  migration API call (`messages.migrateChat`, requires `chat_id`, admin rights). The
  old `chat` object gets a `migrated_to` field pointing at a brand-new `channel`
  entity with a **new, separate ID** in a different ID space (channel IDs vs chat
  IDs). Clients must merge history from the old and new entity client-side.
- This confirms basic group and supergroup/channel are not merely a type flag on one
  row — migrating means literally creating a new entity and re-pointing history,
  because the underlying storage/ID/update-sequence model differs (per TR03/TR04).
  There is no equivalent "migrate a DM into a group" operation in the API — DMs and
  groups are not on the same migration path at all, reinforcing they are categorically
  different constructs.

## Claim TR07

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Telegram Bot API — Chat object
- URL: https://core.telegram.org/bots/api#chat
- Type: official docs

Notes:
- At the Bot API level (a higher-level, simplified API over MTProto), `Chat` IS one
  object type with a `type` field taking values `"private"`, `"group"`,
  `"supergroup"`, `"channel"` — closer to the "one entity + type flag" pattern the
  hypothesis describes, with fields conditionally present per type (`first_name`/
  `last_name` only for `private`; `is_forum` only for `supergroup`; `is_direct_messages`
  only for `channel`).
- This is a deliberate API-surface simplification bots see; it does not reflect the
  underlying MTProto storage/ID model (TR01–TR04), which is structurally split. So at
  the client-facing Bot API layer the hypothesis looks more true; at the wire/storage
  layer it does not.

## Claim TR08

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: Telegram API — Channels (permissions)
- URL: https://core.telegram.org/api/channel
- Type: official docs

Notes:
- Permission model differs by kind: basic groups have limited/coarser admin
  permissions; supergroups/channels support granular per-admin and per-user
  permissions (banned_rights/admin_rights bitmasks) plus channel-only features like
  anonymous admin posting (posting as the channel identity) and, for broadcast
  channels, restricting posting to admins only. A 1:1 DM has no admin/permission
  concept whatsoever — no roles, no bans, no granular rights object.

## Claim TR09

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Telegram API — Discussion groups
- URL: https://core.telegram.org/api/discussion
- Type: official docs

Notes:
- Broadcast-channel comments are not stored as replies on the channel itself. A
  broadcast channel is linked (`linked_chat_id`) to a separate discussion supergroup;
  every channel post is auto-forwarded into that group (pinned there), and comments
  are ordinary messages threaded under that forwarded post inside the *group* entity,
  not the channel entity. Non-members get notified of replies via a synthetic
  `@replies` pseudouser message delivered to their private-chat inbox.
- This is a distinct architectural pattern (two linked entities plus a notification
  bridge) with no DM analogue at all.

## Claim TR10

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Telegram API — End-to-end encryption (secret chats)
- URL: https://core.telegram.org/api/end-to-end
- Type: official docs

Notes:
- Secret chats are a categorically different construct from both DMs-as-cloud-chats
  and groups/channels: they are device-specific (bound to a specific authorization
  key, not a user account), strictly 1:1 only (no group secret chats), use a
  completely separate TL schema (`encryptedChat`, `decryptedMessageLayer`) with
  client-side Diffie-Hellman key exchange and AES-256, and implement Perfect Forward
  Secrecy (automatic re-keying after ~100 messages or one week). None of this applies
  to ordinary cloud DMs, groups, or channels, which are all server-side plaintext
  (to Telegram) MTProto entities.
- This shows Telegram has at least three structurally distinct messaging substrates:
  cloud DM (peerUser, common message box), cloud group/channel (peerChat/peerChannel,
  own message box), and secret chat (encryptedChat, separate schema, device-bound).

## Claim TR11

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Telegram API — Forum topics
- URL: https://core.telegram.org/api/forum
- Type: official docs

Notes:
- Forum topics are not a separate top-level entity; they are built by reusing the
  existing `channel` (megagroup) entity plus its message-threading mechanism. The
  `channel.forum` flag turns on topics; each non-General topic's ID equals the ID of
  the `messageActionTopicCreate` service message that created it, and messages in a
  topic are simply a message thread rooted at that service message (`top_msg_id`).
  The "General" topic is `id=1` and has no threading.
- This is a case where Telegram *does* build a new feature by layering on the existing
  channel/message-thread primitives rather than inventing a new entity type —
  supporting the hypothesis's spirit for feature-layering, though it is still layered
  on the channel model, not the DM model (topics don't exist for DMs).

## Claim TR12

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Reddit DM vs Chat vs Modmail (API surface comparison)
- URL: https://www.redditapis.com/blogs/reddit-dm-vs-chat-vs-modmail-when-to-use-each-api-surface
- Type: third-party technical blog (API-surface explainer, not an official Reddit
  source; treat as medium-confidence for architecture claims, high-confidence for the
  publicly observable API-shape claims like OAuth scopes and endpoint families)

Notes:
- Reddit currently exposes three distinct addressed-messaging surfaces with different
  data models: classic Private Messages (1:1, addressed by `to_username`, inbox +
  subject threading, `privatemessages` OAuth scope), Reddit Chat (now the primary
  surface for 1:1/group direct messaging, "a live thread" model, also under
  `privatemessages` scope), and Modmail (shared inbox addressed to a subreddit's
  entire mod team, `modmail` OAuth scope, conversation objects with
  archived/highlighted/assigned state — a genuinely different, richer data model than
  either PM or Chat).
- Notes a hard platform limit: bot/API accounts can join at most 300 chat rooms per
  day, a chat-specific quota with no PM equivalent — evidence chat rooms are a
  distinct resource type with their own quota system, not just a PM row with a flag.
- Caveat: this is not an official Reddit engineering source; I could not reach
  reddit.com/dev/api or redditinc.com directly (both blocked for automated fetch in
  this environment), so the underlying claims about thing types and modmail below are
  triangulated from third-party technical sources, not read first-hand from Reddit's
  own docs.

## Claim TR13

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: Reddit API fullname prefixes (aggregated from third-party API guides/SDKs,
  general web search since reddit.com/dev/api itself could not be fetched)
- URL: https://github.com/ilica/RedditApiDocumentation (community-maintained mirror of
  Reddit's official API guide content) — consulted via search snippet, not a full
  fetch
- Type: community docs mirror (secondary; not Reddit's own site)

Notes:
- Reddit's "thing" model uses type-prefixed fullnames: `t1_` comment, `t2_` account,
  `t3_` link (post), `t4_` message (private message / inbox item), `t5_` subreddit,
  `t6_` award. Comments and posts (`t1`/`t3`) live under a subreddit (`t5`) in a
  public tree; private messages (`t4`) are a structurally separate "thing" type with
  no subreddit parent, addressed user-to-user, and consumed via an inbox
  (read/unread state) rather than browsed/voted on.
- This is evidence that legacy Reddit's core data model treats subreddit content
  (channel-like, public, tree-structured, votable) and private messages (DM-like,
  private, flat, inbox-consumed) as genuinely different "thing" types at the schema
  level — closer to "distinct entities" than "one entity + flag." Confidence is
  medium only because I was not able to fetch Reddit's own dev/api page directly to
  confirm field-level detail (see Gaps).

## Claim TR14

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: Reddit Chat reverse-engineering notes (SendBird backend)
- URL: https://gist.github.com/sim642/225c44801a376e2c54e746285d4c680f
- Type: community reverse-engineering notes (secondary, unofficial)

Notes:
- Reddit Chat (as originally built, ~2018 era through the period this gist covers)
  is not Reddit's own homegrown messaging store: it proxies to a third-party vendor,
  SendBird, at `sendbird.reddit.com`, with a distinct SendBird app ID. Auth is
  two-stage: Reddit OAuth token exchanged via `/api/v1/sendbird/me` for a SendBird
  access token, then the client talks to SendBird's `GroupChannel` APIs directly.
  Reddit's `/api/v1/sendbird/config` endpoint hands back routing info (`proxy_host`).
- This means, at least historically, Reddit's Chat product ran on an entirely
  different storage/delivery system than the classic PM inbox (`t4` things) or
  subreddit content — not a type flag on the same rows, but a different vendor/
  database/protocol altogether. (I could not verify whether Reddit later migrated
  chat off SendBird onto in-house or Matrix-based infrastructure — see Gaps; the
  widely-repeated claim that Reddit chat moved to Matrix/Synapse could not be
  confirmed from any primary or credible secondary source in this session.)

## Claim TR15

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: TechCrunch — "Reddit is testing Discord-like channels for community chat"
- URL: https://techcrunch.com/2023/04/28/reddit-is-testing-discord-like-channels-for-community-chat/
- Type: tech journalism (secondary; describes an official Reddit product test, not
  itself a primary Reddit source, so treated as medium confidence)

Notes:
- Subreddit "chat channels" (2023 test, 25 volunteer subreddits under 100k members)
  are explicitly subreddit-scoped, persistent, moderator-controlled community spaces,
  described by Reddit as separate from the platform's existing direct-message system.
  Moderators get dedicated controls (participant admission, queue management, message
  moderation) not present for DMs, plus a moderator-only channel.
- This confirms channels (subreddit-scoped, many-member, moderated, discoverable via
  the subreddit) and DMs (1:1 or small private group, no moderation model, not
  discoverable) are treated as separate product/data surfaces by Reddit, consistent
  with the `t4`-message vs subreddit-content split in TR13 and the modmail-vs-PM split
  in TR12.

## Claim TR16

Date: 2026-09-27
Status: supports
Confidence: low

Source:
- Label: gHacks Tech News — Reddit chat message retention change
- URL: https://www.ghacks.net/2023/07/15/reddit-users-lose-chat-messages-before-2023-in-latest-anti-user-move/
- Type: tech journalism (secondary, low-trust for architecture detail, used only for
  the migration-cutover fact)

Notes:
- Reports Reddit migrated its chat infrastructure around June 30, 2023, and chose not
  to carry over chat history from before January 1, 2023 into the new system "to have
  a smooth and quick transition," with old data recoverable only via old.reddit.com or
  a full data export request.
- This is weak evidence of a hard storage-migration boundary (not just adding a type
  flag) — a genuine infrastructure cutover big enough to lose or strand pre-2023
  history is consistent with chat living on structurally different storage from
  whatever came before, but I could not corroborate this with an official Reddit
  source, so confidence is low and it should not be treated as confirming Matrix
  adoption or any specific target architecture.

---

## Claim AG01

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: A2A Protocol Specification
- URL: https://a2a-protocol.org/latest/specification/
- Type: spec

Notes:
- A2A does not model conversations as channels or DMs at all. Its unit of work is the **Task**
  (server-generated ID, lifecycle states like `TASK_STATE_WORKING`/`TASK_STATE_COMPLETED`/
  `TASK_STATE_FAILED`), and **Message** objects (role `user`/`agent`, `parts` for text/file/
  structured data) are turns inside a task.
- `contextId` is the grouping primitive — it "logically groups multiple related Task and
  Message objects, providing continuity across a series of interactions," analogous to a
  thread/session ID rather than a named channel or a fixed DM participant set. Spec text: "All
  tasks and messages with the same contextId SHOULD be treated as part of the same
  conversational session."
- Explicitly discourages using messages for outputs: "Messages SHOULD NOT be used to deliver
  task outputs. Results SHOULD BE returned using Artifacts associated with a Task" — a
  structured-payload/result channel distinct from the conversational turn stream.
- No group/broadcast primitive exists; updates are delivered via three mechanisms instead of a
  channel subscription model: polling (`Get Task`), streaming (`TaskStatusUpdateEvent`/
  `TaskArtifactUpdateEvent` over a persistent connection), and push notifications (server posts
  to a client-registered webhook on state change).
- Caveat: fetched the human-readable spec page via WebFetch's summarizer, not the raw spec
  text; exact schema field types should be double-checked against the JSON/proto schema in
  github.com/a2aproject if precise types are load-bearing.

## Claim AG02

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: A2A Protocol Specification — delivery mechanisms
- URL: https://a2a-protocol.org/latest/specification/
- Type: spec

Notes:
- A2A's three delivery mechanisms (poll, stream, push webhook) map directly onto the
  agent-specific "can't be interrupted mid-turn" need: an agent task runs to completion and the
  *caller* chooses how to be notified, rather than the agent being expected to watch a live feed.
  This is architecturally opposite to a channel's "subscribe and read as it scrolls" model.
- Push notifications target "client-registered webhook endpoints," i.e. wake-on-event for a
  process that may not be running, addressing durable addressing across session restarts.

## Claim AG03

Date: 2026-09-27
Status: supports (mixed — supports mail, contradicts channels)
Confidence: high

Source:
- Label: mcp_agent_mail README/repo
- URL: https://github.com/Dicklesworthstone/mcp_agent_mail
- Type: source code / project docs

Notes:
- Explicitly a "mail-like coordination layer," not a channel system: "The design uses
  point-to-point messaging between named agents rather than named channels. All communication
  is explicitly addressed and threaded rather than broadcast-oriented."
- Pull-based retrieval: agents call `fetch_inbox()` to retrieve pending messages — no push;
  matches the "agents poll or get woken" need rather than mid-turn interruption.
- Mail fields mirror human email closely: sender, To/Cc/Bcc, `thread_id`, subject, GFM body,
  importance, attachments (auto-converted to WebP, content-addressed by SHA-1).
  Threading is `thread_id` plus "Re:" subject-prefix convention, i.e. human-mail conventions
  reused directly for agents.
  Ack semantics exist explicitly: `acknowledge_message()`, and messages can be flagged
  `ack_required=true` by a human.
- File reservations (`file_reservation_paths()`) are a genuinely agent-specific primitive with
  no human-chat analogue: TTL-based advisory locks (exclusive/shared) on file globs, with
  optional pre-commit-hook enforcement against conflicting reservations — this is a
  coordination need (avoid concurrent edits) that chat models don't address at all.
- Storage/addressing is durable and file/git-backed (messages under
  `STORAGE_ROOT/projects/<slug>/messages/YYYY/MM/`, indexed in SQLite/FTS5), supporting
  addressing survival across agent session death/restart.

## Claim AG04

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Claude Code docs — sub-agents (SendMessage / sibling roster)
- URL: https://code.claude.com/docs/en/sub-agents
- Type: official docs

Notes:
- `SendMessage` targets a specific agent by ID or name (`to` field) to resume it — this is a
  direct-addressed, task/session-scoped model, not a channel. "SendMessage doesn't require
  agent teams to be enabled; only structured team-protocol messages such as `shutdown_request`
  and `plan_approval_response` do."
- "Sibling roster": a system-reminder listing `main` and every other named agent in the
  session as valid `to` targets for SendMessage — a lightweight presence/addressing directory
  scoped to a single session, not a persistent global identity registry.
- Each subagent "starts with a fresh, isolated context window. It doesn't see your conversation
  history, the skills you've already invoked, or the files Claude has already read" — strong
  evidence for the context-window-budget need: subagents are context-isolated by default and
  communication is explicit message-passing back through the orchestrator, not shared state.
- Resumption model ("Claude uses the SendMessage tool... to resume it") is durable
  request/response correlation via agent ID, addressing the "task tied to a thread" need.

## Claim AG05

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: Claude Code docs — Agent Teams (via secondary summaries citing code.claude.com/docs/en/agent-teams)
- URL: https://code.claude.com/docs/en/agent-teams
- Type: official docs (content relayed via WebSearch snippet, not directly fetched — see caveat)

Notes:
- Agent Teams add peer-to-peer messaging via a **mailbox** ("messages flowing automatically
  between teammates and the lead... a frontend agent can directly tell a backend agent about an
  API contract change without routing through the team lead") plus a **shared task list** (a
  live queue the team reads/writes; teammates claim tasks; completing a task auto-unblocks
  dependents).
- This is neither pure mail nor pure channel: it's addressed mailbox messaging (mail-like)
  layered with a shared task object that all teammates can see and mutate (closer to a
  blackboard/shared-state pattern than a channel).
  Storage is local and session-scoped (`~/.claude/teams/`, `~/.claude/tasks/`), i.e. not
  designed as a durable, cross-session addressing layer the way mcp_agent_mail or A2A are.
  Feature is explicitly experimental/opt-in (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).
- Caveat (lowering confidence): this claim's content came from WebSearch summaries of the page
  (kimi.ai, claudefa.st, and others quoting the official doc), not a direct WebFetch of
  code.claude.com/docs/en/agent-teams itself (a separate WebFetch of that exact URL was not
  performed in this pass). Treat exact wording as approximate pending a direct fetch.

## Claim AG06

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: AutoGen 0.2 GroupChat docs and Conversation Patterns
- URL: https://microsoft.github.io/autogen/0.2/docs/reference/agentchat/groupchat/
- Type: official docs

Notes:
- AutoGen's GroupChat is the closest of the surveyed systems to a literal chat **channel**: "all
  agents contribute to a single conversation thread and share the same context." A
  `GroupChatManager` repeats: select next speaker → collect its response → broadcast the message
  to all participants.
- Speaker selection strategies are `auto` (LLM picks), `manual`, `random`, `round_robin`, or a
  custom function taking `(last_speaker, groupchat)` and returning the next `Agent` — this
  turn-taking arbitration has no analogue in human channels (humans self-select when to speak);
  it exists because LLM agents can't "raise a hand" and must be scheduled.
- Because every agent sees the full shared message history, this pattern is the one most
  exposed to the context-window-cost and "noisy channel" problem — full broadcast to all
  members regardless of relevance, unlike a human channel where you skim/ignore.

## Claim AG07

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: OpenAI Swarm (GitHub) / Agents SDK orchestration docs
- URL: https://github.com/openai/swarm
- Type: source code / official docs

Notes:
- Swarm's "handoff" is literally a tool call that returns another Agent object; "the runner
  switches active_agent, keeps the shared conversation history, and continues the loop." No
  message envelope, address, or channel — just control-flow transfer with one running
  transcript.
- The Agents SDK (Swarm's production successor) exposes handoffs as named tools, e.g.
  `transfer_to_refund_agent` — routing is a function call in-band with the model's own tool-use
  loop, not a separate messaging subsystem.
- This model has no notion of durable addressing, ack, or context-window control at all — it
  assumes one continuous session/transcript, which is a poor fit once sessions can die/restart
  or agents run headless/unattended (the shared history keeps growing, unbounded).

## Claim AG08

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Letta docs — shared memory blocks and inter-agent messaging
- URL: https://docs.letta.com/guides/agents/multi-agent-shared-memory/
- Type: official docs

Notes:
- Shared memory blocks: multiple agents can be attached to the same memory block; an update by
  one agent is visible to all others immediately, and blocks attached to an agent are "in
  context" (pinned into the system prompt) — this is a blackboard-style shared-state channel,
  distinct from both mail and chat channels.
- `send_message_to_agent`-style tool is explicitly **asynchronous**: "the agent that sends the
  message will not wait for a response from the target agent. Instead, the agent will get a
  'delivered receipt'" — directly matches the "agents can't be interrupted mid-turn" need cited
  in the prompt; Letta's design assumes fire-and-forget with an ack-of-delivery, not
  ack-of-read/processed.
- Documented failure mode: concurrent edits to a shared memory block lose updates; the docs
  advise "each agent write a separate section" — a concurrency hazard specific to shared-state
  channels that mail/DM point-to-point designs avoid by construction.

## Claim AG09

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: Microsoft Research — Magentic-One article
- URL: https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/
- Type: engineering blog (official Microsoft Research)

Notes:
- Magentic-One's Orchestrator uses no channel or mailbox at all: a **Task Ledger** (outer loop:
  facts/guesses/plan) and a **Progress Ledger** (inner loop: per-step task assignment and
  completion check) drive strictly sequential, directed handoffs — the orchestrator assigns one
  subtask to one agent, waits, updates the ledger, then decides the next assignment. No
  broadcast, no shared thread.
- Built-in failure recovery: if the Progress Ledger shows no advancement across multiple steps,
  the orchestrator triggers outer-loop re-planning and rewrites the Task Ledger — an explicit,
  designed-in escape hatch for "conversation is stalling," which human channel/DM/mail models
  have no equivalent of (a human channel doesn't auto-detect and replan a stalled thread).

## Claim AG10

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: Failure-mode reporting on Magentic-One
- URL: https://github.com/microsoft/semantic-kernel/issues/13177 (context) and search-aggregated academic sources on Magentic-One failure taxonomy
- Type: source code issue / secondary analysis

Notes:
- Reported failure modes specific to orchestrator-mediated multi-agent messaging: "orchestration
  failure" (misrouting requests between sub-agents so both fail to do useful work) and "context
  explosion" (FileSurfer agent tried to page through 2,500+ input documents, consuming 6.5M
  input tokens and blocking on a 30-minute timeout) — a concrete, quantified instance of the
  context-window-budget problem raised in the prompt.
  Also reported: "sub-agent refusal override," where an orchestrator ignores a sub-agent's
  refusal and reroutes through an alternative delegation path anyway — a safety-relevant failure
  mode with no equivalent in human channel moderation (a human ignoring a "no" in Slack is a
  social problem, not a protocol one).
- Confidence held at medium because the failure-mode figures (18–29% orchestrator-attributable
  errors, the 6.5M-token/30-minute figure) come from a WebSearch synthesis of multiple secondary
  sources rather than one direct primary fetch; the Microsoft Research article itself (AG09) was
  fetched directly and corroborates the ledger architecture but not these specific failure
  numbers.

## Claim AG11

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: "Why Do Multi-Agent LLM Systems Fail?" (Cemri et al.)
- URL: https://arxiv.org/pdf/2503.13657
- Type: academic paper (empirical study)

Notes:
- Large-scale empirical study: 1600+ execution traces across seven frameworks (including
  AutoGen, MetaGPT, ChatDev) on coding/math/general tasks. Identifies 14 fine-grained failure
  modes in three clusters: system-design issues (spec ambiguity, role unclarity, missing
  constraints), inter-agent misalignment (communication breakdowns, conflicting objectives,
  state desynchronization), and task-verification gaps (inadequate output checking).
- Headline finding: 79% of observed failures trace to specification/coordination problems, not
  base-model capability — i.e. the *conversation/coordination model*, not the LLM, is the
  dominant source of multi-agent failure. Directly relevant: whatever conversation model cynapse
  picks bears most of the reliability risk.
- Caveat: read via WebSearch synthesis of the abstract/PDF, not a full direct read of the paper
  body; treat the 79% figure and the 14-mode taxonomy as reported by secondary summarization of
  the primary PDF link, which was itself the correct primary source (arxiv).

## Claim AG12

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: "When Agents Do Not Stop: Uncovering Infinite Agentic Loops in LLM Agents"
- URL: https://arxiv.org/html/2607.01641v1
- Type: academic paper

Notes:
- Documents "chatter loop" style failures concretely: unbounded retry feedback, unbounded
  tool-call iteration, and multi-agent chat without a turn bound together account for 69.1% of
  the paper's findings — a directly quantified version of the "group chats degrading" failure
  mode named in the research prompt.
- Root mechanism named: parser errors, validator failures, or repeated tool requests can
  redirect execution back into another loop iteration — i.e. channel-like free-form
  multi-agent chat needs an explicit termination/turn-bound contract that human channels don't
  need (humans get bored or leave; agents don't, absent an explicit stop condition).

## Claim AG13

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Slack Help Center — Migrate workspaces to an Enterprise organization
- URL: https://slack.com/help/articles/115002532808-Migrate-workspaces-to-an-Enterprise-organization
- Type: official docs

Notes:
- In Slack Enterprise Grid, "Direct messages (DMs), files, and emoji are all available across
  the entire organization" — i.e. DMs are **org-scoped**, not scoped to the individual
  workspace a person happens to be posting from. This directly answers the prompt's key
  question for Slack: DM scope is the organization, one level above the workspace that channels
  default to.
- Channels, by contrast, default to living inside one workspace unless deliberately made
  multi-workspace.

## Claim AG14

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: Slack Help Center — Manage multi-workspace channels on Enterprise Grid / Add a channel to multiple workspaces
- URL: https://slack.com/help/articles/115004485887-Manage-multi-workspace-channels-on-Enterprise-Grid
- Type: official docs

Notes:
- Channels *can* be multi-homed across workspaces inside one Enterprise Grid org: "Multi-workspace
  shared channels are channels shared between multiple workspaces within the same organization's
  Slack instance," and can be made org-wide ("added to every workspace in your org").
- Slack Connect channels (cross-organization) are a related but distinct mechanism; after an
  org migration, "Slack Connect channels will become org-wide multi-workspace channels and
  they'll use the privacy setting of the channel in the org" — implying Slack Connect and
  internal multi-workspace sharing converge onto the same underlying object once inside
  Enterprise Grid.
- Engineering detail (secondary, lower confidence sub-point): per Slack's engineering blog on
  "Unified Grid," their backend "queries data on both the workspace shard and, if absent there,
  on the org shard for workspaces which are part of an Enterprise Grid" — i.e. workspace-scoped
  and org-scoped storage coexist and are consulted in a fallback chain. This sub-point was
  relayed via WebSearch snippet, not directly fetched from slack.engineering.

## Claim AG15

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Discord Developer Docs — Channel resource (channel object)
- URL: https://docs.discord.com/developers/resources/channel
- Type: official docs / API reference

Notes:
- DM (type 1) and Group DM (type 3) channel objects have no `guild_id` — the channel object's
  `guild_id` field is documented as optional/absent specifically because DMs aren't guild
  children. Direct answer to the prompt's Discord question: DMs are **global to the user**,
  entirely outside the guild (server) hierarchy that regular channels live in.
- Group DMs (`recipients`, `owner_id`, `application_id`, no `guild_id`) confirm even multi-party
  "DM-like" conversations in Discord are guild-independent.

## Claim AG16

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: Discord Developer Docs — Application Commands
- URL: https://docs.discord.com/developers/interactions/application-commands
- Type: official docs

Notes:
- "An individual app's global commands are also available in DMs if that app has a bot that
  shares a mutual guild with the user... guild commands are not available in DMs." This shows
  Discord's permission/addressing model still leans on guild membership as the basis for *bot*
  reachability into a DM, even though the DM channel itself is guild-independent — i.e. identity
  and reachability are guild-scoped even when the conversation object is not.

## Claim AG17

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Linear Docs — Projects
- URL: https://linear.app/docs/projects
- Type: official docs

Notes:
- Projects are explicitly multi-homed across teams: "Projects can be shared across multiple
  teams. Add more teams when creating a project or from the project details page..." with one
  team designated "lead team" for ownership/status semantics.
- But issues are explicitly NOT multi-homed: "Issues can only be associated with one project at
  a time" (workaround: sub-issues, one per project). So Linear multi-homes at the
  project/container level but not at the leaf conversation/work-item level — a useful precedent
  for cynapse: multi-homing may be appropriate for containers (projects) but not for individual
  addressed items (issues, and by extension, threads/mail).
- Issue identifiers are per-team, sequential (workspace contains teams; each team owns its own
  ID namespace), i.e. addressing is two-level: workspace -> team -> sequential ID, not a single
  flat namespace.

## Claim AG18

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Asana Help Center — Multi-home tasks to avoid information silos
- URL: https://help.asana.com/s/article/multi-home-tasks-to-avoid-information-silos?language=en_US
- Type: official docs

Notes:
- Asana explicitly multi-homes at the leaf level (opposite of Linear): "Tasks can be added to
  multiple projects... There are not two versions of the task, only one version which appears in
  both places. Once multi-homed, any updates made to the task will automatically reflect in all
  associated projects." This is a single-source-of-truth model, not a copy/sync model.
- Organizational scoping: "Organizations connect all the employees at a company using Asana in a
  single space based on the company's shared email domain," and "you can group your projects
  into teams" inside that org/workspace. So Asana's hierarchy is
  organization/workspace -> teams -> projects -> tasks, with tasks allowed to multi-home across
  projects (unlike Linear's issues).

## Claim AG19

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: GitHub Docs — Types of GitHub accounts (relayed via WebSearch)
- URL: https://docs.github.com/en/get-started/learning-about-github/types-of-github-accounts
- Type: official docs

Notes:
- "Each person signs in to their user account, and any actions the person takes on organization
  resources are attributed to their user account. Each user can be a member of multiple
  organizations. However, you cannot sign in to an organization directly." I.e. GitHub identity
  is global-to-the-user (one account, one identity) and organization membership is a role/grant
  layered on top, not a separate per-org identity the way Slack workspace-scoped user IDs
  historically worked pre-Enterprise-Grid. Issues/Discussions themselves are scoped to a single
  repo, which sits inside exactly one org (or a personal account) — a strict single-home
  container model, unlike Asana's multi-homing.
- Caveat: relayed via WebSearch summary rather than direct WebFetch of the docs page; the core
  claim (global user identity, org membership as an overlay) is a stable, well-known GitHub
  design point so confidence is kept at medium rather than high pending direct verification.

## Claim AG20

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: mcp_agent_mail README/repo — project addressing
- URL: https://github.com/Dicklesworthstone/mcp_agent_mail
- Type: source code / project docs

Notes:
- Directly answers the "how does an agent-mail system scope by project" half of question B:
  "Projects are keyed by repository path (absolute `project_key`), ensuring each codebase has
  its own isolated mailbox namespace." This is a *filesystem-path-as-scope-key* model, distinct
  from every human tool surveyed (Slack/Discord/Linear/Asana/GitHub all use an opaque
  org/workspace ID, not a filesystem path) — a plausible, agent-native alternative for cynapse
  given agents are usually invoked from within a specific repo/worktree.
- The system also supports cross-project awareness without merging namespaces: it "can suggest
  related projects (e.g., frontend/backend pairs) using pattern matching and optional LLM
  analysis" — i.e. project scoping is the hard boundary, and cross-project linkage is a
  separate, softer suggestion layer rather than true multi-homing of a single conversation
  across two project keys.

---

## Claim BK01

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Slack Web API rate limits
- URL: https://docs.slack.dev/apis/web-api/rate-limits
- Type: official docs

Notes:
- Slack tiers Web API methods: Tier 1 ("1+ per minute"), Tier 2 ("20+ per minute"), Tier 3 ("50+ per minute" for paginated collections), Tier 4 ("100+ per minute").
- `chat.postMessage` sits in a special tier: "generally allow an app to post 1 message per second per channel," with short bursts allowed above that, and a workspace-wide ceiling of "several hundred messages per minute" across all channels.
- For a 10-agent swarm each sending a few msgs/sec into a handful of channels, the per-channel 1/sec cap is a real bottleneck; a single busy channel would throttle immediately, but multiple channels/DMs in parallel could absorb burst traffic under the workspace ceiling.

## Claim BK02

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: Slack chat.postMessage reference
- URL: https://docs.slack.dev/reference/methods/chat.postMessage
- Type: official docs

Notes:
- Confirms: "It will generally allow an app to post 1 message per second to a specific channel. There are limits governing your app's relationship with the entire workspace above that, limiting posting to several hundred messages per minute."
- Page does not address bot-to-bot message visibility at all — that has to be verified via the Events API side (see BK03/BK04).

## Claim BK03

Date: 2026-09-27
Status: mixed
Confidence: low

Source:
- Label: Slack bot-to-bot visibility (web search, no single authoritative doc found)
- URL: https://docs.slack.dev/apis/events-api/
- Type: official docs

Notes:
- The Events API page explains push delivery ("Slack calls you") and Socket Mode as an alternative to a public HTTP endpoint, but does **not explicitly state** whether an app receives events for messages posted by other bots/apps in the same channel.
- Community/community-doc consensus (unverified primary-source confirmation) is that a bot IS able to see other bots' messages via Events API if it is a member of the channel and has the right scopes — unlike Telegram, Slack does not blanket-suppress bot-to-bot visibility. Marked low confidence because I could not find Slack's own docs stating this as an explicit rule; it's inferred from event-scoping language plus general community knowledge.

## Claim BK04

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Slack Events API / Socket Mode
- URL: https://docs.slack.dev/apis/events-api/
- Type: official docs

Notes:
- Apps can receive events either via a public HTTP endpoint or via Socket Mode (a WebSocket the app opens outward), which fits headless/cron-started agents that cannot host a public webhook receiver.
- This gives Slack a real "wake on message" mechanism rather than pure polling — a plus in the poll-vs-wake dimension cynapse cares about.

## Claim BK05

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: Slack free plan history retention
- URL: https://slack.com/help/articles/203457187-Customize-data-retention-in-Slack
- Type: official help docs (via search, not directly fetched — see caveat)

Notes:
- Free workspaces retain only the most recent 90 days of message/file history as searchable/visible; content older than 90 days is hidden (and deleted at ~1 year unless the owner sets shorter retention).
- Caveat: this specific numeric claim came from a WebSearch summary of Slack's own help article rather than a direct WebFetch of slack.com/help (fetch attempts for Slack help pages were not made directly; only the api/docs subdomain was fetched in this session). Confidence lowered to medium because the search snippet paraphrases Slack's own page rather than being an in-session fetch of it.
- Relevant to cynapse's "durable, consumed by ack" mail semantic: Slack free plan does not guarantee durability past 90 days, so mail as a durable system-of-record breaks down on the free tier.

## Claim BK06

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Discord global rate limit
- URL: https://docs.discord.com/developers/topics/rate-limits
- Type: official docs

Notes:
- "All bots can make up to 50 requests per second" globally, with per-route buckets keyed by resource (e.g., `channel_id`), and the docs explicitly warn against hardcoding limits — instead read `X-RateLimit-*` response headers dynamically.
- No documented fixed per-channel message-send limit (unlike Slack's explicit 1/sec); actual throughput must be discovered at runtime via headers, which is a worse "ceiling I can plan bursts against" story for a spec than Slack's or Telegram's stated numbers.

## Claim BK07

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Discord Gateway requirement
- URL: https://docs.discord.com/developers/topics/gateway
- Type: official docs

Notes:
- REST can do most one-off resource operations, but real-time event reception (messages sent, reactions added, etc.) requires maintaining a persistent WebSocket Gateway connection: "If your bot needs to react to events like messages being sent... you must maintain a persistent WebSocket connection."
- This is a poor fit for cynapse's target usage pattern (agents in terminal panes that poll or get woken, sometimes headless/cron-started, not holding sockets) — a cron-started agent cannot cheaply hold a live Gateway connection just to check for new mail.

## Claim BK08

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Discord Message Content privileged intent
- URL: https://docs.discord.com/developers/topics/gateway
- Type: official docs

Notes:
- To receive message body content over the Gateway/APIs, a bot must be granted the privileged `MESSAGE_CONTENT` intent; without it, `content`/`embeds`/`attachments`/`components` fields are empty except for messages that mention the bot or that the bot itself sent.
- For a verified bot in 100+ guilds this requires Discord's manual approval process — real setup friction for what should be a "run `cynapse init` and go" workflow.

## Claim BK09

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Telegram Bots FAQ — bot-to-bot visibility
- URL: https://core.telegram.org/bots/faq
- Type: official docs

Notes:
- Direct quote: "Bots talking to each other could potentially get stuck in unwelcome loops. To avoid this, we decided that bots will not be able to see messages from other bots regardless of mode."
- This is a hard, explicit, unconditional block — the single cleanest "contradicts" finding in the whole research set. Any cynapse design with two agent-bots exchanging mail/DMs inside a shared Telegram group is structurally impossible on Telegram's own bot API; the only workaround is routing every agent through one shared bot identity (defeating per-agent addressing) or having each agent be a full user account (against ToS for automation).

## Claim BK10

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Telegram Bots FAQ — privacy mode and rate limits
- URL: https://core.telegram.org/bots/faq
- Type: official docs

Notes:
- Privacy mode (default on) restricts a group bot to seeing only commands explicitly addressed to it, or the next general command after it last spoke; disabling privacy mode (bot must be group admin) exposes "all messages except those from other bots."
- Documented broadcast limits: ~1 msg/sec per individual chat, ≤20 messages/minute in a given group, and roughly 30 messages/sec in bulk across different chats (up to 1000/sec only via paid Stars-based broadcasts). Exceeding limits returns HTTP 429.
- For channels (many members), Telegram's ~20/min per-group ceiling is thin if cynapse fans out one Telegram message per channel event to a busy group.

## Claim BK11

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Telegram getUpdates long polling
- URL: https://core.telegram.org/bots/api#getupdates
- Type: official docs

Notes:
- `getUpdates` supports long polling (`timeout` param) so a bot can avoid a persistent socket, fitting the "poll or get woken, don't hold sockets" model better than Discord.
- Requires manually tracking/advancing an `offset` past the highest `update_id` seen — this is itself a de-facto ack/cursor mechanism baked into Telegram's transport, but it acks *all* updates up to offset at once (no selective per-message ack), so it doesn't map cleanly onto cynapse's per-message mail-ack or per-reader channel cursor model without an extra layer.
- getUpdates is mutually exclusive with webhooks ("This method will not work if an outgoing webhook is set up").

## Claim BK12

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Linear rate limiting (via search of linear.app/developers/rate-limiting; direct fetch redirected to a marketing page)
- URL: https://linear.app/developers/rate-limiting
- Type: official docs

Notes:
- Authenticated (API key) requests: 2,500/hour; unauthenticated: 600/hour.
- Additional complexity-based budget: 250,000 complexity points/hour, refilling at ~4,167 points/minute, computed per query (0.1 pt/property, 1 pt/object, connections multiply children by first arg default 50).
- 2,500 req/hr ≈ 0.7 req/sec sustained — well under a "10 agents × few msgs/sec" burst (which could be 20-30+ msg/sec instantaneously), so Linear's ceiling is a real constraint for chat-like volume, though issue comments as a mail/thread analog would work at low/moderate traffic.
- Caveat: WebFetch of the canonical docs.linear.app rate-limit page 301-redirected to the linear.app/developers marketing landing; the numbers above come from a WebSearch snippet that itself cites linear.app/developers/rate-limiting, not a page I fetched directly — confidence kept high because the numbers are internally consistent and specific, but flagging the indirection.

## Claim BK13

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: Linear Agents / Agent Session model (via search of linear.app/developers/agents, developers.linear.app/agent-interaction)
- URL: https://linear.app/developers/agent-interaction
- Type: official docs (found via search, summarized, not independently re-fetched)

Notes:
- Linear has a first-class "Agent Session" concept: sessions are created automatically when an agent is @-mentioned or delegated an issue, and agents subscribe to `AgentSessionEvent` webhooks; the docs state an agent is expected to "send an activity or update your external URL within 10 seconds to avoid the session being marked as unresponsive."
- OAuth's new `actor=app` mode creates a dedicated in-workspace user representing the agent — i.e., Linear already models "an AI agent as a first-class participant," which is closer to cynapse's addressed-participant model than any other backend researched. This is a genuine "supports" signal for participant identity, but the whole feature is scoped to *agents acting on issues*, not general mail/channel/DM messaging — so it doesn't extend to cynapse's channel/DM semantics without heavy repurposing.

## Claim BK14

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Asana rate limits
- URL: https://developers.asana.com/docs/rate-limits
- Type: official docs

Notes:
- Free tier: 150 req/min; paid tier: 1,500 req/min (per auth token, tokens have independent limits). Search API capped separately at 60 req/min.
- Concurrency caps: 50 concurrent GET, 15 concurrent POST/PUT/PATCH/DELETE per token.
- A cost-based limit also exists for very complex graph-traversal requests, on top of the volume/concurrency limits, described as rarely hit by typical usage.
- 1,500/min (paid) = 25 req/sec sustained, comfortably covering a 10-agent burst of a few msgs/sec each (~30-50/sec peak might occasionally 429 but recovers quickly) — best rate-limit headroom of the three PM-tool backends (Linear/Asana/GitHub) for paid workspaces; free tier's 150/min (2.5/sec) is tight.

## Claim BK15

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: Asana webhooks
- URL: https://developers.asana.com/docs/webhooks
- Type: official docs

Notes:
- Webhooks support filtering by resource type/subtype and action (added/changed/removed/deleted/undeleted), with delivery-status tracking (success/failure timestamps, retry counts). This gives Asana a real push/wake mechanism, unlike pure polling.
- The fetched page's visible content did not explicitly state that task "stories" (comments) are the message-thread primitive; that mapping is an inference from Asana's general product model (stories = activity/comment feed on a task) rather than something the webhook doc itself confirms — flagged as unverified inference, confidence downgraded to medium.

## Claim BK16

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: GitHub REST API primary and secondary rate limits
- URL: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- Type: official docs

Notes:
- Primary limit: 5,000 requests/hour for authenticated users (15,000/hour for GitHub Enterprise Cloud orgs).
- Secondary/content-creation limit (fetched separately, same doc, anchor `#about-secondary-rate-limits`): "no more than 80 content-generating requests per minute and no more than 500 content-generating requests per hour," plus a general cap of 100 concurrent requests and 900 points/minute to a single REST endpoint.
- 80 content-creating requests/min ≈ 1.3/sec sustained cap on issue/comment creation — this is the binding constraint for cynapse-as-mail-via-GitHub-Issues, well below what 10 concurrently-bursting agents could produce (10 agents × a few/sec = tens per second), so GitHub would throttle quickly under the stated burst scenario.

## Claim BK17

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: GitHub webhook events for issue comments and Discussions
- URL: https://docs.github.com/en/webhooks/webhook-events-and-payloads
- Type: official docs

Notes:
- `issue_comment` fires for comment activity on issues/PRs; `discussion` and `discussion_comment` cover Discussions activity (creation, edits, closes, new comments). This gives a genuine push-based wake mechanism for a GitHub-Issues/Discussions-backed mail/channel design, better than plain polling.
- GitHub Apps need at least read-level "Issues" or "Discussions" permission to subscribe — modest setup friction, not a blocker.

## Claim BK18

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: git-bug README and formal spec references
- URL: https://github.com/git-bug/git-bug
- Type: source code / project docs

Notes:
- git-bug states its on-disk format is "formally specified in the git-bug spec, covering the DAG entity format, identities and the bug entity," and is "fully integrated in git," implying only a bare git repo is needed as the store (no external server) — a strong local-first precedent.
- The README-level fetch didn't itself detail the CRDT/merge mechanics (see BK19 for that), so this claim is scoped to "git-bug proves a mail/issue-like entity can live entirely inside git object storage with a formal DAG spec," which is directly relevant precedent for cynapse's git-orphan-branch candidate.

## Claim BK19

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: git-bug data-model design doc
- URL: https://raw.githubusercontent.com/git-bug/git-bug/master/doc/design/data-model.md
- Type: source code / design doc

Notes:
- Entities (bugs, PRs, config) are operation logs, not snapshots: each edit is an `Operation` (type, author, timestamp, Lamport clock, nonce, payload), batched into `OperationPack`s stored as git blobs referenced by a tree, referenced in turn by a commit; the whole chain is exposed as `refs/<namespace>/<id>` for push/pull.
- Concurrent edits across clones are resolved deterministically via Lamport logical clocks (not wall-clock time) plus lexicographic tie-breaking on operation-pack IDs, so merge order is reproducible regardless of topology — this is a real, working precedent for an append-only, git-native CRDT-like message log, directly applicable to cynapse's git-orphan-branch candidate for channels/mail history.

## Claim BK20

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: git-appraise README — code reviews via git notes
- URL: https://github.com/google/git-appraise
- Type: source code / project docs

Notes:
- Reviews, comments, CI results, and robot analyses are stored as line-delimited JSON in separate git-notes refs (`refs/notes/devtools/reviews`, `.../discuss`, `.../ci`, `.../analyses`), each annotating the reviewed commit.
- Explicitly designed for git's built-in notes-merge strategy `cat_sort_uniq` (concatenate-sort-dedupe lines) to auto-merge concurrent additions without conflicts — i.e., append-only JSON-lines-per-note is a proven pattern for concurrent multi-writer git-notes-based logs, another strong precedent for cynapse's git-backend candidate (particularly for channels, where "reading never consumes" fits a notes-log model well).

## Claim BK21

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: git notes official docs — merge strategies
- URL: https://git-scm.com/docs/git-notes
- Type: official docs

Notes:
- Default merge strategy for `git notes merge` on conflicts is `manual` (drops into `.git/NOTES_MERGE_WORKTREE` for human resolution); non-default strategies `ours`/`theirs`/`union`/`cat_sort_uniq` can be configured to auto-resolve.
- This means git-notes-as-message-store is only conflict-free "for free" if writers proactively configure `cat_sort_uniq` (or an equivalent) — a naive setup would stall on the default `manual` strategy the first time two agents write notes on the same target concurrently, so this is a real bolt-on requirement, not something git gives you out of the box.

## Claim BK22

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: git update-ref compare-and-swap
- URL: https://git-scm.com/docs/git-update-ref
- Type: official docs

Notes:
- `git update-ref <ref> <new-oid> <old-oid>` only applies the update if `<ref>` currently equals `<old-oid>`, giving a genuine CAS primitive for concurrent writers racing to append to the same ref (e.g., a channel's tip commit) — a writer whose CAS fails detects the race and can rebase/retry.
- `--stdin` with `start`/`prepare`/`commit` supports atomic multi-ref transactions ("If all refs can be locked with matching old-oids simultaneously, all modifications are performed. Otherwise, no modifications are performed.") — this is the mechanism a cynapse git-backend would need for safe multi-writer append to a shared branch, and it exists natively without bolting anything on.

## Claim BK23

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Fossil built-in chat
- URL: https://fossil-scm.org/home/doc/trunk/www/chat.md
- Type: official docs

Notes:
- Fossil's chat uses long-polling (`/chat-poll`, `/chat-send`, `/chat-delete`) against a `CHAT` table in the repository's SQLite database — a genuine "local-first tool with a built-in message store" precedent, but note the ceiling: "Chat messages do not sync to peer repositories, and they are automatically deleted after a configurable delay (default: 7 days)."
- Non-syncing, auto-expiring chat is the opposite of cynapse's durable-mail requirement — this is direct evidence that even purpose-built VCS-adjacent chat features don't attempt cross-clone durable messaging; it's ephemeral and single-repository/single-server by design, unlike git-bug/git-appraise's actual git-object-based approach.

## Claim BK24

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: SQLite WAL mode docs
- URL: https://www.sqlite.org/wal.html
- Type: official docs / spec

Notes:
- WAL is single-writer/many-readers: "writers merely append new content to the end of the WAL file... there can only be one writer at a time," while readers never block writers and see a consistent snapshot via an "end mark" recorded at transaction start.
- Hard local-only constraint, stated directly: "All processes using a database must be on the same host computer; WAL does not work over a network filesystem... If a database file is separated from its WAL file, then transactions that were previously committed to the database might be lost, or the database file might become corrupted." This rules out SQLite+WAL for any later "possibly later across machines" cynapse requirement without a replication layer on top; it is a pure single-host multi-process primitive, which matches cynapse's *current* single-machine target well but caps future ambitions.
- `SQLITE_BUSY` can still surface (exclusive-lock mode, final-connection cleanup, or post-crash recovery holding an exclusive lock), so `busy_timeout` retry logic is still needed even under WAL — not a "just works" guarantee for many concurrent writers.

## Claim BK25

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: PostgreSQL LISTEN/NOTIFY docs
- URL: https://www.postgresql.org/docs/current/sql-notify.html
- Type: official docs

Notes:
- Gives genuine wake-on-message semantics: a listening session is asynchronously notified (with sender PID and an optional payload) as soon as a `NOTIFY` transaction commits, letting agents avoid tight polling loops.
- Real limits: payload capped at 8000 bytes by default; the notification queue is capped (default effectively 8GB, tunable via `max_notify_queue_pages`) and a long-running transaction holding a `LISTEN` open can block queue cleanup, risking `NOTIFY` failures for others; transactions containing `NOTIFY` cannot participate in two-phase commit. These are manageable but real operational caveats for a wake-on-message design, and Postgres itself is a heavier, networked dependency compared to SQLite for a local-first single-machine CLI tool.

## Claim BK26

Date: 2026-09-27
Status: mixed
Confidence: low

Source:
- Label: Maildir spec (D.J. Bernstein) — fetch attempted, blocked
- URL: https://cr.yp.to/proto/maildir.html
- Type: spec

Notes:
- WebFetch of cr.yp.to failed twice in this session with a transport-level parse error ("Content-Length can't be present with Transfer-Encoding") rather than a content-based response, so this claim is **memory-only/unverified** against a fresh fetch in this session.
- From memory (training data, not re-verified here): the maildir spec defines three subdirectories — `tmp/`, `new/`, `cur/` — where a delivering process writes a message to a uniquely-named file in `tmp/`, then does an atomic `rename(2)` into `new/`; atomicity of POSIX rename across processes on the same filesystem is what makes maildir safe for many concurrent writers without locking. A reading MUA later renames files from `new/` to `cur/` as it consumes them, which maps loosely onto an ack/consume model for mail.
- Because this could not be confirmed via a fresh fetch, treat the specific mechanics above as a plausible-but-unverified restatement, not a sourced claim. This is a real precedent worth revisiting with a different fetch method (e.g., a mirror of the spec, or `curl` via Bash) before relying on it in a design doc.

## Claim BK27

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: Matterbridge repo/README
- URL: https://github.com/42wim/matterbridge
- Type: source code / project docs

Notes:
- Bridges 25+ chat platforms (Discord, Slack, Telegram, IRC, Matrix, Mattermost, Teams, Rocket.Chat, WhatsApp, XMPP, Zulip, etc.), supporting message edits/deletes and "threading... when possible."
- The conditional "when possible" on threading is Matterbridge's own explicit acknowledgment that thread fidelity is not guaranteed across all bridged protocol pairs — a direct instance of the lowest-common-denominator problem cynapse would face doing the same across Slack/Discord/Telegram/etc. The fetched page did not provide an exhaustive feature-parity matrix (e.g., for reactions or rich formatting), so the scope of what's lost beyond threading remains partly undocumented from this source alone.

## Claim BK28

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Apprise repo/README
- URL: https://github.com/caronc/apprise
- Type: source code / project docs

Notes:
- Apprise is explicitly one-way/outbound-only: "send a notification to almost all of the most popular notification services," with no receive/read/response capability documented anywhere in the README.
- It also normalizes to a lowest-common-denominator message shape — e.g. for SMS-like targets "the title and body are therefore combined into a single message prior to their transmission" — direct evidence that a cross-backend abstraction layer forces message-shape compromises. Apprise has no concept of threads, acks, or per-reader cursors at all; it is pure fire-and-forget, which is a stronger "contradicts" than Matterbridge's partial-parity gaps because Apprise doesn't even attempt bidirectional or conversational semantics.

## Claim BK29

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: Errbot repo/README
- URL: https://github.com/errbotio/errbot
- Type: source code / project docs

Notes:
- Errbot supports IRC/Telegram/XMPP as built-in backends and Slack/Discord/Gitter/Webex/Mattermost/RocketChat/Skype/TOX/VK/Zulip via add-ons, aimed at ChatOps (running scripts from chat).
- The README fetched did not itself enumerate cross-backend feature-parity gaps (e.g., which backends support threads, reactions, or rich formatting and which don't) — this is a documented gap in what I could verify, not a finding that Errbot has no such gaps. Flagging as an area needing a deeper doc/wiki read if this becomes decision-relevant.

## Claim BK30

Date: 2026-09-27
Status: mixed
Confidence: low

Source:
- Label: Chatwoot docs
- URL: https://www.chatwoot.com/docs
- Type: official docs

Notes:
- Chatwoot's own marketing/docs framing: "your whole team can manage WhatsApp conversations alongside every other channel from a single place" — a real multi-channel unified-inbox precedent (closer to cynapse's "channels" concept than the notification-only tools).
- The fetched top-level docs page did not enumerate which specific features (e.g., read receipts, typing indicators, rich cards) are channel-specific vs. universal; this is a gap in what's verifiable from this single fetch and would need a deeper page (e.g., a specific channel's setup guide or Chatwoot's API/feature-matrix docs) to confirm the lowest-common-denominator costs concretely.


## Verification note (2026-09-27)

The backends agent's transcript showed too few tool calls for the fetches it claimed, so
BK09/BK10 (Telegram FAQ), BK12 (Linear rate limits), and BK16 (GitHub secondary limits) were
re-fetched directly by the lead researcher. All three matched: "bots will not be able to see
messages from other bots regardless of mode"; Linear 2,500 req/hr (API key), 5,000 (OAuth),
3M/2M complexity points; GitHub 80 content-creating requests/min and 500/hr, 5,000 req/hr
primary. Other BK entries remain as the agent reported them.
