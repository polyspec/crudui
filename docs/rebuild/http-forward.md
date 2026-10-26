<!-- doc-id: rebuild-http-forward -->
# Rebuild record: HTTP forwarding

[한국어](http-forward.ko.md)

Verdict: **none fits**; the form comparison keeps its adapter over the Node.js HTTP and stream APIs. Evaluated on 2026-10-26.

## Covers

- `examples/form-comparison/src/forward.mjs`

## Requirement

The public server forwards a request to the declared localhost port and path, preserves its method and body, sets the target
Host header and removes connection-specific headers in both directions. A failure before the upstream response returns JSON
with status 502 and the server identifier. A client that aborts its upload also aborts the upstream request.

An upstream can answer 413 before reading the whole upload. After that response, the adapter stops forwarding the upload,
reads the remaining client bytes and preserves the response even when the upstream write fails. Connection headers belong
to each connection; a header named by Connection must not pass to the other connection.

## Tools evaluated

| Tool | Evaluation | Result |
|---|---|---|
| Node.js `http.request` and stream `pipe`, `unpipe` and `resume` | Current adapter, with request connection headers filtered | All four forwarding unit cases pass; the early-response case checks forty uploads |
| `http-proxy` 1.18.1 | Minimal adapter using the public `web` API, target path and host options and the existing 502 response | Two of four cases pass; the early-response case receives 25 responses with status 413, 14 EPIPE errors and one ECONNRESET error; the response connection-header assertion fails |
| `http-proxy` 1.18.1 with the required response handling | Adapter adds per-request proxy state, proxyReq and proxyRes handlers, request header removal, upload unpipe and drain, response header removal and post-response error handling | All four cases pass; the adapter retains every application-specific rule and adds a proxy instance and event coordination |

The comparison uses `examples/form-comparison/src/forward.test.mjs`. It checks forty early responses, request and response
headers together with path, Host, method and body, a structured 502 response, and upload cancellation. The minimal adapter's
counts describe this measured run; they are not an expected distribution. Both candidates run outside tracked sources.

## Why none fits

The existing adapter has 41 lines including eight explanatory comment lines. The passing package adapter has 39 lines
without those explanatory comments and adds four installed packages: http-proxy, eventemitter3, follow-redirects and
requires-port. The package does not supply the early-response or connection-header rules, so using it retains those rules
and adds event coordination. The current adapter delegates HTTP parsing, framing, streaming and backpressure to Node.js;
it implements only the target and response policy required by this application.

## Retry condition

Revisit when a maintained proxy package provides early-response upload draining and connection-header filtering through its
public API, or when the application requires proxy features beyond one declared localhost HTTP target.
