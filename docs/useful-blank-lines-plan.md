# Plan: Extensible Useful-Blank-Lines Detector

Background issue: "Paste without blank lines" deletes the blank lines around tables and headings that are **required for rendering**, so tables fail to render.

## 1. Problem and Root Cause (Reproduced)

`utils.ts::removeBlankLines` filters out every blank line unconditionally:

```ts
text.split(/\r?\n/).filter(line => line.trim() !== "").join("\n")
```

Running jest against the real function (input: paragraph / blank / table / blank / paragraph) prints:

```
"Some intro text\n| First name | Last name |\n| ---------- | --------- |\n| Max | Planck |\nSome outro text"
```

A GFM pipe table **cannot interrupt a paragraph**; the blank lines around it are its block boundaries. Fused, the whole block degrades to plain text.

**Existing contract that must not regress**: `cleans up tables` and `cleans up tabbed tables` in `tests/removeNewlines.test.ts` require blank lines **between table rows** to keep being removed (this repairs tables broken by PDF paste). Hence the principle: **delete row gaps, keep block boundaries.**

## 2. Design Overview

Add `detector.ts` as a **pure marker**. It receives the document as the very array the existing pipeline already produced from `text.split(/\r?\n/)` and returns one decision per index — keep or drop — for that same array. It never copies, deletes, rewrites which line is which, or joins text. The existing pipeline stays `split` → `filter` → `join`; the filter just reads those flags instead of deciding per line.

The input is the **complete** line array, blank lines included. Nothing is removed before `kindOf`, so every rule sees the real document, including the gap width and the document edges.

```
detector.ts (new)
  ├─ decidePreservedLines(raws): DecisionMap  // kindOf each line, decide keep[i]
  ├─ DecisionMap { lines; keep; blank }        // per line: classification + two flags
  └─ BoundaryRule[]  BOUNDARY_RULES              // extension point: is this gap a block boundary?
utils.ts
  └─ removeBlankLines(text, preserveUseful = true)   // the original split/filter/join
       lines = text.split(/\r?\n/)                   // original array, untouched
       if (preserveUseful) decisionMap = decidePreservedLines(lines)    // detector's flags
       else                decisionMap = { keep: lines.map(l => l.trim() !== "") }
       lines.filter((_, i) => decisionMap.keep[i]).join("\n")   // a NEW array; `lines` never mutated
main.ts
  └─ settings.preserveUsefulBlankLines → `preserveUseful`
```

### 2.1 Data Model

```ts
type LineKind =
  | "text" | "blank"
  | "tableRow"            // starts with | after leading whitespace
  | "tableDelimiter"      // | :?-+:? | ... delimiter row
  | "atxHeading"          // ^\s{0,3}#{1,6}\s
  | "setextTitle"         // text line owned by a setext underline
  | "setextUnderline"     // ^\s{0,3}(=+|-{2,})\s*$
  | "fenceOpen" | "fenceClose"   // ``` or ~~~ (including info string)
  | "hr"                  // --- *** ___ (standalone line)
  | "blockquote"          // ^\s{0,3}>
  | "callout"             // ^\s{0,3}>\s*\[![A-Za-z][A-Za-z0-9-]*[+-]?\][ \t]*  (Obsidian callout opener known to `kindOf`)
  | "listItem"            // ^\s*([-*+]|\d+[.)])\s  (v1 does not decide on it; rules may)
  | "frontmatterFence";   // the two fences only; the body keeps its own kinds

interface ScannedLine {
  index: number;          // index into the caller's array
  raw: string;            // the caller's line, read-only; never written back
  kind: LineKind;
  region: "none" | "fencedCode" | "frontmatter" | "math" | "comment";
}

// the detector's only output: what to keep, aligned to the input array
interface DecisionMap {
  lines: readonly ScannedLine[];   // same length and order as raws
  keep: readonly boolean[];        // frozen; keep[i] === true ⟺ raw[i] survives
}

type KeepDecisionMap = Pick<DecisionMap, "keep">;  // what the removal step reads

type BoundaryRule = (before: ScannedLine, after: ScannedLine) => boolean;
export const BOUNDARY_RULES: BoundaryRule[] = [ /* R1..R6, see §4 */ ];

export const isBlankLine = (raw: string): boolean => raw.trim() === "";

