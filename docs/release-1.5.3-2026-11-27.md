# Morningstar CLI 1.5.3 — current operator context on resume

A renewed status request in an old conversation now repeats the current system-owned operator profile beside the new request. Historical failed commands and access assumptions can otherwise outweigh a profile corrected since that session began.

The reminder exists only in the provider request. It does not rewrite the stored conversation, promote tool/user/assistant text into instructions, change permissions or disable host-key checks. It is limited to recognized renewed host-status requests and a bounded profile already loaded in the system context. This improves model guidance; it is not a guarantee of correct tool selection.

Update with `morningstar update` and restart existing sessions. The access, empty-answer and learning fixes from 1.5.2 remain included.
