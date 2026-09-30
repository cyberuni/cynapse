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
## Claim LG01

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: RFC 5256 — IMAP SORT and THREAD Extensions (REFERENCES algorithm, formalization of the JWZ algorithm)
- URL: https://www.rfc-editor.org/rfc/rfc5256.html
- Type: spec
- Fetched: yes

Notes:
- The REFERENCES algorithm reconstructs a thread tree purely from headers (References, falling back to In-Reply-To) attached to each independently-stored message copy — there is no canonical server-side order or shared log to consult.
- When a parent Message-ID cannot be found, the algorithm fabricates a "dummy" placeholder message to hold the tree together, then prunes/promotes it — an explicit patch for the fact that per-copy reconstruction can't guarantee completeness.
- RFC itself warns: "sorting by REFERENCES can lead to misleading threading trees... a message with false References: header data will cause a thread to be incorporated into another thread" — reconstruction is only as trustworthy as unverified client-supplied headers.
- This is the load-bearing case for "reconstructing a conversation from per-recipient copies has no canonical order and is fragile" — directly supports treating per-recipient mail copies as a poor substrate for an inspectable, ordered ledger.

## Claim LG02

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: jwz.org — Message Threading (Jamie Zawinski, original threading algorithm writeup)
- URL: https://www.jwz.org/doc/threading.html
- Type: engineering blog
- Fetched: snippet-only (WebFetch returned only "PRIVATE" for this URL in this session; content below is from WebSearch snippets, not a full fetch)

Notes:
- Widely cited as the origin of email-thread reconstruction from Message-ID / In-Reply-To / References headers on independently stored, per-recipient/per-mailbox message copies.
- Formalized into the 2002 imapext-thread Internet Draft, which became RFC 5256 (see LG01) — i.e., the fragility documented in RFC 5256 traces directly back to this algorithm.
- Low confidence on specifics beyond what RFC 5256 already confirms, since the page itself could not be fetched in this session (returned a stub "PRIVATE" body, possibly a bot-block).

## Claim LG03

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: Google Mail Help — Turn conversation view on or off
- URL: https://support.google.com/mail/answer/5900
- Type: official docs
- Fetched: yes

Notes:
- Gmail's own conversation-view help page documents that a conversation breaks apart when the subject line changes or exceeds 100 emails, and that for some messages Gmail groups by matching recipients/senders/subject plus matching reference headers sent within one week — i.e., heuristic grouping over independently delivered messages, not a canonical log.
- Users can turn conversation view off entirely, which the page frames as the fix when grouping goes wrong (unrelated messages bundled by coincidental subject match).
- This shows even a sophisticated, resourced reconstruction (Gmail assigns its own threadId at receive time server-side, reducing reliance on client headers) still has visible seams and an escape hatch — reconstruction-from-copies is not free even when done well.

## Claim LG04

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Slack Engineering — Real-time Messaging
- URL: https://slack.engineering/real-time-messaging/
- Type: engineering blog
- Fetched: yes

Notes:
- Slack's "unit of delivery is the channel, not the follower graph": a message is stored once on a Channel Server (a stateful, in-memory server owning a shard of channels via consistent hashing) and fanned out at delivery time to subscribed Gateway Servers, not copied per recipient.
- Gateway Servers hold user connections but no message state; they subscribe asynchronously to the Channel Servers for the channels their users are in.
- This is a single-log-per-channel design (fan-out on read/delivery, not fan-out on write to per-user storage) serving real production scale ("tens of millions of channels per host", sub-500ms global delivery) — direct precedent for "one log per conversation, inboxes derived."

## Claim LG05

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Discord — How Discord Stores Trillions of Messages
- URL: https://discord.com/blog/how-discord-stores-trillions-of-messages
- Type: engineering blog
- Fetched: yes

Notes:
- Discord stores messages once per channel, not duplicated per member: "We partition our messages by the channel they're sent in, along with a bucket, which is a static time window," using Snowflake IDs for chronological sortability.
- The blog does not cover per-user read-state tracking (explicitly not discussed in the fetched content) — meaning the "inbox" side (last-read cursor, unread counts) is evidently a separate concern layered on top of the shared per-channel log, though this specific article doesn't confirm the mechanism.
- Confirms the single-log-per-channel pattern at extreme scale (trillions of messages), independently of Slack — two large chat systems converge on the same structural choice.

