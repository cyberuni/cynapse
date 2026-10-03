# Conversation architecture for agent messaging (September 2026)

## Question

How do Slack, Discord, Telegram, and Reddit structure channels and DMs? Is the only
difference between a channel and a DM its name and the way you find it?

## Scope

In scope: the data model, identity, membership, permissions, message storage and
sequencing, real-time delivery, lifecycle, limits, and discovery.
Out of scope: UI design, voice and video, encryption beyond noting Telegram's secret
chats, and business models.

## Source angles

- Official API references (Slack Conversations API, Discord Channel resource,
  Telegram MTProto and Bot API)
- Engineering blogs (Slack real-time messaging, Discord message storage and Elixir
  fan-out)
- Secondary sources for Reddit, whose primary docs could not be fetched: API mirrors,
  a reverse-engineering gist, journalism

## Findings

See conclusion.md for the synthesis. Per-platform detail is in slack-discord.md and
telegram-reddit.md (the agent working notes). Claims are in evidence.md: SD01–SD14 for
Slack and Discord, TR01–TR16 for Telegram and Reddit.

## Contradictions

- Slack's delivery path is identical for DMs and channels (SD06), while Discord uses a
  guild-specific fan-out (SD12) and Telegram a channel-specific sequence (TR03). How much
  the transport is shared varies by platform.
- The Telegram Bot API presents one unified `Chat` object (TR07), but MTProto splits it
  into three peer types (TR01).

## Open questions

- The kind taxonomy for routing: which kinds cynapse owns (channel types) and which route out.
- A load test of stock SQLite in WAL mode with 10 or more concurrent writers assigning `seq`.
- Dolt as a sync layer that needs no hub, alongside owner-assigned `seq`.

- Does cyber-truss's run ledger settle on addressed contributions? If so, it is the first
  external entry-type namespace.
- Do NATS leaf nodes buffer offline writes durably?
- What is the federation story if collaboration across organizations enters scope?

- Should a cynapse DM be able to gain members, or does a new participant set mean a new
  DM?
- The notification defaults on each platform (unverified).
- Discord's DM delivery path.
- Whether Reddit chat now runs on Matrix (unverified).

## Sources consulted

- https://docs.slack.dev/reference/objects/conversation-object
- https://docs.slack.dev/reference/methods/conversations.open
- https://docs.slack.dev/reference/methods/conversations.close/
- https://docs.slack.dev/apis/web-api/using-the-conversations-api
- https://slack.engineering/real-time-messaging/
- https://docs.discord.com/developers/resources/channel
- https://docs.discord.com/developers/topics/permissions
- https://discord.com/blog/how-discord-stores-billions-of-messages
- https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users
- https://core.telegram.org/type/Peer
- https://core.telegram.org/type/Chat
- https://core.telegram.org/api/updates
- https://core.telegram.org/api/channel
- https://core.telegram.org/method/messages.migrateChat
- https://core.telegram.org/bots/api#chat
- https://core.telegram.org/api/discussion
- https://core.telegram.org/api/end-to-end
- https://core.telegram.org/api/forum
- https://www.redditapis.com/blogs/reddit-dm-vs-chat-vs-modmail-when-to-use-each-api-surface
- https://gist.github.com/sim642/225c44801a376e2c54e746285d4c680f
- https://techcrunch.com/2023/04/28/reddit-is-testing-discord-like-channels-for-community-chat/
