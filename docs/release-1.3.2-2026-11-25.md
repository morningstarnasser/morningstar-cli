# Morningstar CLI 1.3.2

Adds a trusted global image-backend configuration to use existing local image
installations with `/imagine`. Requests travel as JSON over stdin with shell execution
disabled. The CLI checks response bounds, PNG signature/dimensions and metadata,
then saves a uniquely named output. Errors and timeouts do not report success or
expose backend stderr. Configured backends skip the legacy Unix-only setup detection.

The operator-specific model paths, host routing, identities and workflows belong
in private profiles. They are not bundled into the public product. Image quality
and runtime require real model tests on the actual hardware; fixture tests alone
do not establish them.
