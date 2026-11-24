# Runtime performance — 2026-11-24

Optimized against baseline `e5ecff7` on the same Mac. No model, reasoning setting,
provider, dependency, turn limit, permission or tool result was changed.

## Changes

- Help, version, skills, Superbrain and settings diagnostics finish without loading
  React/Ink, the interactive app or its provider/runner graph. Print mode also
  avoids the terminal UI. Credentials are not read for help/version.
- Interactive conversation state uses a lazy initializer. Previously every render
  rebuilt an unused system prompt and re-read project memory.
- Stream display updates are coalesced at 33 ms intervals, with the first delta
  displayed immediately. Raw model deltas, tool arguments, transcripts and final
  answers remain complete. Turn completion, cancellation and cleanup remove queued
  display work; tool requests flush it. NDJSON/headless streaming is unchanged.
- Syntax highlighting loads only when code is displayed. Concurrent code blocks
  share the same initialization promise. The live token-rate timer no longer
  restarts on every text update.
- The five-second skill metadata cache is checked before walking plugin roots.
  Workspace identity is part of its key. Canonicalization uses the native
  filesystem implementation; existing symlink and package boundaries remain.
- Automatic QMD recall has a memory-only cache: at most 32 exact queries for
  15 seconds. Only filtered public hits are stored. Policy and hooks still run for
  every request, including cache hits. Cancelled/failed searches are not cached;
  callers cannot mutate cached results. Manual vault search/get always reads fresh
  results. After changing a note, use the manual tool or wait for this short TTL.
- Context compaction builds only the excerpts that fit, avoiding construction of
  strings for the entire discarded history. Comparison across 400 varied histories
  produced byte-identical compacted messages to the baseline.

## Measured results

New process for each CLI timing; existing filesystem caches were not artificially
flushed. Runtime microbenchmarks use the same catalog and query on both versions.
These measurements describe client overhead, not an increase in model tokens/sec.

| Operation | Before median | After median | Samples per version |
| --- | ---: | ---: | ---: |
| `morningstar --version` | 241.5 ms | 40.4 ms | 7 |
| `morningstar skills status` | 513.3 ms | 192.9 ms | 5 |
| Fresh skill discovery | 181.3 ms | 130.2 ms | 5 |
| 100 warm catalog lookups | 103.2 ms | 0.10 ms | 5 |
| Repeated identical automatic QMD query | 261.0 ms | 1.86 ms | 5 |
| Compact 6002 messages | 3.17 ms | 1.18 ms | 20 |

The QMD row measures reuse within the 15-second TTL. A new or expired query still
runs QMD; the cache does not accelerate that initial search.

A real PTY ran the same synthetic streaming provider: 601 deltas, nominally one
every 2 ms, with a 300-line project instruction file. The provider ran in-process,
so excessive synchronous UI work also delayed its stream. There were three runs
per version, interleaved for the final two pairs.

| Streaming measurement | Before median | After median |
| --- | ---: | ---: |
| Launch to completed visible answer | 8.81 s | 2.62 s |
| Node process CPU time | 9.21 s | 1.50 s |
| Project instruction reads | 1223 | 2 |
| Terminal output | 3.63 MB | 0.34 MB |

This fixture completed 3.36 times faster, with about 84% less CPU time. Real model
inference, network conditions and terminal speed can dominate actual task latency.
The fixture does not benchmark a particular model or hardware configuration.

## Validation and evidence

Focused tests cover immediate first render, coalescing without text loss, flush and
cancellation, query-cache expiration/eviction/privacy/error handling, cross-workspace
skill-cache isolation, and help/version without terminal or credential loads.
Existing policy, QMD, skill and long-run tests remain part of the full suite.

Executed: **509/509 tests passed**, typecheck and build passed, **OSV: 0 findings**.
The built-CLI 120-tool-round smoke test and interactive command/skill smoke test
passed. Catalog discovery and lazy loading were exercised separately.

The performance fixture uses synthetic model output and real terminal rendering.
No model credentials, account inventories or local transcripts are distributed.