## Claim LG06

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: WebSearch synthesis — Twitter/X timeline fan-out architecture (hybrid)
- URL: https://www.techinterview.org/post/3233474168/system-design-twitter-news-feed-timeline-fanout-on-write-fanout-on-read-celebrity-problem-ranking-caching/
- Type: engineering blog (secondary/system-design writeup, not Twitter's own primary source)
- Fetched: snippet-only

Notes:
- Widely-repeated characterization: Twitter uses fan-out-on-write (push each tweet into precomputed per-follower feed caches) for ordinary accounts, but fan-out-on-read (pull at request time and merge) for "celebrity" accounts with huge follower counts, to avoid millions of writes per post.
- This is the standard counter-example to "always fan out on read": pure fan-out-on-read has a latency cost at read time that is unacceptable for very hot timelines, and pure fan-out-on-write has a write-amplification cost that is unacceptable for very high-fan-out producers — the two failure modes are symmetric.
- Relevance to cynapse: a channel with an enormous member count reading at high frequency (e.g., an org-wide broadcast channel) could need the same hybrid if per-reader cursor lookups ever become the bottleneck — but this is a scaling refinement of the log-as-source-of-truth design, not evidence against it (Twitter's log/timeline is still not per-recipient *storage* of the tweet itself; only the derived feed index is pushed).
- Confidence lowered because no Twitter-authored primary source was fetched in this session (secondary tech-interview-prep write-up only).

## Claim LG07

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Telegram API docs — Working with Updates
- URL: https://core.telegram.org/api/updates
- Type: official docs
- Fetched: yes

Notes:
- Telegram models per-account state as sequences of cursors: a common "message box" pts sequence for private chats/basic groups, a separate qts sequence for secret chats, and each channel/supergroup has its own independent pts sequence — clients validate `local_pts + pts_count === pts` to detect gaps.
- On a gap, clients must call `updates.getDifference` (common/secret state) or `updates.getChannelDifference` (channel state) to catch up — i.e., the update stream is explicitly a change-feed with resumable cursors per box, and clients reconcile by replaying the box's diff, not by reconstructing from other users' copies.
- This is strong precedent for "cursor per reader against a shared, independently-sequenced per-conversation log," including the operational cost: multiple independent sequence spaces to track, and explicit gap-filling/reconciliation logic — i.e., fan-out-on-read is not free, it requires this reconciliation machinery.
- Confirms channels (Telegram channels/supergroups) get their own independent event sequence, separate from the "common" one for one-to-one/basic-group chats — a precedent for per-conversation logs rather than one global log.

## Claim LG08

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Confluent Docs — Kafka Consumer Design
- URL: https://docs.confluent.io/kafka/design/consumer-design.html
- Type: official docs
- Fetched: yes

Notes:
- Each partition is consumed by exactly one consumer within a given consumer group at a time — this gives competing-consumer/queue semantics within a group (work-claiming), while consumer offsets are tracked per group (checkpointed to `__consumer_offsets`), independently of other groups.
- Multiple independent consumer groups can each read the same partition/log from their own offset, i.e., broadcast/pub-sub semantics are just "another group with its own cursor" — the same log serves both queue-like and broadcast-like consumption depending only on how cursors are grouped.
- Direct structural precedent for "inboxes are derived indexes / cursors into a shared log": mail-like consume-and-ack (one consumer per message) and channel-like read-without-consuming (independent per-reader cursors) are the same underlying mechanism, differing only in whether cursors are grouped (shared → competing/ack) or per-participant (independent → non-consuming read).

## Claim LG09

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Martin Fowler — Event Sourcing (eaaDev)
- URL: https://martinfowler.com/eaaDev/EventSourcing.html
- Type: engineering blog (pattern catalog, primary author)
- Fetched: yes

Notes:
- Event Sourcing: capture all state changes as an immutable, ordered sequence of events; current/derived state is rebuilt by replaying the event log, and "application state can be stored anywhere you like" since it's purely derivable from events — i.e., derived views (including "inboxes") are legitimately disposable/rebuildable projections, not the source of truth.
- Notes the pattern is well suited where audit trail and replay both matter (Fowler cites accounting systems) — directly analogous to cynapse's proposed use of a channel-as-ledger for mission decisions needing both human inspection and machine (change-detection) consumption.
- Also flags a real cost: added complexity around external system side effects and evolving event schemas over time — relevant caveat for cynapse's decision-log design (event/schema versioning discipline needed).

## Claim LG10

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Martin Fowler — CQRS (bliki)
- URL: https://martinfowler.com/bliki/CQRS.html
- Type: engineering blog (pattern catalog, primary author)
- Fetched: yes

Notes:
- CQRS: use a different model to update information than the model used to read it; the query/read side can be a "ReportingDatabase" — a derived view optimized for reading, kept in sync with the write/command model via an event-based mechanism.
- Fowler explicitly cautions CQRS adds "risky complexity" and should be scoped to specific bounded contexts with a real need (complex domain logic split, or genuinely disparate read/write load) — not applied wholesale.
- Relevant caveat for cynapse: fan-out-on-read (log + derived inbox indexes) is essentially CQRS applied to messaging; Fowler's warning argues for validating that inbox-index maintenance is worth the complexity for cynapse's actual read/write pattern rather than adopting it reflexively everywhere (e.g., DMs between two agents may not need it).

## Claim LG11

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Matrix Spec — Room Version 11 (event DAG, prev_events, state resolution)
- URL: https://spec.matrix.org/latest/rooms/v11/
- Type: spec
- Fetched: yes

Notes:
- Matrix rooms are a DAG of immutable, content-hash-identified events; each event lists up to 20 `prev_events` it causally follows, producing an append-only partial order without any per-recipient copies — all participating servers converge on the same event graph.
- State events (those with a `state_key`) replace prior events of the same type+state_key to form current room state (membership, power levels, room config); message/timeline events carry no state_key and don't affect state resolution — i.e., the log natively distinguishes "structured state-change events" from "plain messages" within one ordered stream.
- State resolution (for concurrent/forked branches) is a deterministic algorithm (power-ordering of "power events" then mainline ordering) so independently-arriving events converge to one canonical state regardless of network delivery order — this is the answer to "what enforces canonical order across distributed writers" for a log-of-events design.
- Directly supports mixing structured events (state changes / decisions) and free-text messages in a single ordered per-conversation log — precedent for cynapse's channel-as-ledger mixing conversation and decisions.

## Claim LG12

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Matrix Spec — Client-Server API, Receipts
- URL: https://spec.matrix.org/latest/client-server-api/#receipts
- Type: spec
- Fetched: yes

Notes:
- Matrix separates two per-user tracking primitives on top of the shared event DAG: read receipts (ephemeral "I've seen event X" signals, including private/threaded variants) and the "fully read marker" (a persistent per-user cursor position in the timeline).
- The fully-read marker is explicitly the personal reading-position cursor into the shared timeline — receipts are a social/ephemeral signal layered separately — showing that "cursor into a shared log" and "social seen-by signal" are usefully different primitives even though both ride on the same underlying per-conversation event stream.
- Supports cynapse's design that per-reader cursors (for non-consuming channel reads) can be a thin, independent structure sitting on top of one shared log, distinct from any ack/consume semantics used for mail.

## Claim LG13

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: GitHub REST API docs — Issue/PR Timeline
- URL: https://docs.github.com/en/rest/issues/timeline?apiVersion=2022-11-28
- Type: official docs
- Fetched: yes

Notes:
- The timeline endpoint returns one ordered array mixing comment events with structured state-change events: label/unlabel, assign/unassign, milestone, review-requested/reviewed, cross-referenced, committed, added-to-project/moved-column, blocking/blocked-by, open/close/reopen — all interleaved chronologically in a single stream.
- This is a concrete, mature precedent for "messages and structured events (state changes, decisions) mixed in one ordered stream," directly matching what cynapse's channel-as-mission-ledger proposes: humans read the same timeline that a change-detection system consumes for structured events.
- No separate "decision" event type exists per se in GitHub's model — decisions are inferred from state-change events (e.g., closed, labeled) plus surrounding comments, not marked as a first-class decision record; relevant gap for cynapse if it wants an explicit "decision" event type rather than inferring decisions from other event types.

## Claim LG14

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Cognitect Blog — Documenting Architecture Decisions (Michael Nygard, ADR proposal)
- URL: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- Type: engineering blog (originating source of the ADR pattern)
- Fetched: yes

Notes:
- ADRs are short, numbered, immutable-once-written documents (context, decision, status, consequences) stored in version control as a sequential archive; numbers are never reused, and superseded ADRs remain visible with pointers to what replaced them — an explicit append-only decision log design, independent of any chat/messaging system.
- This is a strong precedent for "decisions need a durable, ordered, human-and-machine-inspectable record," but it's a document repository pattern (files in git), not a conversational log — relevant as an alternate/adjacent primitive: cynapse could model channel "decision" events as ADR-like structured records embedded in the log rather than as prose messages.
- Nygard's stated goal — new contributors understanding "the motivation behind previous decisions" — matches exactly the human-inspectability goal the user described for a mission's channel ledger.

## Claim LG15

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Zulip Help Center — Introduction to topics
- URL: https://zulip.com/help/introduction-to-topics
- Type: official docs
- Fetched: yes

Notes:
- Zulip channels host multiple simultaneous topics, each a "shared ordered conversation" (a lightweight named thread) so many discussions proceed in the same channel without interleaving into one another; there is "nothing special about the first message" in a topic (unlike thread-from-a-message UIs).
- Topics are surfaced for inspectability via left sidebar, inbox, and "recent conversations" views — precedent for a per-work-item conversation as a first-class, named, independently-orderable stream nested under a broader channel, matching cynapse's initiative→epic→story nesting idea (channel = initiative/epic, topic = story-level ledger).
- The redirect from `/help/about-streams-and-topics` to this page (observed while fetching) suggests Zulip itself consolidated/renamed this documentation, so treat "streams vs topics" terminology as current-state (channel = Zulip's current term replacing "stream" in places).

## Claim LG16

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: Linear Docs — Sub-initiatives
- URL: https://linear.app/docs/sub-initiatives
- Type: official docs
- Fetched: yes

Notes:
- Linear nests Initiatives up to 5 levels deep; a parent Initiative automatically includes all projects owned directly and all projects from its sub-initiatives, and progress/status rolls up automatically from Issue → Project → Initiative without a separate manual update step.
- The fetched page does not explicitly state whether roll-up is computed live on read or maintained as a periodically-updated separate record — this is a genuine gap in the fetched primary source, not just a summarization limitation.
- Supports the general precedent that hierarchical work (initiative/epic/story) is usually modeled as parent-links-to-children with computed roll-up, rather than the parent's ledger literally containing a copy of every child event — relevant to cynapse's question of whether parent conversations "see" child events by inclusion or by reference/link. Linear's evidence favors reference+computed-rollup over inclusion, but this claim is medium confidence since the live-vs-cached mechanism itself wasn't confirmed.

## Claim LG17

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: A2A Protocol — Life of a Task
- URL: https://a2a-protocol.org/latest/topics/life-of-a-task/
- Type: spec
- Fetched: yes

Notes:
- A2A models agent work as Tasks with a state machine: interrupted states (input-required, auth-required) and terminal states (completed, canceled, rejected, failed); once terminal, "it cannot restart." Tasks are correlated via `contextId` (groups related tasks/messages across a session) and `taskId` (individual task identity), with `referenceTaskIds` linking follow-up tasks to prior ones.
- Explicitly favors "stateful state machines over append-only logs" for the task's current status — a task's live state (submitted/working/input-required/etc.) is not naturally an append-only log fact, it's a current-state field that transitions, even though the *history* of transitions could be logged.
- Directly relevant to use case #5 (agent collaboration beyond chat): a "task" or "work claim" needs a mutable current-state primitive (with legal-transition rules and terminality) layered on top of, or alongside, any append-only event log — logging every transition is fine, but something must also expose "what is the current state now" without replaying the whole log, and must enforce which transitions are legal from which state (a log alone doesn't enforce that).

## Claim LG18

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: GitHub — Dicklesworthstone/mcp_agent_mail (README)
- URL: https://github.com/Dicklesworthstone/mcp_agent_mail
- Type: source code / README
- Fetched: yes

Notes:
- The project's messaging layer (identities, inbox/outbox, threads) is Git-backed markdown with JSON frontmatter (sender, recipients, thread_id, importance, ack) — a mail-like, per-agent-copy design (each agent gets copies in personal inbox/outbox directories), not a single shared log with derived indexes.
- File reservations (advisory leases for coordinating concurrent edits) are explicitly built as a *separate* stateful primitive: a SQLite `file_reservations` table with `path_pattern`, `exclusive` flag, `created_ts`, `expires_ts`, `released_ts` — TTL-based, supporting mutual exclusion (exclusive) or coexistence (shared), independent of the message log.
- Directly supports the claim in the research brief that "a lease needs TTL and mutual exclusion — a state machine, not a log": this real multi-agent-coordination project independently arrived at building leases as a distinct stateful table rather than encoding them as mail messages or log entries, even though it logs a Git-audit-trail of lease actions for inspectability.
- Caveat: this project chose per-recipient mail copies for messaging itself (contrary to the log-with-derived-inbox recommendation), so it's mixed evidence — supports the lease-needs-a-state-machine sub-claim strongly, but is not itself an example of log-as-primitive messaging.

## Claim LG19

Date: 2026-09-27
Status: supports
Confidence: low

Source:
- Label: WebSearch synthesis — Jay Kreps, "The Log: What every software engineer should know about real-time data's unifying abstraction" (LinkedIn Engineering, Dec 2013)
- URL: https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying
- Type: engineering blog
- Fetched: snippet-only (WebFetch returned HTTP 404 for this URL in this session on multiple attempts, despite it being the canonical/commonly-cited URL; likely a dynamic-rendering or availability issue at fetch time, not evidence the article doesn't exist)

Notes:
- Widely and consistently cited (including by a GitHub-hosted PDF mirror and multiple secondary write-ups) as: "a log is... the simplest possible storage abstraction — an append-only, totally-ordered sequence of records," and that logs solve two core distributed-systems problems — ordering changes and distributing data.
- Central thesis (per secondary sources, not independently verified against the primary text in this session): the log should be the system of record, and derived views/indexes/caches are rebuilt by consuming the log rather than being written to directly — the foundational argument for fan-out-on-read/log-as-source-of-truth architectures (Kafka itself is Kreps's implementation of this idea).
- Confidence kept low per instructions since the primary source could not be fetched in this session; treat as background/context rather than a verified citation.

## Claim LG20

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: WebSearch synthesis — Twitter/X "celebrity problem" and hybrid fan-out
- URL: https://dev.to/gabrielanhaia/twitters-fanout-strategy-at-scale-the-trade-off-most-designs-miss-55oa
- Type: engineering blog (secondary write-up)
- Fetched: snippet-only

Notes:
- Pure fan-out-on-write breaks down when a single producer has an extremely large audience: a post from a 50-million-follower account would require ~50 million writes if pushed synchronously to every follower's derived feed index — this is presented as the reason no major system does pure fan-out-on-write universally.
- Symmetric point (see LG06): pure fan-out-on-read has a read-time latency/compute cost that's unacceptable when a single hot consumer refreshes very frequently against a huge merged log set.
- For cynapse this is a scaling caveat rather than a refutation of log-as-primitive: it argues that very high-fan-out broadcast channels (e.g., "all-agents" or "all-employees" channels) may eventually need a precomputed/cached read-side index (a materialized inbox) even under a log-primary design — i.e., "inboxes as derived indexes" may need to be *eagerly* materialized for a subset of hot channels, not always computed lazily on read. This nuances but doesn't overturn the core recommendation.

## Claim LG21

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: WebSearch synthesis — Discord message-storage architecture history (Cassandra → ScyllaDB migrations)
- URL: https://blog.bytebytego.com/p/how-discord-stores-trillions-of-messages
- Type: engineering blog (secondary write-up, ByteByteGo digest of Discord's own posts)
- Fetched: snippet-only

Notes:
- Reinforces LG05 with additional detail: Discord's per-channel log model persisted across two major storage-engine migrations (MongoDB → Cassandra → ScyllaDB) driven by operational/performance concerns, not by any need to change the fundamental one-log-per-channel data model — the structural choice (log per channel, not per recipient) proved durable even as the underlying engine changed twice.
- Secondary source, so treated as corroborating context rather than a primary citation; the primary Discord blog post (LG05) is the load-bearing source.

## Claim LG22

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: A2A Protocol — Life of a Task (contextId as cross-task correlation)
- URL: https://a2a-protocol.org/latest/topics/life-of-a-task/
- Type: spec
- Fetched: yes

Notes:
- `contextId` groups related tasks and independent messages across a session/interaction ("continuity across a series of interactions"), separate from any individual task's own identity/state — this is effectively a thread/conversation-id spanning multiple discrete task state-machines, i.e., a correlation-id pattern for request/response-with-correlation-id and handoff use cases (research brief item 5).
- Supports modeling "request-response with correlation IDs" and "handoffs" as log entries carrying a shared contextId/threadId, while the actual task execution state (in-progress/blocked/done) still needs the separate state-machine primitive noted in LG17 — i.e., correlation/threading fits the log naturally, but live task status does not.

## Claim SY01

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Litestream — How it works
- URL: https://litestream.io/how-it-works/
- Type: official docs
- Fetched: yes

Notes:
- Litestream is strictly single-writer, single-replica: "Each database replicates to a single replica destination," and it works by taking over SQLite's WAL checkpoint with one long-running read transaction — incompatible with concurrent multi-node writers.
- It streams WAL pages as LTX files with monotonically increasing transaction IDs (TXIDs) applied in order on restore — good for durability/DR and read replicas, not multi-writer sync.
- Fits the "solo laptop → cloud backup" tier only; does not on its own extend to multi-machine multi-writer.

## Claim SY02

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Fly.io — How LiteFS works
- URL: https://docs.fly.io/litefs/how-it-works/
- Type: official docs
- Fetched: yes

Notes:
- LiteFS keeps SQLite's single-writer constraint but externalizes leader election: a Consul-based lease names one node "primary"; all writes are routed there (via a `.primary` file convention) and replicated as ordered LTX transaction files to followers.
- Ordering authority is explicit and centralized per database: a monotonically incrementing TXID plus a rolling content checksum detect split-brain and trigger automatic re-snapshot of desynced followers.
- Replication is asynchronous; on primary crash, un-replicated writes can be lost. This is the "single owner assigns per-conversation sequence" pattern cynapse could adopt per conversation rather than per whole database.

## Claim SY03

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: vlcn-io/cr-sqlite — CRDT model
- URL: https://github.com/vlcn-io/cr-sqlite
- Type: source code / project docs
- Fetched: yes

Notes:
- cr-sqlite adds true multi-writer, multi-master merge to SQLite via per-row CRDTs (LWW, counters, fractional-index, OR-sets) plus a causally-ordered change log (`crsql_changes` with `col_version`/`db_version`/`site_id`).
- Explicitly designed for offline-first: "you can write to your SQLite database while offline... we can both come online and merge... without conflict" — leaderless merge, not a single ordering authority.
- Cost: inserts into CRR (conflict-free replicated relation) tables are ~2.5x slower than plain SQLite tables; this is a schema/extension-level change (loadable extension + virtual tables), not "no change to core data model" — adopting it later means retrofitting CRDT columns/metadata onto tables that started as plain SQLite.

## Claim SY04

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Turso Docs — Embedded Replicas
- URL: https://docs.turso.tech/features/embedded-replicas/introduction
- Type: official docs
- Fetched: yes

Notes:
- libSQL/Turso embedded replicas are single-writer/multi-reader: writes always go to the cloud primary; local SQLite file is a read replica synced via manual `.sync()` or periodic `syncInterval`.
- Read-your-writes is guaranteed for the writer that issued the write, even before an explicit sync.
- An `offline: true` mode allows local writes when disconnected, but the docs do not specify the offline-write conflict-resolution model — a documented gap.
- Explicit warning: opening the local DB file while syncing can corrupt it — an operational hazard for the solo-dev tier if cynapse relied on this.

## Claim SY05

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: rqlite Design docs
- URL: https://rqlite.io/docs/design/
- Type: official docs
- Fetched: yes

Notes:
- rqlite replicates SQLite via Raft: all writes go through the Raft log on the leader; "every node ... applies the log entries in exactly the same way" giving total order and strong consistency, but explicitly single-leader, not multi-writer.
- Write throughput is reduced vs standalone SQLite due to round-trips and log writes — rqlite optimizes for availability/fault-tolerance, not write performance.
- Confirms the "single owner assigns global sequence" ordering pattern at the whole-database granularity, which is coarser than a per-conversation partition cynapse would want.

## Claim SY06

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Canonical — dqlite architecture/replication
- URL: https://canonical.com/dqlite/docs/explanation/architecture
- Type: official docs
- Fetched: snippet-only (via search summary, not directly fetched page body)

Notes:
- dqlite = SQLite + C-Raft: single leader replicates write transactions to followers; quorum commit required before ack to client.
- Same shape as rqlite: single-writer-per-cluster with Raft-elected leader, strong total order, no native multi-writer or offline partition tolerance (followers can serve reads, not writes, without a leader).
- Good fit for a small HA cluster (e.g., one org's server tier) but not for laptop-side offline operation.

## Claim SY07

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: git-bug — Lamport clock / bug data model (via source search of util/lamport, bug package docs, and community write-ups)
- URL: https://pkg.go.dev/github.com/MichaelMure/git-bug/util/lamport
- Type: source code
- Fetched: snippet-only (pkg.go.dev summary + community explainer; direct doc/model.md fetch returned 503)

Notes:
- git-bug stores each entity as a chain of git commits under `refs/bugs/<id>`; each commit's tree holds a JSON "ops" blob plus files encoding a Lamport clock value; a separate `refs/identities/<id>` chain holds identity/signing state.
- Ordering is leaderless: each operation carries a Lamport timestamp; on merge, divergent branches are replayed and reordered by logical clock, with ties broken deterministically — no single ordering authority, "nearly always succeeds" because the log is append-only (no in-place edit/delete).
- This is a genuine CRDT-like leaderless merge model, but it piggybacks on git's object store and ref update semantics (a `PersistedClock` per repo) — porting it to cynapse would mean adopting git plumbing as the storage substrate, not layering sync onto an existing SQLite schema.
- PR #1625 title ("make [lamport] safe for multi-process writing") signals the clock implementation has had real correctness bugs under concurrent local writers — a caution about assuming this is a solved, drop-in primitive.

## Claim SY08

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: NATS Docs — JetStream streams
- URL: https://docs.nats.io/nats-concepts/jetstream/streams
- Type: official docs
- Fetched: yes

Notes:
- JetStream streams are append-only, server-side persisted logs; every message gets a stream sequence number starting at 1, and "only one stream can keep a given subject" (deterministic routing) — maps directly onto "one append-only log per conversation."
- Consumers (durable or ephemeral) track position independently with ack semantics and configurable retention (Limits/Interest/WorkQueue) — this is exactly the "per-reader cursor + ack" shape cynapse needs for mail (consume-once) vs channels (durable, non-consuming read cursor).
- This is the strongest structural match among all log/stream servers evaluated for the target data model.

## Claim SY09

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: NATS Docs — Leaf nodes
- URL: https://docs.nats.io/running-a-nats-service/configuration/leafnodes
- Type: official docs
- Fetched: yes

Notes:
- Leaf nodes make outbound-only connections from a constrained/edge system (explicitly analogized to a firewalled facility, i.e. a laptop behind NAT) to a central hub, bridging subject interest without requiring inbound connectivity to the edge node — directly relevant to "laptop syncs to a cloud/server hub."
- Multiple hub URLs can be configured on the leaf side so it has "somewhere to reconnect if one hub server is down," implying reconnect support, but the fetched docs page does NOT document offline message buffering/replay behavior during disconnection — flagged as a gap requiring a follow-up check of JetStream-specific leaf-node persistence behavior before relying on it for offline mail delivery.

## Claim SY10

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: NATS Docs — Accounts (multi-tenancy)
- URL: https://docs.nats.io/running-a-nats-service/configuration/securing_nats/accounts
- Type: official docs
- Fetched: yes

Notes:
- A NATS "account" is a fully isolated tenant subject space: identically named subjects in two accounts never cross — structural isolation, not ACL-based filtering.
- This maps well onto "org id in keys": one account per org/tenant gives hard multi-tenancy at the transport layer, which is the same protocol used for a single laptop's local NATS instance — i.e., the identical primitive spans solo and enterprise tiers (topology answer for (b)).

## Claim SY11

Date: 2026-09-27
Status: supports
Confidence: medium

Source:
- Label: Redis Streams docs
- URL: https://redis.io/docs/latest/develop/data-types/streams/
- Type: official docs
- Fetched: yes

Notes:
- Redis Streams (XADD/XREADGROUP/XACK) give an append-only log with monotonically increasing `<ms>-<seq>` IDs, consumer groups with a Pending Entries List (PEL) tracking delivered-but-unacked entries, and XCLAIM/XAUTOCLAIM for failure recovery — this is a close structural match for mail's "ack = consume once" requirement.
- However Redis Streams are primarily an in-memory/single-node structure; multi-machine durability/replication needs Redis Cluster or Enterprise on top, which is a materially different operational story than JetStream's built-in clustering. Treat as viable for local/solo tier, weaker default story for the enterprise tier.

## Claim SY12

Date: 2026-09-27
Status: mixed
Confidence: low

Source:
- Label: Apache Kafka docs (topic/partition, ordering, consumer offsets) — general knowledge, page fetches returned only navigation shells
- URL: https://kafka.apache.org/documentation/#intro_topics
- Type: official docs
- Fetched: snippet-only (WebFetch repeatedly returned nav-only content; substantive claim not independently verified this session)

Notes:
- Well-established (but NOT freshly fetched this session) Kafka model: total order is guaranteed only within a partition, not across partitions of a topic; consumers track a per-partition offset (cursor) which is exactly the "per-reader cursor" shape.
- Partitioning by a key (e.g., conversation id) would give each conversation a total order if one conversation always maps to one partition — but partition count is fixed at topic-creation time and repartitioning existing data is disruptive, a real migration-cost risk for decision (a).
- Confidence marked low because I could not fetch primary-source confirmation in this session; treat as needing re-verification before being load-bearing for a design decision.

## Claim SY13

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: PowerSync Service architecture
- URL: https://docs.powersync.com/architecture/powersync-service
- Type: official docs
- Fetched: yes

Notes:
- PowerSync buckets are explicitly append-only operation histories (not "latest row" snapshots), and clients sync via cursor-based tracking of "operations accumulated since their last connection" — a strong structural fit for the append-only-log + cursor model, and buckets double as both a sync-efficiency partition and a security/tenancy boundary (e.g. `org_todo_lists["1"]`).
- Source of truth is a single upstream database (Postgres/MongoDB/MySQL/SQL Server/Convex) that PowerSync replicates from — this is a single-writer-at-the-source model; the docs fetched did not address multi-writer conflict resolution, so PowerSync looks better suited as a "server DB → many read-mostly edge replicas" fan-out than as a leaderless multi-writer mesh.

## Claim SY14

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: Zero (Rocicorp) — When to use Zero
- URL: https://zero.rocicorp.dev/docs/when-to-use
- Type: official docs
- Fetched: yes

Notes:
- Zero is explicitly "a client-server system with an authoritative server" backed by Postgres, storing a SQLite replica client-side for fast local reads, but the docs state plainly it "doesn't support offline writes" and is "not local-first."
- Not a fit for cynapse's core offline-agent requirement (cron/headless agents on a laptop with no connectivity); doc explicitly points to CRDT-based alternatives (Automerge, Ditto) for that use case.

## Claim SY15

Date: 2026-09-27
Status: contradicts
Confidence: high

Source:
- Label: Automerge — Hello / how Automerge works
- URL: https://automerge.org/docs/hello/
- Type: official docs
- Fetched: yes

Notes:
- Automerge is a document CRDT (immutable, structural merge of nested JSON-like documents), not a log/stream abstraction — good for collaboratively-edited documents, not naturally for "one append-only log per conversation with acks and cursors."
- Automerge is transport-agnostic (WebSocket, WebRTC, Bluetooth, even email) and merges automatically with no central server — genuinely leaderless — but adopting it would mean modeling mail/channels as CRDT documents rather than as logs, a different core data model than the SQLite-log baseline, contradicting "same model at both tiers" if the log model is kept elsewhere.

## Claim SY16

Date: 2026-09-27
Status: mixed
Confidence: medium

Source:
- Label: ElectricSQL docs — Intro
- URL: https://electric.ax/docs/intro
- Type: official docs
- Fetched: yes

Notes:
- ElectricSQL is fundamentally a read-path sync engine: Postgres is the source of truth, "Shapes" define partial-replication subsets synced to local Postgres/SQLite clients over HTTP; writes flow back through an application-defined API layer ("Writes" guide), not natively through Electric itself.
- Fetched content did not show native append-only-log/cursor semantics or CRDT conflict resolution baked in — it's oriented at reactive client state for typical CRUD apps, a looser fit for cynapse's ack/cursor requirements than PowerSync's or JetStream's.

## Claim SY17

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: Matrix spec — Room version 11 (event DAG, state resolution)
- URL: https://spec.matrix.org/latest/rooms/v11/
- Type: spec
- Fetched: yes

Notes:
- Matrix rooms are event DAGs (`prev_events` back-references, content-addressed event IDs via reference hash) with only partial/causal ordering guaranteed; concurrent branches are reconciled via a deterministic state-resolution algorithm (power-event prioritization → iterative auth-check application → mainline ordering → merge with unconflicted state) so independent homeservers converge without a central authority.
- This is a leaderless federation model exactly of the kind envisioned for enterprise cross-org federation, and it is content-addressable/immutable-event based — directly relevant to decision (a) ("entries immutable and content-addressable").
- Caveat: no single total order per room — cynapse's stated requirement of "total order per conversation, per-reader cursors" is a stronger guarantee than Matrix natively provides; adopting Matrix's DAG model for conversations would require an additional layer (e.g., an assigned stream position) to get per-reader cursor semantics on top.

## Claim SY18

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: HN discussion + Element blog — Synapse operational cost at nation-scale
- URL: https://element.io/blog/synapse-pro-slashes-costs-for-running-nation-scale-matrix-deployments/
- Type: engineering blog
- Fetched: yes

Notes:
- Vendor's own framing implicitly concedes stock Synapse is expensive/operationally heavy at "nation-scale" (tens of thousands of users, e.g. Germany's TI-Messenger healthcare rollout) — Synapse Pro exists specifically to consolidate redundant microservices/components and add elastic scaling and zero-downtime multi-datacenter failover that community Synapse lacks.
- Concrete number: switching to Synapse Pro would save "millions of euros" across all TI-Messenger deployments if adopted — no baseline/percentage given, so treat as directional not quantitative.
- Cross-checked (search-snippet only, not independently fetched) against community sources: a 100-user active homeserver needs ~4GB RAM, 500-user federation-active needs ~8GB, and workers/Postgres become mandatory above ~200 users — these specific figures are snippet-only and not verified against a fetched primary source in this session.

## Claim SY19

Date: 2026-09-27
Status: contradicts
Confidence: medium

Source:
- Label: HN / Dendrite FAQ / community write-ups on Dendrite and Conduit maturity
- URL: https://matrix-org.github.io/dendrite/faq
- Type: official docs
- Fetched: snippet-only (via search aggregation; FAQ page itself not independently re-fetched)

Notes:
- Dendrite (the intended lighter-weight Go homeserver) is described in aggregated sources as still not production-ready for large deployments; Conduit, despite government funding to stabilize the Matrix.org foundation, is described as largely dormant.
- Implication for cynapse: federation-style architectures (Matrix-like) carry a heavy, multi-implementation operational maturity risk — the "reference" implementation (Synapse) is resource-hungry and the lighter alternatives are not yet trustworthy for scale, undermining "federation just works at enterprise scale" as an assumption.

## Claim SY20

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Nostr vs ActivityPub protocol comparison (aggregated, D-Central / Soapbox summaries)
- URL: https://soapbox.pub/blog/comparing-protocols
- Type: engineering blog
- Fetched: snippet-only (search-aggregated summary, not independently fetched with WebFetch)

Notes:
- Nostr: relays are simple, dumb message routers; clients, not relays, hold identity (self-sovereign secp256k1 keypair) and publish signed, content-addressable events (SHA-256 id) to many relays redundantly — relays do not talk to each other. This is a genuinely leaderless, no-federation-protocol design, contrasting with Matrix's server-to-server federation and state resolution.
- ActivityPub: server-centric federation, one account belongs to exactly one server whose admin sets the rules — closer to "hub/relay per org" than to peer-to-peer.
- Relevance to cynapse: Nostr's model (dumb multi-homed relays + self-sovereign signed events) is a useful contrast to Matrix's stateful DAG homeservers — it shows a cheaper-to-operate alternative but pushes all ordering/dedup work to clients, which is a poor fit for cynapse's per-reader cursor and ack requirements, since there is no server-side authority to assign a durable cursor position against.

## Claim SY21

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Slack Engineering — Scaling Datastores at Slack with Vitess
- URL: https://slack.engineering/scaling-datastores-at-slack-with-vitess/
- Type: engineering blog
- Fetched: yes

Notes:
- Slack started with per-workspace sharding (one MySQL shard held all of a workspace's data) and hit hard ceilings once large enterprise customers' single shards saturated the biggest available hardware, while other shards sat underutilized — a direct illustration of picking too coarse a partition/sync unit early.
- Migrated (2017 start, 99% of MySQL traffic on Vitess by Dec 2020) to resharding by a different key — e.g., channel id for message data instead of workspace id — reaching 2.3M QPS at peak (2M reads / 300K writes), 2ms median / 11ms p99 latency.
- Direct precedent for decision (a): choosing "conversation" (channel-equivalent) rather than "workspace/org" as the fundamental partition/sync unit avoids the exact re-sharding migration Slack was forced into.

## Claim SY22

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Discord — How Discord Stores Trillions of Messages
- URL: https://discord.com/blog/how-discord-stores-trillions-of-messages
- Type: engineering blog
- Fetched: yes

Notes:
- Discord partitions messages by (channel, time bucket); "all messages for a given channel and bucket are stored together and replicated across three nodes," using Snowflake IDs (globally unique, time-sortable, coordination-free) for chronological ordering — the same partition-by-conversation and sortable-id pattern recommended for cynapse.
- Migrated from Cassandra to ScyllaDB in 2022 (177 nodes → 72 nodes) specifically to eliminate hot-partition problems, GC pauses, and heavy compaction maintenance, while scaling from billions (2017) to trillions (2022) of messages; p99 historical-fetch latency dropped from 40-125ms to 15ms.
- Reinforces: (1) partition by conversation id, (2) use a globally unique sortable id minted at write time (Snowflake ≈ ULID/UUIDv7 role) rather than a local autoincrement, so re-partitioning later doesn't require renumbering.

## Claim SY23

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: Time-sortable identifiers (UUIDv7, ULID) explainer aggregation
- URL: https://www.authgear.com/post/time-sortable-identifiers-uuidv7-ulid-snowflake/
- Type: engineering blog
- Fetched: snippet-only (search-aggregated; not independently fetched with WebFetch)

Notes:
- ULID (48-bit ms timestamp + 80 bits randomness, Crockford Base32) and UUIDv7 (IETF-standardized, timestamp in high bits) are "functionally twins": both make inserts sequential-append rather than random, both are generated with no central coordinator, and both preserve rough chronological sort order.
- Directly supports decision (a): minting conversation/entry ids as UUIDv7/ULID at creation time (rather than SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`, which is per-database-file and not globally unique) means the same id survives a later move from one local SQLite file to a multi-machine or sharded store with no renumbering/migration.


## Claim LC01

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: cyber-truss model docs — glossary "Run ledger", canonical-execution "The run ledger schedules, it does not decide"
- URL: file:///home/unional/code/cyberuni/cyber-truss/apps/web/src/content/docs/model/glossary.md (line 187), canonical-execution.md (line 399)
- Type: design docs (local, sibling project)
- Fetched: yes (read locally)

Notes:
- The run ledger is "the append-only record of a run: pending jobs, what each waits on, criteria versions, resolutions, and decisions. It collects the contributions addressed to each set, with their provenance, and never merges them."
- This is one log whose entries are addressed to recipients (sets), with each recipient's controller reading the entries addressed to it. That is a log with a derived per-addressee index, not per-recipient copies. Decisions are recorded in the same log ("a choice between states is recorded rather than prevented", layers.md:77).
- Design only; nothing in cyber-truss is built yet.

## Claim LC02

Date: 2026-09-27
Status: mixed
Confidence: high

Source:
- Label: cyber-sdd ADR-0020 — Sharded ledger
- URL: file:///home/unional/code/cyberuni/cyber-sdd/docs/adr/0020-sharded-ledger.md
- Type: ADR (local, sibling project)
- Fetched: yes (read locally)

Notes:
- A single shared `ledger.jsonl` caused "every concurrent mission [to raise] a git merge conflict". Resolved by one file per CR per writer (`<cr-ref>.<hash>.jsonl`), which makes conflicts structurally impossible.
- Cost: "Neither `seq` nor a wall-clock `ts` is load-bearing ... ordering, where it matters, is git history." It works because the readers only check existence or count lines.
- For cynapse: sharding per writer is the leaderless answer to concurrent writes, and it gives up canonical order. A ledger meant for humans to follow decisions needs the order that an owner-assigned per-conversation `seq` provides.

## Claim LC03

Date: 2026-09-27
Status: supports
Confidence: high

Source:
- Label: cyberlegion FileStore and cyber-mux MuxAdapter (local survey)
- URL: file:///home/unional/code/cyberuni/cyberlegion/packages/cyberlegion/src/store/store.ts ; file:///home/unional/code/cyber-mux/packages/cyber-mux/src/mux.ts (line 784)
- Type: source code (local)
- Fetched: yes (read by a local agent)

Notes:
- cyberlegion mail stores one JSON file per message per recipient (`inbox/<agent-id>/<msg-id>.json`), acked by an atomic rename into `read/`. That is per-recipient copies. The store comment names `SqliteStore` as the sanctioned replacement.
- cyber-mux abstracts 7 multiplexers behind `MuxAdapter`, with capability flags; a missing capability throws instead of degrading.

## Claim PR01

Date: 2026-09-29
Status: mixed
Confidence: medium

Source:
- Label: beads architecture (via WebFetch synthesis of README)
- URL: https://raw.githubusercontent.com/steveyegge/beads/main/README.md
- Type: official docs
- Fetched: yes

Notes:
- Beads issues carry `priority` (`-p`), `type` (`-t`), `assignee`, `status`. Dependency relationship types: `blocks`, `relates-to`, `duplicates`, `supersedes`, `replies-to` (README summary; core-concepts/dependencies.md gives a more complete, partly different list — see PR07).
- Hash-based IDs `bd-a1b2` are explicitly framed as preventing merge collisions in multi-agent/multi-branch workflows — same problem cynapse's UUIDv7/UUIDv5 scheme targets.
- Hierarchical IDs for epics/subtasks: `bd-a3f8` → `bd-a3f8.1` → `bd-a3f8.1.1`. cynapse has no analogous built-in hierarchy encoded in the ID itself (parent linkage is via anchor entry / parent entry instead) — a structural divergence worth noting, not necessarily a defect.
- README claims storage backend is Dolt (a "version-controlled SQL database with cell-level merge, native branching, built-in sync") with `.beads/issues.jsonl` as export/interchange, not source of truth. This differs materially from cynapse's plain SQLite (WAL) design — see PR08/PR09 for confirmation from primary docs.

## Claim PR02

Date: 2026-09-29
Status: supports
Confidence: high

Source:
- Label: beads core-concepts/hash-ids.md
- URL: https://raw.githubusercontent.com/gastownhall/beads/main/docs/core-concepts/hash-ids.md
- Type: official docs
- Fetched: yes

Notes:
- IDs are derived from "Issue title, creation timestamp, random salt" — a content/randomness hash, not a pure content hash — producing a short hex string, default length 4 chars (`bd-a1b2`), configurable.
- Explicit rationale: sequential numbering fails distributed creation ("Multiple agents create issues simultaneously", "Different branches have independent numbering"); hash IDs need "No coordination needed between creators" and "work seamlessly during merges where both versions coexist."
- Collision handling is NOT purely probabilistic-avoidance: "On import, if hash collision detected, Beads appends disambiguator, Both issues preserved" — i.e., collisions are expected to occur rarely and are handled post-hoc, not architected to be impossible. `bd info --schema --json | jq '.collision_count'` exposes a live collision counter.
- This validates cynapse's choice of UUIDv7 (time-ordered, globally unique, no coordination) over any short-hash scheme — beads' 4-hex-char ID space is deliberately small (human-typeable) and trades collision risk for a decision cynapse doesn't need to make since stream/entry ids aren't meant to be typed by humans. Cynapse's UUIDv5-from-natural-key for convergent concurrent creation is a stronger guarantee than beads' "detect and disambiguate" approach.

## Claim PR03

Date: 2026-09-29
Status: contradicts
Confidence: high

Source:
- Label: beads core-concepts/sync-concepts.md
- URL: https://raw.githubusercontent.com/gastownhall/beads/main/docs/core-concepts/sync-concepts.md
- Type: official docs
- Fetched: yes

Notes:
- Beads' actual (current) source of truth is a local embedded Dolt database, NOT SQLite and NOT the JSONL file: "The local Dolt database is the source of truth for `bd list`, `bd show`, `bd ready`, and every write command."
- Cross-machine sync is `bd dolt push` / `bd dolt pull` against `refs/dolt/data`, a ref kept separate from the git source branches — this is a git-native but non-file-diff sync mechanism (opaque Dolt chunks, not JSONL text diffs).
- `.beads/issues.jsonl` is explicitly "an export... for viewers, interchange, migration, and backup," and JSONL import is "upsert-only; it cannot infer that records absent from an export were deleted" — i.e., JSONL is a lossy, non-authoritative shadow of the real store.
- This contradicts the popularized "beads = JSONL committed to git" description (widespread in blog summaries, e.g. Better Stack) — the project moved away from JSONL-as-mechanism after finding it insufficient. Cynapse should not assume "commit JSONL to git" is a validated pattern; it was tried and superseded.

## Claim PR04

Date: 2026-09-29
Status: contradicts
Confidence: high

Source:
- Label: beads bd 1.0 migration gist (community, references PR #2096) + WebSearch snippet
- URL: https://gist.github.com/leonletto/606e8afbb3603870d14b4123707416a2
- Type: issue thread / community doc
- Fetched: snippet-only

Notes (snippet-only, low structural confidence but corroborated by PR03/PR08):
- Beads went through at least two storage-engine generations: "SQLite-era" → "server-mode Dolt" → "bd 1.0 embedded [Dolt] mode," with a documented migration guide covering "two recovery paths, schema drift repair, auto-commit/auto-push setup, and sync re-establishment."
- The existence of a dedicated migration/recovery guide for storage-engine changes is itself evidence that changing the durable storage engine after users have data is a big, disruptive event — a caution for cynapse if it later needs to move off SQLite for a "hub" (multi-machine) mode, per the project's own stated roadmap. Design the sync layer as a bolt-on from day one rather than a storage swap.

## Claim PR05

Date: 2026-09-29
Status: mixed
Confidence: high

Source:
- Label: WebSearch aggregation of beads CHANGELOG.md
- URL: https://raw.githubusercontent.com/steveyegge/beads/main/CHANGELOG.md
- Type: official docs
- Fetched: yes (fetched but tool found no explicit migration-rationale text in the excerpt served)

Notes:
- Confirms "The JSONL-based sync system (`bd sync`, git-portable mode, belt-and-suspenders mode) has been removed. Dolt-native push/pull via git remotes is the only sync mechanism, and `bd sync` is now a deprecated no-op."
- Schema migrated v53 → v66 (13 main-series migrations) — indicates substantial, ongoing schema churn even post-1.0, suggesting the data model is still not settled. cynapse should expect its own stream/entry schema to churn similarly and should version the schema explicitly from the start (the design doc doesn't yet mention a schema-version field).
- Recovery command exists: `bd export --all -o .beads/backup/pre-1.3.0-$(date +%Y%m%d).jsonl` used before risky migrations — i.e., JSONL survives only as a pre-migration safety export, reinforcing PR03.

## Claim PR06

Date: 2026-09-29
Status: contradicts
Confidence: high

Source:
- Label: GitHub issue #1084, steveyegge/beads (mirrored gastownhall/beads)
- URL: https://github.com/steveyegge/beads/issues/1084
- Type: issue thread
- Fetched: yes

Notes:
- Opened 2026-01-14. Reports beads' "town-level" database corrupting within seconds of startup inside a Docker devcontainer (macOS host, `golang:1.25.0-trixie` image): `"sqlite3: database disk image is malformed"` during pre-migration orphan cleanup.
- A second, compounding failure in the same environment: the daemon's RPC server can't start because `"failed to set socket permissions: chmod /workspace/.../.beads/bd.sock: invalid argument"` — a Unix-socket permission quirk specific to bind-mounted/overlay filesystems in containers.
- Notably beads' architecture now includes a background daemon holding a socket and a SQLite connection concurrently with CLI-driven writes to the same file — this is an internal component (used for the RPC layer, distinct from the Dolt engine used for the main store), and it is a second source of file-locking hazard beyond the main storage engine.
- Status: unresolved as of research date. Direct evidence that background daemons + shared local DB files + containerized/networked filesystems is a real, currently-unfixed failure class. Cynapse's local-first SQLite (WAL) design should treat "agent runs inside a devcontainer with a bind-mounted volume" as a tested scenario, and should not assume a background daemon is safe to add without first validating socket/file behavior under bind mounts.

## Claim PR07

Date: 2026-09-29
Status: supports
Confidence: high

Source:
- Label: beads core-concepts/dependencies.md
- URL: https://raw.githubusercontent.com/gastownhall/beads/main/docs/core-concepts/dependencies.md
- Type: official docs
- Fetched: yes

Notes:
- Dependency types split into blocking (`blocks` default, `parent-child`, `conditional-blocks`, `waits-for`) and non-blocking/annotation-only (`related`, `tracks`, `discovered-from`, `caused-by`, `validates`, `supersedes`). This is a materially richer, more precise taxonomy than the README's casual list (PR01) — always prefer the core-concepts doc over the README summary for beads' actual semantics.
- `bd ready` algorithm, confirmed precisely: "An issue is ready when ALL of its blocking dependencies are closed" — a pure AND-closure over the blocking-type edges only; non-blocking edges are excluded from readiness computation entirely.
- This is directly analogous to a query cynapse doesn't yet have: a "what needs my attention now" view over pending-answer state records / leases, filtered by dependency/blocking links. cynapse's design has `state` (leases, pending answers) but no described equivalent of a typed, filterable dependency graph across entries/streams for computing "ready work." Worth considering whether `refs` (gh:org/repo#12-style shorthands) should be typed enough to support a similar block/non-block distinction, since cynapse explicitly keeps issue tracking itself out of scope (owned by GitHub/Asana) — this may be a deliberate non-goal rather than a gap.

## Claim PR08

Date: 2026-09-29
Status: mixed
Confidence: medium

Source:
- Label: WebSearch aggregation ("beads compaction memory decay")
- URL: https://betterstack.com/community/guides/ai/beads-issue-tracker-ai-agents/ (secondary) + general search snippets
- Type: blog / secondary source
- Fetched: snippet-only

Notes (snippet-only, treat as low-confidence pending primary doc):
- `bd compact` implements "agentic memory decay" — identifies closed issues older than a threshold (example cited: 30 days), uses an LLM to read full issue content and write a concise summary, replacing the full record to save context-window tokens on later `bd ready`/`bd list --json` calls.
- This is a genuinely new idea relative to cynapse's design: cynapse's `views` (saved filters) and per-reader `cursor` narrow *which* entries a reader sees, but nothing in the described design shrinks the token cost of an individual old entry/stream itself. An LLM-summarization compaction pass over long-closed/reconciled streams is a concrete borrowable idea — gate it behind the stream's `lifecycle state` (e.g., only summarize streams already marked "reconciled").
- Low confidence because not confirmed against beads' own primary docs/CHANGELOG in this session (WebFetch of the doc file wasn't attempted for `bd compact` specifically) — flag for follow-up if this becomes load-bearing for a cynapse decision.

## Claim PR09

Date: 2026-09-29
Status: mixed
Confidence: medium

Source:
- Label: WebSearch aggregation of beads multi-agent/contributor docs
- URL: https://raw.githubusercontent.com/steveyegge/beads/main/README.md (README) + directory listing of docs/multi-agent/
- Type: official docs (directory structure confirmed via `gh api`) + README text
- Fetched: yes (README), directory listing yes, individual multi-agent .md files 404'd on raw fetch (path likely differs from listing due to redirect/case)

Notes:
- README: contributors on forks run `bd init --contributor` to route planning to a separate local repo (e.g. `~/.beads-planning`), keeping issue-tracking commits out of the PR diff sent upstream; maintainers are auto-detected via SSH/HTTPS credentials to allow shared planning without "PR contamination."
- The beads repo now ships a whole `docs/multi-agent/` doc set with files named `bucket-federation.md`, `coordination.md`, `federation.md`, `routing.md`, `multi-repo-migration.md` — strong signal that multi-repo/multi-agent federation is a first-class, actively-developed concern for beads, not an afterthought. cynapse's design doc doesn't yet describe a federation/routing model across repos/hubs beyond "later a hub for multi-machine" — beads' need to build out 5 separate docs for this suggests it is a larger design surface than a single line implies.
- The README also documents a "message issue type" with "threading (`--thread`), ephemeral lifecycle, and mail delegation" — i.e., beads bolted a lightweight messaging feature onto its issue tracker, the mirror image of cynapse's approach (a messaging layer that intentionally keeps issue-tracking out). This is useful validating evidence that the two concerns (structured work items vs. free-form agent messages) are frequently conflated by tool builders, and cynapse's explicit separation (routing issues to GitHub/Asana, owning only communication) is a considered position, not an oversight.

## Claim PR10

Date: 2026-09-29
Status: supports
Confidence: high

Source:
- Label: mcp_agent_mail README (WebFetch synthesis)
- URL: https://raw.githubusercontent.com/Dicklesworthstone/mcp_agent_mail/main/README.md
- Type: official docs
- Fetched: yes

Notes:
- Data model: `projects` keyed by `id` + `human_key` (absolute path) + `slug`; `agents` keyed by `name` (adjective+noun) with `program`, `model`, `task_description`, `inception_ts`, `last_active_ts`, `registration_token`.
- `messages` table: shared row per message (`id`, `project_id`, `sender_id`, `thread_id`, `subject`, `body_md` GFM, `created_ts`, `importance`, `ack_required`). Confirms cynapse's assumption that a single shared entry row + per-reader state is the natural design: mcp_agent_mail does NOT duplicate message bodies per recipient in its DB.
- `message_recipients` is a separate table with `kind` (`to`/`cc`/`bcc`) and per-row `read_ts`/`ack_ts` — this is structurally identical in spirit to cynapse's proposed "entry" (shared, immutable) + "cursor"/"state" (per-reader read/unread, pending-answer) split. Direct validation of cynapse's core structural bet.

## Claim PR11

Date: 2026-09-29
Status: mixed
Confidence: high

Source:
- Label: mcp_agent_mail README (WebFetch synthesis)
- URL: https://raw.githubusercontent.com/Dicklesworthstone/mcp_agent_mail/main/README.md
- Type: official docs
- Fetched: yes

Notes:
- Storage is dual: canonical Markdown files under `messages/YYYY/MM/{id}.md` with JSON frontmatter (fenced `---json...---`) committed to a per-project git repo, PLUS SQLite (with FTS5) as the query/index layer. Per-recipient human-readable *copies* also get written to `agents/{AgentName}/inbox/YYYY/MM/{msg-id}.md` and `.../outbox/...` — explicitly described as "for human auditability," derived from (not a second source of truth alongside) the canonical row + recipient state.
- This is a hybrid: shared canonical row in SQLite (matches cynapse's entry model) PLUS git-archived, human-readable, append-only copies (which cynapse's stream/entry design doesn't have an analogue for — cynapse entries live only in SQLite). Git-archived markdown gives free human review, `git blame`/history, and diff-based auditing without touching the DB — a concrete borrowable idea for cynapse, at least optionally, since cynapse is local-first and already git-adjacent (the `cynapse` package itself lives in a git repo, and its agent-plugin skill layer would plausibly want a human-legible trail).
- Caveat: this duplicates storage (git objects + SQLite rows) and requires keeping the two in sync — a source of the FD/commit-storm problems documented in PR14/PR15. Cynapse should treat "also archive to git" as an optional, batched, best-effort export, never a write-path dependency.

## Claim PR12

Date: 2026-09-29
Status: supports
Confidence: high

Source:
- Label: mcp_agent_mail README (WebFetch synthesis)
- URL: https://raw.githubusercontent.com/Dicklesworthstone/mcp_agent_mail/main/README.md
- Type: official docs
- Fetched: yes

Notes:
- File reservations (leases): `file_reservation_paths(project_key, agent_name, paths[], ttl_seconds, exclusive, reason)`; stored in SQLite AND written as JSON artifacts under `file_reservations/{sha1-of-path}.json`; matched using "Git wildmatch pathspec semantics"; TTL auto-expiry plus explicit `released_ts`; stale locks recoverable via `doctor repair`.
- This maps closely onto cynapse's `state` records described as "leases" — mcp_agent_mail's implementation confirms leases need: an explicit TTL, an explicit release timestamp (not just deletion), a documented pathspec-matching rule for what counts as "overlapping," and a repair/recovery tool for when a lease-holder dies without releasing. Cynapse's design doc doesn't yet mention TTL or a repair path for orphaned leases — worth adding explicitly.

## Claim PR13

Date: 2026-09-29
Status: supports
Confidence: high

Source:
- Label: mcp_agent_mail README (WebFetch synthesis)
- URL: https://raw.githubusercontent.com/Dicklesworthstone/mcp_agent_mail/main/README.md
- Type: official docs
- Fetched: yes

Notes:
- Context-cost features aimed squarely at agent token budgets: `summarize_thread(project_key, thread_id, include_examples?)` extracts key points/actions/participants from a whole thread in one call; `fetch_inbox(..., since_ts?, urgent_only?, unread_only?, include_bodies?, limit?)` lets an agent fetch headers-only, only-unread, or only-urgent messages, explicitly to "cut token-burn for polling agents."
- Threading: reply inherits sender's `thread_id`, or if absent, sets `thread_id` to the original message's own `id` (root-message-as-thread-id pattern) — a simple, cheap threading rule cynapse could adopt for entry's "parent entry" reply-tree: a reply with no parent could root a new thread whose thread-id is its own entry id. Cynapse's entry already has parent-entry linkage for a reply tree; deriving a `thread_id` as "walk parent chain to root" vs. storing a denormalized `thread_id` on write (mcp_agent_mail's choice) is a concrete tradeoff cynapse should decide explicitly — denormalizing avoids recursive parent-walks on every thread query.
- Bare `unread_only=true` / `include_bodies=false` flags are the minimal, load-bearing feature for context-cost control — cynapse's `output(data, readable)` / `--json` convention plus per-reader `cursor` should ensure equivalent flags exist on any "list entries" command (fetch metadata-only, unread-only) from day one, not as a later optimization.

## Claim PR14

Date: 2026-09-29
Status: contradicts
Confidence: high

Source:
- Label: mcp_agent_mail_rust issue #317
- URL: https://github.com/Dicklesworthstone/mcp_agent_mail_rust/issues/317
- Type: issue thread
- Fetched: yes

Notes:
- Reports **two SQLite corruption events in one evening, 2h44m apart**, from an 8-12 agent swarm writing concurrently on a single Linux host, running mcp_agent_mail_rust v0.3.31-0.3.35.
- Forensic detail: "83 of 93 duplicated pages were simultaneously on the freelist and referenced by live B-trees, across 22 distinct B-trees" — a serious, structural SQLite corruption under concurrent write load, not a one-off disk error.
- Load-bearing detail: the project's own hourly `.bak` files, produced via `sqlite3_backup` on a separate "canonical" SQLite path, verified clean (`integrity_check` ok) on databases that the actively-serving path had *just* corrupted moments earlier — i.e., the corruption is specifically a concurrency/locking defect in the serving code path (reportedly "FrankenSQLite," a custom variant), not a generic SQLite-under-WAL limitation.
- Maintainer response: closed "not planned" — declined to add a runtime/compile-time switch to the plain canonical SQLite backend for serving, despite the reporter's evidence it doesn't corrupt.
- **This is the single most important piece of evidence for cynapse's "SQLite (WAL) first" plan**: concurrent multi-agent write load (8-12 agents) against a shared local SQLite file is a demonstrated corruption risk in a directly comparable tool, and the fix path that worked (plain canonical SQLite + `sqlite3_backup`, avoiding a customized/forked SQLite engine) was rejected upstream for reasons unrelated to correctness. Cynapse should: (a) use stock, unmodified SQLite (not a custom fork/variant), (b) keep a single writer per stream (already true — "single order owner" assigns seq), and (c) test explicitly under >8 concurrent-agent write load before calling WAL-mode SQLite sufficient for the target scale.

## Claim PR15

Date: 2026-09-29
Status: mixed
Confidence: medium

Source:
- Label: mcp_agent_mail_rust release notes (WebSearch snippet)
- URL: https://newreleases.io/project/github/Dicklesworthstone/mcp_agent_mail/release/v0.2.1
- Type: issue thread / release notes
- Fetched: snippet-only

Notes (snippet-only):
- "SQLite now uses NullPool to prevent FD exhaustion on macOS" and "improving LRU repo cache to prevent EMFILE errors under high concurrency" — both are file-descriptor exhaustion bugs triggered by scaling concurrent agent connections against the SQLite+git-archive combo.
- A "commit coalescer batches archive updates so bursts of activity do not become commit storms" — i.e., the git-archival side (PR11) needed explicit batching to avoid one-git-commit-per-message under burst load. This directly supports treating git-archival as a batched, asynchronous, best-effort side effect (per PR11's caveat), not a synchronous per-entry write.
- Confidence held at medium because sourced from a release-notes aggregator snippet rather than the primary changelog; the FD-exhaustion and commit-storm failure modes are plausible/consistent with PR14's broader "concurrency at scale breaks the naive local-file design" pattern, but exact wording/version isn't independently verified against Dicklesworthstone's own changelog file in this session.

## Claim PR16

Date: 2026-09-29
Status: supports
Confidence: high

Source:
- Label: AgentMail docs — Messages
- URL: https://www.agentmail.to/docs/messages
- Type: official docs
- Fetched: yes

Notes:
- Message fields: `message_id`, `thread_id`, `to`/`cc`/`bcc`/`from`, `text`/`html`, `extracted_text`/`extracted_html` (quoted history and trailing signature/boilerplate stripped automatically), `subject`, `labels`, attachments array.
- Threading rule, inherited from email semantics: sending an initial message creates a new `Thread`; a reply is "added to the existing `Thread`" — thread is the addressable/queryable unit, message is the leaf. This is structurally identical to what cynapse calls stream (ordered, addressable, has membership/metadata) vs. entry (leaf, immutable) — validates the two-level container/item model in general, independent of the specific field names.
- AgentMail deliberately has **no explicit read/unread or ack field on the message row**; its own docs recommend simulating state via user-defined labels (`"read"`, `"unread"`) applied per message. This is a materially weaker state model than mcp_agent_mail's or cynapse's own per-reader `cursor`/state records: labels-as-state conflates categorization with read tracking, and (per the docs) doesn't obviously support multiple independent readers per inbox with independent read state. cynapse's explicit per-reader `cursor` is a stronger design than AgentMail's label hack for anything beyond a single-owner inbox.

## Claim PR17

Date: 2026-09-29
Status: mixed
Confidence: medium

Source:
- Label: AgentMail docs — Websockets/API reference
- URL: https://www.agentmail.to/docs/api-reference/websockets
- Type: official docs
- Fetched: yes

Notes:
- Real-time event model: connect via `wss://ws.agentmail.to/v0?api_key=...`, subscribe to filtered event types (`message.received` + spam/blocked/unauthenticated variants, `message.sent/delivered/bounced/complained/rejected/opened`, `domain.verified`), filterable by up to 10 `inbox_id`s and 10 `pod_id`s; server acks with a `subscribed` confirmation, then streams events each carrying a unique `event_id`.
- This is a fairly rich event taxonomy for a hosted product — cynapse's design doc doesn't yet specify a push/subscription mechanism at all (its CLI is presumably pull/poll via cursor). If cynapse ever wants live agent-to-agent notification (vs. poll-based cursor advancement), AgentMail's model — typed events, explicit subscription with bounded filter cardinality (max 10 ids), and a per-event unique id for idempotent client-side dedup — is a reasonable reference shape to copy rather than invent from scratch. Flagged mixed/medium because this is an API surface from a hosted SaaS, not something confirmed to run well at agent-swarm scale (no issue-thread evidence located either way for AgentMail specifically).

## Claim PR18

Date: 2026-09-29
Status: mixed
Confidence: low

Source:
- Label: WebSearch general (AgentMail data model, no deep primary doc for inbox/label internals)
- URL: https://docs.agentmail.to/welcome (attempted, returned generic welcome text only)
- Type: official docs
- Fetched: yes (page fetched but contained no structural detail beyond a one-line description: "AgentMail is an API platform for giving AI agents their own inboxes to send, receive, and act upon emails.")

Notes:
- Could not confirm from primary docs in this session whether AgentMail inboxes store one row per (message, recipient) internally (classic email per-recipient-copy model) or a single canonical row with recipient lists (as PR16 suggests via `to`/`cc`/`bcc` arrays on one Message object). The public API's shape (arrays on a single Message object) is consistent with either internal storage; API shape alone doesn't resolve it. Flagging this as an open gap rather than asserting an answer — do not cite this claim as settling per-recipient-vs-shared for AgentMail specifically.

## Claim PR19

Date: 2026-09-29
Status: supports
Confidence: medium

Source:
- Label: beads core-concepts directory listing (via gh api, confirms doc structure) + CHANGELOG schema-version count (PR05)
- URL: https://api.github.com/repos/gastownhall/beads/contents/docs/core-concepts
- Type: source code / repo structure
- Fetched: yes

Notes:
- Beads' own doc set separates `hash-ids.md`, `adaptive-ids.md`, `dependencies.md`, `graph-links.md`, `issues.md`, `labels.md`, `metadata.md`, `sync-concepts.md` as distinct top-level concepts — i.e., a mature version of this kind of tool ends up needing dedicated design docs for ID scheme, dependency graph, labels, and sync as separate concerns, not one paragraph each. This is process evidence (how much documentation surface a comparable tool needed once past "scaffold stage") rather than a technical claim, but it's a size/complexity signal cynapse should expect: sync semantics and ID semantics alone are likely to need their own dedicated design docs, not subsections of one page, once cynapse gets past scaffold stage.

## Claim PR20

Date: 2026-09-29
Status: contradicts
Confidence: medium

Source:
- Label: WebSearch snippet on beads issue #376 (title only, not fetched in full)
- URL: https://github.com/gastownhall/beads/issues/376
- Type: issue thread
- Fetched: snippet-only (title captured via search: "I want to love Beads but the AI generated docs make it impossible")
- Note: not independently fetched/read in full this session; title alone is suggestive, treat as weak signal.

Notes:
- Even a title-only signal is worth recording: a user-facing complaint that AI-generated documentation made a tool with a genuinely novel, non-obvious data model (Dolt-backed, hash-ID, dependency-graph issue tracker) hard to adopt. This is circumstantial evidence that a structurally sophisticated local-first agent-data-model tool needs unusually clear, hand-checked docs, not auto-generated ones, precisely because the storage/ID/sync model diverges from mainstream intuition (plain SQLite, sequential IDs, git-diffable text). Relevant to cynapse's own docs effort (`apps/web` Starlight site) once the stream/entry/seq model ships — the design is similarly non-obvious (UUIDv7 + per-stream seq assigned by a single order owner + anchor-entry branching) and will need the same care.


## Claim LC04

Date: 2026-09-28
Status: supports
Confidence: high

Source:
- Label: GitHub REST API — Notifications (thread object)
- URL: https://docs.github.com/en/rest/activity/notifications
- Type: official docs
- Fetched: yes

Notes:
- A notification thread holds `subject {title, url, latest_comment_url, type}`, `reason` (15 values, e.g. `mention`, `review_requested`, `state_change`, `ci_activity`), `unread`, and `last_read_at`. Content stays in the issue or PR; the notification only references it.
- Read state is per thread. "Anything updated since this time will not be marked as read." New activity after `last_read_at` makes a thread unread again.
- Precedent for passing messages by reference, with read state kept per reader and per subject.

## Claim LC05

Date: 2026-09-28
Status: supports
Confidence: high

Source:
- Label: CloudEvents — dataref extension
- URL: https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/dataref.md
- Type: spec
- Fetched: yes

Notes:
- `dataref` is "a reference to a location where the event payload is stored", the claim-check pattern. It covers size, integrity, and access-control use cases.
- Precedent for events that carry references instead of payloads.

## Claim LC06

Date: 2026-09-28
Status: mixed
Confidence: high

Source:
- Label: Asana tasks API (resource_subtype); GitHub organization issue types
- URL: https://developers.asana.com/reference/tasks ; https://docs.github.com/en/issues/tracking-your-work-with-issues/configuring-issues/managing-issue-types-in-an-organization
- Type: official docs
- Fetched: yes

Notes:
- The Asana task `resource_subtype` is `default_task`, `milestone`, `approval`, or `custom`.
- GitHub issue types are organization-wide. The defaults are task, bug, and feature, and an organization can create up to 25 custom types.
- Both platforms let a project model initiatives and epics in more than one way. That is why the hierarchy is a convention a project overrides, not cynapse code.

## Claim LC07

Date: 2026-09-29
Status: supports
Confidence: high

Source:
- Label: buddy-agent-harness reference resolver, tested (PR repobuddy/buddy-agent-harness#193)
- URL: https://github.com/repobuddy/buddy-agent-harness/pull/193
- Type: source code plus a direct test
- Fetched: yes (the CLI was built and run locally)

Notes:
- The project tier is `<root>/.agents/references/`. Names are flat (`^[a-z0-9]+(?:[-.][a-z0-9]+)*$`). A name shared by two plugins is an `ambiguous` error.
- A project copy of `<name>` answers for `plug-a/<name>` and `plug-b/<name>` alike, and it hides the ambiguity error. A dotted prefix (`plug-a.<name>`) resolves correctly and can be overridden per plugin.
- `merge: merge-sections` lets a project overlay individual sections of a plugin's reference.

## Claim LC08

Date: 2026-09-29
Status: supports
Confidence: high

Source:
- Label: cyber-truss model review, 2026-09-13 (intent obligation and arbitration)
- URL: file:///home/unional/code/cyberuni/cyber-truss/docs/sessions/2026-09-13-model-review.md (lines 128-141)
- Type: design notes (local)
- Fetched: yes (read locally)

Notes:
- The answers are `agree`, `disagree`, `uncontested/yield`, and `request-recess`. The electorate is a lookup, small and local. Mutual objection goes to a person.
- "An arbitrator has no span and therefore may not adjudicate: convene, carry answers, hold the wait, record, escalate." An arbitrator that can wake a peer can claim completeness; silence taken as consent fails open.
- "cyber-net is durable, so the transcript is provenance; the decision still lands in the run record." (cyber-net is cynapse's earlier name.)

## Claim LC09

Date: 2026-09-29
Status: supports
Confidence: high

Source:
- Label: Direct verification of PR14 (mcp_agent_mail_rust #317) and PR03-PR05 (beads storage)
- URL: https://github.com/Dicklesworthstone/mcp_agent_mail_rust/issues/317 ; https://github.com/steveyegge/beads (README)
- Type: issue thread; official docs
- Fetched: yes (via gh)

Notes:
- #317 (opened 2026-09-10, closed "not planned" 2026-09-11) asks to serve on stock SQLite instead of FrankenSQLite. It cites a corruption class across #152, #156, #213, #257, #278, #291, #298 and more. Hourly `sqlite3_backup` copies made through stock SQLite verify clean on databases the serving path had corrupted.
- The beads README describes a "Distributed graph issue tracker for AI agents, powered by Dolt". It runs embedded Dolt (single writer) by default, or server mode for concurrent writers. It syncs via `bd dolt push/pull` to `refs/dolt/data`; `.beads/issues.jsonl` is an export.

## Claim LC10

Date: 2026-09-30
Status: supports
Confidence: high

Source:
- Label: cynapse PR #16 load test (`cynapse dev load-test`)
- URL: https://github.com/cyberuni/cynapse/pull/16
- Type: direct test
- Fetched: yes

Notes:
- Separate writer processes appended to one stream on stock `node:sqlite` in WAL mode, with `seq` assigned under `BEGIN IMMEDIATE` and `UNIQUE (stream, seq)` in the schema. Runs: 10×200, 12×500, and 32×250 entries.
- Every run: `seq` contiguous and unique, each writer's order kept, `integrity_check` ok. About 2.5k–2.9k appends/s; p50 0.3 ms, p99 57–179 ms.
- Replacing `BEGIN IMMEDIATE` with a plain `BEGIN` makes the test fail, so the test really covers the ordering rule.
- A single machine only. It says nothing about a hub or about network filesystems.

## Claim LC11

Date: 2026-09-30
Status: supports
Confidence: low

Source:
- Label: This session's cyber-truss rename (a session note found as if it were a living doc)
- URL: file:///home/unional/code/cyberuni/cyber-truss/docs/sessions/2026-09-13-model-review.md (lines 135, 141)
- Type: observation (anecdote)
- Fetched: yes (read locally)

Notes:
- The only references to the old name "cyber-net" in cyber-truss were in a dated session note. It is a historical record, but in the file tree and in search results it looks exactly like current documentation, so a repository-wide rename had to treat it as live text.
- A single anecdote. It shows the mechanism behind HY01 (a text search cannot tell history from guidance), not its size.

## Claim HY01

Date: 2026-09-30
Status: mixed
Confidence: low

Source:
- Label: Hypothesis (the Council): messages stored as Markdown inside a repository hurt agent sessions
- URL: n/a
- Type: hypothesis, untested
- Fetched: n/a

Notes:
- Claim: saving conversation (messages, transcripts, answers, combat logs) as Markdown in a repository hurts agent sessions. There is more for an agent to read, which costs tokens. Search results get polluted, because a message found by grep carries no type, state, or position, so history and rejected proposals read like current guidance. Both cause confusion.
- Supporting mechanism: LC11. Related costs in peers: mcp_agent_mail's git-archived Markdown needed a commit coalescer and file-descriptor fixes (PR11, PR15); beads moved off JSONL committed to git (PR03–PR05). Those are performance costs, not context costs.
- Counterweight: a copy in the repository gives provenance that travels with the code (visible to collaborators, reviewable in PRs, kept across machines). That is why SDD commits its ledger (LC02).
- Test: two copies of one repository with identical content. Copy A has a realistic volume of Markdown messages committed (for example one mission's combat log, two arbitration transcripts, and a coordination thread). Copy B has the same content in a cynapse database outside the repository. Run the same set of agent tasks (a rename, a bug fix, a doc update, a question about a decision) N times on each, blind to the hypothesis. Measure tokens read, the share of file reads or search hits that are messages rather than task material, task success, and errors that cite a message as if it were current guidance.
- Supported if copy A reads meaningfully more tokens or shows message-induced errors, with no gain in success. Weakened if the difference is within run-to-run noise.
