# Install bokio-mcp (instructions for an AI agent)

You are helping a user connect their Bokio accounting to their MCP client. Follow these steps in order, ask the user when a step needs something only they have, and stop when a check fails. The user handles the token; you never see it.

## 1. What you are installing

bokio-mcp is an MCP server for the Bokio accounting API. It runs from npm with `npx -y bokio-mcp`, speaks MCP over stdio, and only reads unless the user turns writes on. It needs Node.js 22 or later: run `node --version` and ask the user to upgrade if it is older.

## 2. Company id and token

Ask the user for their company id. It is the part after `/companies/` in the Bokio URL when they are logged in: `.../companies/<companyId>/...`.

The server also needs a private integration token, which gives access to the company's books. Do not ask for it and do not accept it in the chat: the user puts it in place themselves. Tell them to create it in Bokio under Integrations (https://app.bokio.se/integrations): create an integration and copy the token. Never read, print, log or commit the token, and never write it into a file yourself.

## 3. Add the server to the client

Find out which MCP client the user runs.

Claude Code reads the token from the user's environment. Ask the user to add this line to their shell profile (for example `~/.zshrc` or `~/.bashrc`) with their own token, then open a new terminal:

```bash
export BOKIO_TOKEN=your_token
```

Then run:

```bash
claude mcp add --transport stdio --scope user \
  --env 'BOKIO_TOKEN=${BOKIO_TOKEN}' \
  --env BOKIO_COMPANY_ID=your_company_id \
  --env BOKIO_DOWNLOAD_DIR=/path/for/downloads \
  bokio -- npx -y bokio-mcp
```

Claude Desktop does not read the shell environment. Add the server to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`) under `mcpServers`, keeping any servers already there, and leave `your_token` as it is. Then ask the user to open the file and replace `your_token` with their token themselves.

```json
{
  "mcpServers": {
    "bokio": {
      "command": "npx",
      "args": ["-y", "bokio-mcp"],
      "env": {
        "BOKIO_TOKEN": "your_token",
        "BOKIO_COMPANY_ID": "your_company_id",
        "BOKIO_DOWNLOAD_DIR": "/path/for/downloads"
      }
    }
  }
}
```

Other MCP clients: add the same `command`, `args` and `env` to the client's MCP server config, with the same rule for the token.

## 4. Downloads and writes

Ask the user which folder downloads (SIE exports, invoice PDFs, uploaded files) should go to, create it if it does not exist (`mkdir -p`), and use it as `BOKIO_DOWNLOAD_DIR`. Without it, downloads go to the server's working directory, and they are rejected when that is `/`, as it often is for Claude Desktop.

Leave `BOKIO_ALLOW_WRITES` unset. Only add `BOKIO_ALLOW_WRITES=1` if the user asks the assistant to create or change things in Bokio, and tell them that this turns on tools that can publish, record, reverse and delete entries.

## 5. Check that it works

Ask the user to restart the client, then call `bokio_company_info`. Report the company name it returns and confirm with the user that it is the right company.

## 6. If something fails

- `node --version` is below 22: the user upgrades Node.js, then restart the client.
- `BOKIO_TOKEN not set`: Claude Code was started without the variable, for example from an IDE or app launcher that skips the shell profile. Ask the user to check `echo ${BOKIO_TOKEN:+set}` prints `set` in a new terminal and to start Claude Code from there.
- 401 or "unauthorized": the token is wrong or revoked. The user creates a new one on the Integrations page and puts it in place again.
- Claude Desktop shows `spawn npx ENOENT`: the app cannot find `npx` (common with nvm on macOS). Run `which npx` and use that full path as `command`.
- "companyId required", or 404 on company calls: `BOKIO_COMPANY_ID` is missing or wrong. Copy it again from the Bokio URL.
- A download is rejected: set `BOKIO_DOWNLOAD_DIR` to a folder the user owns.

More detail: the README at https://github.com/diblaze/bokio-mcp.
