# Workspace

`@orkestrel/workspace` is a virtual file map, not a filesystem. A `Workspace` holds immutable
files by path and replaces a file value on each edit. It reads, writes, searches, replaces, moves,
and removes those values without disk access, `node:fs`, watchers, or a synchronization lifecycle.
Durability is deliberately separate: a `WorkspaceStoreInterface` persists plain snapshots, while a
`WorkspaceManager` owns named live workspaces and the registry's active selection.

Text and binary content share one tagless `FileContent` union. Text-only operations reject or skip
binary content according to the operation. Positions are 1-based; ranges are half-open and clamp
to the addressed text.

## Surface

### Types

Contracts are centralized in [`types.ts`](../../src/core/types.ts).

| Name                        | Kind      | Purpose                                                               |
| --------------------------- | --------- | --------------------------------------------------------------------- |
| `BinaryMIME`                | type      | Supported MIME labels for base64 binary file content.                 |
| `FileContent`               | type      | Tagless text-or-binary immutable content union.                       |
| `FileState`                 | type      | File lifecycle state: created, modified, loaded, or deleted.          |
| `FileInput`                 | interface | Caller input for constructing a file.                                 |
| `FileInterface`             | interface | Immutable path, content, state, byte size, and line count.            |
| `Position`                  | interface | A 1-based line and column.                                            |
| `Range`                     | interface | A half-open start and end position.                                   |
| `ReadResult`                | interface | Ranged content and the clamped range actually read.                   |
| `SearchOptions`             | interface | Regex, case-sensitivity, and result-limit controls.                   |
| `SearchMatch`               | interface | One 1-based match with its path and full source line.                 |
| `ReplaceOptions`            | interface | Regex, case-sensitivity, and replacement-limit controls.              |
| `ReplaceResult`             | interface | Query, replacement count, and changed-file count.                     |
| `WorkspaceEventMap`         | type      | Write, remove, move, and clear event tuples.                          |
| `WorkspaceOptions`          | interface | Workspace identity and initial emitter hooks.                         |
| `WorkspaceSnapshot`         | interface | JSON-serializable workspace id and flat file list.                    |
| `WorkspaceStoreInterface`   | interface | Async snapshot point-access contract. See [`## Methods`](#methods).   |
| `WorkspaceSnapshotRow`      | interface | Database id plus one opaque snapshot column.                          |
| `WorkspaceErrorCode`        | type      | Modality, pattern, and range failure codes.                           |
| `WorkspaceInterface`        | interface | Live editing contract. See [`## Methods`](#methods).                  |
| `WorkspaceInput`            | interface | Manager creation input with optional silent seed entries.             |
| `WorkspaceManagerOptions`   | interface | Default event hooks and optional store.                               |
| `WorkspaceManagerInterface` | interface | Registry and active-selection contract. See [`## Methods`](#methods). |

### Constants

| Name                    | Kind  | Purpose                                                       |
| ----------------------- | ----- | ------------------------------------------------------------- |
| `EXTENSION_TO_LANGUAGE` | const | Frozen extension-to-language data used by language inference. |

### Errors

| Name               | Kind     | Purpose                                                     |
| ------------------ | -------- | ----------------------------------------------------------- |
| `WorkspaceError`   | class    | Error carrying a `WorkspaceErrorCode` and optional context. |
| `isWorkspaceError` | function | Narrows a caught value to `WorkspaceError`.                 |

### Helpers

Pure behavior lives in [`helpers.ts`](../../src/core/helpers.ts).

| Name                  | Kind     | Purpose                                                    |
| --------------------- | -------- | ---------------------------------------------------------- |
| `inferLanguage`       | function | Infers a language tag from the final path extension.       |
| `isText`              | function | Narrows `FileContent` to its text arm.                     |
| `isBinary`            | function | Narrows `FileContent` to its binary arm.                   |
| `isImage`             | function | Identifies a binary arm with an image MIME.                |
| `isFile`              | function | Narrows an unknown storage value to `FileInterface`.       |
| `isWorkspaceSnapshot` | function | Narrows an unknown storage value to a workspace snapshot.  |
| `computeSize`         | function | Computes UTF-8 or decoded-binary byte size.                |
| `countLines`          | function | Counts text lines and returns zero for binary content.     |
| `decodedSize`         | function | Computes decoded base64 size arithmetically.               |
| `isValidRange`        | function | Validates positive ordered positions.                      |
| `clampPosition`       | function | Clamps a position to text bounds.                          |
| `clampRange`          | function | Clamps both range endpoints to text bounds.                |
| `offsetAt`            | function | Converts a 1-based position to a string offset.            |
| `sliceRange`          | function | Reads a clamped half-open text span.                       |
| `spliceRange`         | function | Replaces a clamped half-open text span.                    |
| `rangeOf`             | function | Assembles a range from four flat coordinates.              |
| `escapeRegExp`        | function | Escapes literal text for use as regular-expression source. |

### Factories

| Name                           | Kind     | Purpose                                      |
| ------------------------------ | -------- | -------------------------------------------- |
| `createFile`                   | function | Creates a frozen file with derived metadata. |
| `createTextContent`            | function | Creates the text content arm.                |
| `createBinaryContent`          | function | Creates the binary content arm.              |
| `createWorkspace`              | function | Creates an empty workspace.                  |
| `createMemoryWorkspaceStore`   | function | Creates a process-local snapshot store.      |
| `createDatabaseWorkspaceStore` | function | Creates a database-backed snapshot store.    |
| `createWorkspaceManager`       | function | Creates an empty workspace registry.         |

### Classes

| Name                     | Kind  | Purpose                                               |
| ------------------------ | ----- | ----------------------------------------------------- |
| `Workspace`              | class | Implements the immutable-file editing surface.        |
| `WorkspaceManager`       | class | Implements the registry and active selection.         |
| `MemoryWorkspaceStore`   | class | Implements snapshot storage with a process-local map. |
| `DatabaseWorkspaceStore` | class | Implements snapshot storage over a database table.    |

## Methods

#### `WorkspaceInterface`

| Method     | Returns                                       | Behavior                                                             |
| ---------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `file`     | `FileInterface \| undefined`                  | Finds one immutable file by path.                                    |
| `files`    | `readonly FileInterface[]`                    | Lists files in insertion order.                                      |
| `read`     | text, ranged result, batch record, or absence | Reads text while omitting binary content from plain and batch reads. |
| `has`      | `boolean`                                     | Tests one path or whether any path in a batch exists.                |
| `search`   | `readonly SearchMatch[]`                      | Searches text files in insertion and line order.                     |
| `replace`  | `ReplaceResult`                               | Replaces text matches and reports occurrence and file tallies.       |
| `write`    | `void`                                        | Writes text, splices a range, or writes a record batch.              |
| `prepend`  | `void`                                        | Prepends text to one path or a record batch.                         |
| `append`   | `void`                                        | Appends text to one path or a record batch.                          |
| `move`     | `boolean`                                     | Re-keys one file or a mapping batch with last-write-wins targets.    |
| `remove`   | `boolean \| void`                             | Removes one path, a path batch, or every file.                       |
| `clear`    | `void`                                        | Empties the workspace and emits `clear`.                             |
| `snapshot` | `WorkspaceSnapshot`                           | Returns the id and flat immutable file list.                         |

#### `WorkspaceManagerInterface`

| Method       | Returns                                    | Behavior                                                          |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------- |
| `workspace`  | `WorkspaceInterface \| undefined`          | Finds a registered workspace by id.                               |
| `workspaces` | `readonly WorkspaceInterface[]`            | Lists registered workspaces in insertion order.                   |
| `add`        | `WorkspaceInterface`                       | Creates, registers, and conditionally auto-activates a workspace. |
| `switch`     | `WorkspaceInterface \| undefined`          | Changes the active selection when the id exists.                  |
| `open`       | `Promise<WorkspaceInterface \| undefined>` | Activates a registry hit or hydrates a stored snapshot.           |
| `save`       | `Promise<boolean>`                         | Persists a registered workspace when a store exists.              |
| `remove`     | `boolean`                                  | Removes one id or an id batch and updates the active selection.   |
| `clear`      | `void`                                     | Empties the registry and clears the active selection.             |

#### `WorkspaceStoreInterface`

| Method   | Returns                                   | Behavior                                         |
| -------- | ----------------------------------------- | ------------------------------------------------ |
| `get`    | `Promise<WorkspaceSnapshot \| undefined>` | Resolves a snapshot by id.                       |
| `set`    | `Promise<void>`                           | Inserts or replaces under the snapshot's own id. |
| `delete` | `Promise<void>`                           | Removes an id when present.                      |

## Editing

```ts
import { createWorkspace, rangeOf } from '@orkestrel/workspace'

const workspace = createWorkspace({ id: 'project' })
workspace.write('src/main.ts', 'const answer = 41')
workspace.write('src/main.ts', '42', rangeOf(1, 16, 1, 18))
workspace.prepend('src/main.ts', '// generated\n')
workspace.append('src/main.ts', '\n')

workspace.file('src/main.ts')
workspace.files()
workspace.read('src/main.ts')
workspace.has(['src/main.ts', 'README.md'])
workspace.search('answer')
workspace.replace('generated', 'derived')
workspace.move('src/main.ts', 'src/index.ts')
workspace.remove('src/index.ts')
workspace.clear()
workspace.snapshot()
```

A whole-file write creates text content and infers its language from the path. Rewriting an
existing path produces a new immutable file with `modified` state. Ranged reads and writes clamp
valid ranges to text bounds; structurally invalid ranged writes throw `WorkspaceError` with
`RANGE`. A ranged operation, prepend, or append aimed at binary content throws `MODALITY`.
Plain reads return `undefined` for binary content, and search and replacement skip it.

Literal search escapes regex metacharacters. Set `regex: true` to provide regular-expression
source, `exact: false` for case-insensitive matching, and `limit` to cap matches or replacements.
Invalid regular-expression source throws `PATTERN`.

## Registry and stores

```ts
import {
	createDatabaseWorkspaceStore,
	createMemoryWorkspaceStore,
	createWorkspaceManager,
} from '@orkestrel/workspace'

const memory = createMemoryWorkspaceStore()
const durable = createDatabaseWorkspaceStore()
const manager = createWorkspaceManager({ store: memory })

const scratch = manager.add({ id: 'scratch' })
manager.workspace('scratch')
manager.workspaces()
manager.switch('scratch')
await manager.save('scratch')
await manager.open('scratch')
manager.remove('scratch')
manager.clear()

await durable.set(scratch.snapshot())
await durable.get('scratch')
await durable.delete('scratch')
```

The first added workspace becomes active; later additions preserve that selection. An unknown
switch, open miss, missing store, or unknown save id is lenient. Removing the active workspace
clears the selection.

`MemoryWorkspaceStore` retains snapshots for the process lifetime. `DatabaseWorkspaceStore` stores
each snapshot as one opaque JSON column through `@orkestrel/database`; the driver determines
durability. Neither store clones snapshots or owns live workspace hydration.

## Events

| Event    | Payload        | Timing                                   |
| -------- | -------------- | ---------------------------------------- |
| `write`  | resulting file | after a write or changed replacement     |
| `remove` | removed path   | after one present path is removed        |
| `move`   | `{ from, to }` | after the path map is re-keyed           |
| `clear`  | none           | after `clear()` or argument-free removal |

Listener failures are isolated by `@orkestrel/emitter` and routed to the workspace's `error`
handler.

## Tests

- [`helpers.test.ts`](../../tests/src/core/helpers.test.ts) — content, sizing, range, and escaping
  helpers.
- [`factories.test.ts`](../../tests/src/core/factories.test.ts) — immutable values and factories.
- [`Workspace.test.ts`](../../tests/src/core/workspaces/Workspace.test.ts) — editing, modality,
  search, events, and snapshots.
- [`WorkspaceManager.test.ts`](../../tests/src/core/workspaces/WorkspaceManager.test.ts) — registry,
  active selection, hydration, and persistence.
- [`MemoryWorkspaceStore.test.ts`](../../tests/src/core/workspaces/stores/MemoryWorkspaceStore.test.ts)
  and
  [`DatabaseWorkspaceStore.test.ts`](../../tests/src/core/workspaces/stores/DatabaseWorkspaceStore.test.ts)
  — the shared store contract and backend-specific paths.
