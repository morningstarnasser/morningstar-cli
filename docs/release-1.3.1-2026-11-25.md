# Morningstar CLI 1.3.1

Telegram connection setup now checks for an existing webhook before reporting a
successful channel connection. Webhook conflicts, another polling session and
invalid credentials receive distinct messages without exposing the bot token or
private webhook URL. On a polling conflict the channel becomes offline before the
footer is notified.

The reported production failure was reproduced against Telegram: getMe succeeded,
but getUpdates returned 409 because an older integration still owned the webhook.
That integration must be migrated explicitly; this release does not silently delete
webhooks or take over another bot service. A valid token alone is not a working
channel test. Restart existing CLI processes after updating.

Focused tests cover webhook preflight, lock cleanup, no premature polling, offline
state before notification and safe error messages. Existing authentication,
pairing, shared-session and file tests remain in force.