export function decidePreservedLines(raws: readonly string[]): DecisionMap;
```

`keep` is an array parallel to the input, not a property scattered on line objects: these decisions are the detector's contract, and building the output array from them stays a caller-side operation.

The `if`/`else` only picks the decisions; the removal step is the same lookup in both modes. Both answer the same question in the same shape, `keep[i]` for line `i`, and both agree on what a blank line is: `isBlankLine` (`raw.trim() === ""`, i.e. no visible character) — exactly the test the pre-detector filter used. They differ only in what they do with blanks: the detector keeps the ones markdown needs, the legacy decisions drop all of them.

### 2.2 Decisions (fixed)

1. `keep[i] = true` for every non-blank line: non-blank lines are never inspected for removal. `keep` is parallel to the **input array**, not to `lines` filtered of something.
2. A blank line inside a protected region is content: `keep = true`, all of them, never collapsed.
3. Any other blank line is kept iff it is the **first blank line of its gap**, both sides exist, and at least one rule reports a block boundary there. Rules are conditions, not verdicts: they only say "these two blocks must not fuse". Keeping only the first line is what collapses a gap to one.
4. Everything else gets `keep = false`. Kept lines are emitted as written. With the **Trim trailing whitespace** setting on (§5) every kept line loses its trailing whitespace, so a kept blank line — even one holding NBSP or a form feed — lands as an empty line.

> OR over all rules (one hit keeps): a `false` never vetoes, so a new rule can only preserve more; extenders cannot accidentally break someone else's rule.

### 2.3 How to Extend

- In code: `BOUNDARY_RULES.push(myRule)` (the array is exported, and it is read at call time, so a push takes effect for the next `decidePreservedLines`). A rule is a predicate over the two nearest non-blank lines: return true when they form a block boundary; it sees their `kind`, `region` and `raw`.
- Rules never see null: a gap with content on only one side is a document edge, not a boundary, and is decided before the rules run.
- Reserved (not v1): store enabled rule ids in settings for per-rule toggles; v1 exposes only the master switch.

## 2.4 Ownership and memory

The detector **never mutates its input**: `decidePreservedLines` only reads `raws` and returns a fresh `DecisionMap` (with `keep` frozen, so nothing downstream can splice a decision into it). `utils.ts` builds the output with `Array.prototype.filter`, which allocates a **new** array; the `lines` array and its elements are never spliced or edited.

No explicit release step is needed or wanted. JS has no destructors, and `lines`, `decisionMap` and `kept` are locals of `removeBlankLines`: they become unreachable when it returns, so the GC reclaims them on its own next pass. Writing `lines.length = 0` would not free anything sooner — it only drops the references slightly earlier at the cost of an extra write, and it would reach into an array the caller owns. Keep the function free of manual "cleanup".

## 3. Protected Regions (scanner, `region`)

| id | Interval | Rationale | Status |
|---|---|---|---|
| P1 | Fenced code block (``` / ~~~, opener to matching closer; unclosed runs to EOF) | Blank lines are code content (the author's own note in `parser/ofm-features.md`: "dont remove these blank lines?") | v1 |
| P2 | Frontmatter (leading `---`/`+++` with a matching closer) | YAML block scalars `|`/`>` are blank-line sensitive | v1 |
| P3 | `$$ ... $$` display math | Blank lines inside matrix/align environments are content | v1 |
| P4 | `%% ... %%` block comment | Deleting blanks inside comments is mostly harmless, but protect conservatively | v1 |
| P5 | HTML block (`<div>` … `</div>`) | A blank line terminates a raw block | v2 candidate, high complexity |

Regions are classification data, not a second code path: blank lines inside a region are the *content* clause of §2.2, and they are kept all the same way as every other useful line.

**Explicitly out of scope** (recorded so it is not filed as a bug later):

- **Indented code blocks** (4 spaces / tab) are not protected. CommonMark protects their blank lines, but that conflicts with the existing `tabulation doesnt break it` contract, and paste scenarios are almost entirely plain indented text. `kindOf` ignores leading whitespace (consistent with the existing table tests), so such a line is never marked `fenceOpen` and its blank lines are ordinary candidates.
- Blank lines between list items keep being deleted (existing `space list tabulation` tests); blank lines between a list item and its indented continuation are also deleted in v1 (only a tight/loose cosmetic difference).

## 4. Built-in Rules (candidates, as exhaustive as practical)

✔ marks v1 implementations. R1–R3 cover the issue itself.

| id | Decision | Rationale | Status |
|---|---|---|---|
| R1 `table-boundary` ✔ | `before` or `after` is a tableRow/tableDelimiter: one side table → keep; both sides table → delete only repairable seams ("header\|delimiter", "delimiter\|body"), keep everything else (`row\|row`, between two adjacent tables) | Tables cannot interrupt a paragraph, so block-boundary blanks are required; removing a header/delimiter break still yields a table (keeps existing tests); deleting a `row\|row` gap splices two adjacent tables into one bogus table | ✔ |
| R2 `heading-boundary` ✔ | `before`/`after` is atxHeading / setextTitle / setextUnderline | ATX headings do not strictly need blanks, but the issue asks for it and it is harmless; a setext underline **requires** the preceding blank line or it gets swallowed into paragraph text; setext title lines are also marked `setextTitle` so the blank between title and underline survives | ✔ |
| R3 `thematic-break-boundary` ✔ | `before`/`after` is an hr | Joining an hr to the text above makes that text a setext title (`---` becomes its underline); the hr must stand as its own block | ✔ |
| R4 `callout-boundary` ✔ | `before`/`after` is a callout opener | Deleting the blank merges two callouts (or a callout and a plain quote) into one, losing the second callout's structure | ✔ |
| R5 `blockquote-boundary` ✔ | one side is a blockquote line, the other is **not** | Two quote blocks fuse; in pasted text quote blocks are usually semantic boundaries | ✔ (downgrade if it proves too conservative) |
| R6 `frontmatter-boundary` ✔ | `before` is the frontmatter closing fence | Deleting it fuses the first body line into the closing fence | ✔ (added during implementation) |
| R7 `footnote-definition` | Between a footnote definition `[^id]:` and its indented continuation | Continuation merging is subtle, pasting this is rare | v2 candidate |
| R8 `html-block-boundary` | HTML raw-block boundaries | Depends on P5 | v2 candidate |
| R9 `math-block-boundary` | Between a `$$` fence and outside text | In Obsidian math blocks are already delimited by the `$` lines and rarely need blanks | v2 candidate (skipped for now) |
| R10 `preserve-double-newline` | User-defined hard break (keep every paragraph gap) | Beyond "required for rendering" | Not doing it; left as a rule-extension demo |

Every rule is a predicate answering one condition: is there a block boundary between these two lines? `true` keeps the first blank line of the gap, `false` leaves the decision to the other rules. Protected-region blanks are not a rule — they are the content clause of §2.2 — because they matter for every blank line in the region, not for a gap between two blocks.

`$$` opener/closer lines themselves count as text and are handled by P3. `hr` and `tableDelimiter` do **not** compete: `kindOf` tests `tableRowRE` (leading `|`) before `hrRE`, so a line without a leading pipe is always `hr`, never a delimiter row — including `---` directly under `| a | b |`. (An earlier draft claimed the table "wins" there; it does not, and the `| a |\n\n---` test covers only the gap that follows.)

## 5. Settings

```ts
interface RemoveNewlineSettings {
  fixWhitespace: boolean;
  fixHyphenation: boolean;
  preserveUsefulBlankLines: boolean;   // new, default true
  trimTrailingWhitespace: boolean;     // new, default false
}
const DEFAULT_SETTINGS = { ..., preserveUsefulBlankLines: true, trimTrailingWhitespace: false };
```

- New toggle in the settings tab: **Preserve useful blank lines** — "When removing blank lines, keep the ones markdown needs to render tables, headings, dividers, callouts, blockquotes, code blocks, and frontmatter. (Recommended)"
- **On by default**: the old behavior silently corrupts user content, so this is a bug fix. Off = the detector is never called; the keep flags come from `line.trim() !== ""`. With the trailing trim off (its default) that is byte-identical to the pre-detector filter.
- Second toggle: **Trim trailing whitespace** — "Remove trailing whitespace from every kept line, including blank lines and lines inside code blocks. This drops Markdown hard line breaks (two trailing spaces)." **Off by default**: with it off every kept line is emitted exactly as written, so a kept blank line that holds NBSP still looks like a blank but does not separate blocks; turning it on canonicalises them.
- Selection and Paste share `transformFn`, so wiring once covers both paths.
- Applies only to the remove-blank-lines commands; removeNewlines (collapse to one line) is unchanged.

## 6. Files and Change Surface

| File | Change |
|---|---|
| `detector.ts` | New: types, `decidePreservedLines` (line kinds + regions + keep flags), `BOUNDARY_RULES`; produces no text and mutates nothing |
| `utils.ts` | `removeBlankLines(text: string, preserveUseful?: boolean, trimTrailing?: boolean): string`: original split/filter/join; the filter reads `decisionMap.keep[i]`, and `trimTrailing` (default false) adds the trailing whitespace trim. Off = no detector call, i.e. the original trim-only flags |
| `main.ts` | Settings field + pass-through + SettingTab toggle |
| `tests/detector.test.ts` | New: detector contract (parallel `keep`, no input mutation, frozen flags) + rule unit tests |
| `tests/removeNewlines.test.ts` | Add regression cases; the existing 15 must stay untouched and green (their inputs contain no rule-hit blocks, so output is unchanged with the default on) |
| `README.md` / `DEVELOPERS.md` | Feature description / rule-extension guide |

No other logic in `main.ts`, the manifest, or versioning changes; `parser/` stays experimental — no remark toolchain (ESM-only, clashes with ts-jest CJS and esbuild `format:"cjs"`; clipboard content is often partial Markdown, so AST parsing is fragile and still needs a string-level fallback).

## 7. Test List

The 15 existing `removeNewlines.test.ts` cases stay green with the default on (the two table cases now go through the detector). `tests/detector.test.ts` covers:

Detector contract

- `lines[i].raw` is the caller's line, unchanged, for every index
- The input array is not mutated and `keep` is frozen
- Only blank lines can be `keep = false`; non-blank lines are always kept
- A blank line is `trim() === ""`: NBSP, form feed and U+3000 lines count as blank, as they did before the detector
- A kept gap keeps its first blank line, whatever whitespace that line holds
- With trimming off, every kept line is emitted exactly as written
- With trimming on, every kept line loses its trailing whitespace, code blocks included

Content (protected regions, §3)

- Blank lines inside fenced code, frontmatter and `$$` math are kept (as empty lines)
- Blank lines inside `%%` comments are kept
- A single-line `$$x$$` opens no region
- Frontmatter fences get their own kind, while a body blank line stays `kind: "blank"` and is still kept
- A list item never turns the following `---` into a setext underline

Boundaries (R1–R6, §4)

- Paragraph ↔ table blanks are kept; a repairable seam (`header | delimiter`, `delimiter | row`) is dropped
- Two adjacent tables stay separated (`row | row` is not a repair seam)
- `| a |` + blank + `---` keeps the blank (otherwise the `---` becomes `| a |`'s setext underline)
- Headings keep their blanks, both ATX and setext
- Thematic-break boundaries keep blanks: `para` + blank + `---` does not turn `para` into a setext title, and a real `Title` + `---` is not split
- Paragraph ↔ blockquote keeps its blank; two quote lines drop theirs and stay one block
- Callouts keep their blanks and collapse multiples
- A heading next to a table keeps its blank

Edges

- Leading and trailing blank lines are dropped, even when next to a table or heading
- A document without blanks is returned unchanged

Registry

- A predicate pushed into `BOUNDARY_RULES` decides blanks, edges included
- Rules are asked once per gap with the nearest non-blank lines; the trailing gap is never asked

Switch

- `preserveUseful = false` uses the legacy trim-only decision map; the shared trailing-whitespace trim still applies

## 8. Implementation Order

1. `detector.ts`: `kindOf` + regions + keep flags + registry, backed by `detector.test.ts`
2. R1 (tables) + P1 → full test run, issue reproduction turns green
3. R2–R5 + P2–P4
4. Settings switch + `main.ts` wiring + SettingTab
5. README / DEVELOPERS docs
6. Smoke test: paste table-containing text inside Obsidian, verify Live Preview rendering; exercise both switch states

Deviations found while implementing, and why the text above is the corrected version:

- §2.4 gained an explicit "no manual release" clause: the first draft cleared its intermediate arrays by hand; that frees nothing earlier than the GC and reaches into a caller-owned array.
- The frontmatter pass originally retagged **every** line up to the closer as `frontmatterFence`, which silently made inner blank lines non-blank and dropped them. It now marks only the two fences; the body keeps its own kinds (§2.1, tested).
- The `| a |` / `---` example in §4 was written when the classifier was thought to prefer the table. It does not: a line without a leading pipe is `hr`. The paragraph now says so explicitly.
