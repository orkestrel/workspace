# @orkestrel/workspace

> The virtual file workspace for the `@orkestrel` line: a path-keyed map of immutable files with
> an editing surface over it, a registry that holds those maps by id under one active selection,
> and a snapshot store seam that persists them.

Reach a file by its path — `write`, `read`, `search`, `replace`, `move`, `remove` — and every edit
mints a new file value and puts it back, so a file is a value you can hold and compare rather than
a handle that changes underneath you.

It is not a filesystem. There is no disk, no `node:fs`, no watcher, no synchronization lifecycle,
and no dirty-state tracking — a path is a key, not a location. Durability is a separate seam: a
snapshot is a plain serializable value, and a store is the thing that keeps one.

Nothing here is model-specific. An agent loop, a tool handler, and plain application code are all
callers.

## Install

```sh
npm install @orkestrel/workspace
```

## Example

```ts
import { createWorkspaceManager } from '@orkestrel/workspace'

const workspaces = createWorkspaceManager()
const workspace = workspaces.add({ id: 'project' }) // the first add becomes active

workspace.write('src/main.ts', 'export const answer = 42')
workspace.append('src/main.ts', '\n')

workspace.read('src/main.ts') // 'export const answer = 42\n'
workspace.search('answer') // one match, with its 1-based line and column
workspace.snapshot() // { id: 'project', files: [ … ] } — serializable, ready for a store
```

Ranged edits clamp to the text they address, search is literal until you ask for a pattern, and an
absent path answers with `undefined` instead of throwing. Give the manager a store and `save` and
`open` round-trip a workspace through it.

See the [workspace guide](guides/workspace.md) for the complete surface, edit semantics,
events, and stores.

## Requirements

- Node.js 22.12 or newer
- ESM and CommonJS consumers

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](LICENSE).
