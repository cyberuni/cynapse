---
title: gui
description: Open the Council's web viewer on a cynapse database.
---

## `cynapse gui`

Start the Council's web viewer on the database the CLI would use, serve it on a loopback port, print
the URL and open it in a browser. It runs until you press Ctrl-C (or the process receives `SIGTERM`),
then closes the server and the store.

The viewer is a separate package, `@cyberuni/cynapse-gui`, loaded only when you run this command. If it
is not installed next to cynapse the command fails with exit `1`:

```text
cynapse gui needs @cyberuni/cynapse-gui; install it next to cynapse: npm install -g @cyberuni/cynapse-gui
```

**Usage**

```bash
cynapse gui [--port <n>] [--no-open]
```

| Option | Effect |
| --- | --- |
| `--port <n>` | The loopback port to serve on. Default `4173`. A whole number. |
| `--no-open` | Print the URL without opening a browser. |

The server listens on `127.0.0.1` only. If the port is taken the command exits `1` with
`port 4173 is in use; pass --port <n> to pick another`. `--db` selects the database, as for every
command; `--as` is not used.

Under `--json` it prints the object `{ "url": "http://127.0.0.1:4173" }`, pretty-printed over three lines. Browser opening is best
effort (`open`, `cmd /c start` or `xdg-open`); on a machine with no opener you still get the URL.

**Examples**

```bash
cynapse gui
# cynapse gui on http://127.0.0.1:4173 (Ctrl-C to stop)
```

```bash
# Look at the example world on another port, without launching a browser
cynapse --db /tmp/demo.db dev seed
cynapse --db /tmp/demo.db gui --port 4999 --no-open
# cynapse gui on http://127.0.0.1:4999 (Ctrl-C to stop)
```

See [`dev seed`](/cynapse/cli/dev/#cynapse-dev-seed) for data to look at.
