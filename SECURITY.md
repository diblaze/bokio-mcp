# Security

## How the server handles your data

- **Token:** read only from the `BOKIO_TOKEN` environment variable and sent to Bokio as a Bearer header. It is never logged or returned in tool output. Stdout carries MCP JSON-RPC only; diagnostics go to stderr.
- **Read-only by default:** tools that change data are not even registered unless `BOKIO_ALLOW_WRITES=1`. The HTTP client also refuses every POST, PUT, PATCH and DELETE while the gate is off, so a write cannot slip through another path.
- **No money movement:** creating bank payments is not exposed at all.
- **Downloads:** confined to `BOKIO_DOWNLOAD_DIR`, or to the server's working directory when it is unset. Paths that escape it are rejected before any request is made. Downloads never overwrite an existing file.
- **Irreversible actions** (publish, record, reverse, delete, supplier-invoice update) are annotated as destructive so MCP clients can ask before running them.

Keep the token out of files you commit or share, and create a separate Bokio integration per machine or user so one can be revoked without affecting the others.

## Reporting a vulnerability

Use GitHub private vulnerability reporting: the repository's **Security** tab → **Report a vulnerability**. Please do not open a public issue for security problems.
