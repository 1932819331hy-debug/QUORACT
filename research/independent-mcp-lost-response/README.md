# Independent research: MCP lost response and duplicate tool effects

**Status:** reproducible, isolated experiment (2026-10-26). **Not part of QUORACT** and **not a QUORACT conformance test**.

## Question

What happens when an MCP tool commits a side effect, its successful response is lost, and the caller explicitly repeats the same logical operation?

## Setup

- Official `@modelcontextprotocol/client@2.4.0` and `@modelcontextprotocol/server@2.4.0`
- `zod@4.1.12`, Node.js `22.23.2`, npm `10.9.8`
- In-memory MCP transport, synthetic `make_record` tool, synthetic records; **no external systems or customer data**
- Fault injected **after the handler commits**: the first successful JSON-RPC reply is dropped; the client's first call times out, then the client explicitly retries
- Test code: [repro.mjs](repro.mjs)

## Observed behavior

| Case | Tool effects after retry | Retry response |
| --- | ---: | --- |
| No operation-level deduplication | 2 | `record-2:example` |
| In-memory deduplication by stable application `operationId` | 1 | `record-1:example` |

The deduplicated case also verifies that a **different legitimate** `operationId` creates another record. Each case checks the expected result with assertions; the repeated request uses a new JSON-RPC request ID.

**Verification:** one clean install/run followed by **5 additional successful runs** of both cases. Bash execution on an isolated VPS test directory; no service deployment. All assertions passed.

## Reproduce

```sh
cd research/independent-mcp-lost-response
npm install --ignore-scripts --no-audit --no-fund
npm test
```

The test deterministically drops a response; it does not intentionally disrupt any real network or service. Versions above are directly pinned, but transitive dependencies are not locked in this small fixture.

## Interpretation and limits

A JSON-RPC request ID is not a durable business-operation identity. If a response is lost **after** the side effect, retrying with a different request ID can repeat that effect. For this *single-process fixture*, the application-level `operationId` map prevents the second effect.

This does **not** establish exactly-once execution, durable cross-process deduplication, crash recovery, database atomicity, multi-tenant safety, or a defect in the official MCP SDK. A production implementation would need durable operation identity, authorization scoping, atomic state changes, expiry/reconciliation policy, and adversarial testing.

**QUORACT's public v0.9 profile is not used in this experiment and does not provide this protection.** See the independent discussion at [MCP specification issue #3394](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3394). No commercial service, offer, or performance claim is made.
