# Morningstar CLI 1.3.5

Telegram polling now reconnects after transient failures without printing a new warning for every attempt. The footer and `/telegram status` distinguish an active channel from a connection that is retrying. Persistent failures produce at most one warning per minute, with one recovery notice after a successful poll. Authentication failures and another consumer remain terminal errors.

Retries back off from one second to 30 seconds and honor a longer Telegram `retry_after` delay. Stopping the channel cancels an outstanding wait. Offsets survive failed reads; processing a received message is separate from transport availability. Malformed update batches are rejected before they reach the channel.

HTTP errors retain their status even when a proxy returns HTML. Error descriptions are sanitized; local `connection.json` diagnostics contain only connection state, timestamps, counters and allowlisted categories. Tokens, URLs, message text and raw exception bodies are excluded.

Tests cover warning frequency, recovery, backoff, rate limits, cancellation, offsets, malformed responses and diagnostic read-back. Live read-only Bot API checks are distinct from a real incoming long-poll round trip. An already running terminal must be restarted to load this update; installing it does not replace its loaded JavaScript.

Reference: [Telegram Bot API response parameters](https://core.telegram.org/bots/api#responseparameters).
