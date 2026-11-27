# Morningstar CLI 1.5.6

A failed status connection previously ended with a message that also suggested
missing permission. Status shortcuts now report an approval denial only when the
runner returns a permission-denied result. Network failures remain failed measurements.

The read-only status connector identifies DNS resolution failures, refused
connections, timeouts and TLS verification failures. Diagnostics omit raw causes,
URLs and credentials. Redirect rejection, response limits and normal tool approval
remain unchanged. Restart running CLI sessions after updating.

Focused regression tests cover both denied and failed requests, transport diagnostics
and redaction. Real endpoint checks depend on each installation's network/VPN.
