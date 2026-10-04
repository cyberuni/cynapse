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

Answered since this list was first written: the routing kinds (ADR-0008), the load test
with 10 or more writers (ADR-0007, LC10), cyber-truss as the first external namespace
(ADR-0005), and whether a DM can gain members (there is no DM, ADR-0012).

- HY01: run the two-copy test before SDD's combat log moves onto a cynapse channel.
- Whether a cyber-truss arbitration can span more than one mission. Anchors form a tree, so
  that would need more than one parent.
- The migration path for universal-plugin's unprefixed reference names.
- Run the GitLab, Linear and Asana one-call queries for real (LC13).
- Multi-machine sync, once the hub work starts: Dolt with no hub alongside owner-assigned
  `seq`, and whether NATS leaf nodes buffer offline writes durably.
- Federation across organizations, if that comes into scope. The channel is already the
  unit of partitioning and access control.

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
