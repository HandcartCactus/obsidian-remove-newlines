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

Add `detector.ts`, which abstracts "which blank lines are useful" into a **rule registry** so the decision logic stays extensible; `removeBlankLines` becomes a pure engine and no longer embeds decisions.

```
detector.ts (new)
  ├─ scanDocument(text): ScannedDoc        // pre-pass: classify lines + mark block regions
  ├─ UsefulBlankLineRule[]  BUILTIN_RULES  // rule registry (extension point)
  └─ removeBlankLinesWithDetector(text, opts): string
utils.ts
  └─ removeBlankLines(text, preserveUseful = true)  // thin wrapper, single-arg calls still work
main.ts
  └─ settings.preserveUsefulBlankLines → passed into the wrapper
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
  | "callout"             // ^\s{0,3}>\s*\[![a-zA-Z]+  (Obsidian callout opener)
  | "listItem"            // ^\s*([-*+]|\d+[.)])\s  (v1 does not decide on it; rules may)
  | "frontmatterFence";   // leading --- / +++ and its matching closer

interface ScannedLine {
  index: number;
  raw: string;
  kind: LineKind;
  region: "none" | "fencedCode" | "frontmatter" | "math" | "comment"; // enclosing protected region
}

interface BlankRun {           // a maximal run of blank lines (deletion candidate)
  start: number;               // line interval [start, end)
  end: number;
  before: ScannedLine | null;  // nearest non-blank line above (null at document start)
  after: ScannedLine | null;   // nearest non-blank line below (null at document end)
  useful: boolean;             // any registered rule voted to keep it
}

interface UsefulBlankLineRule {
  id: string;                                  // unique, e.g. "table-boundary"
  isUseful(run: BlankRun, doc: ScannedDoc): boolean;
}

export const BUILTIN_RULES: UsefulBlankLineRule[] = [ /* R1..R6, see §4 */ ];
```

### 2.2 Engine Rules (not votes, fixed semantics)

1. **Protected regions pass through**: blank lines with `region !== "none"` never enter a `BlankRun` and are emitted verbatim (see P1–P4).
2. **Leading/trailing runs are always deleted**: `before === null || after === null` never consults rules (matches the existing `"\n+ abc\n    \n+ def" → "+ abc\n+ def"` test; document edges have no block boundary).
3. **One hit keeps, collapsed to one**: `BUILTIN_RULES` is evaluated in order; any `true` makes the run emit a single blank line (consecutive blanks also collapse to 1 — Markdown never needs 2+).
4. **No hit → delete the whole run** (preserves current behavior).

> Any-vote (one hit keeps) rather than first-match short-circuit: a `false` never vetoes, so a new rule can only preserve more; extenders cannot accidentally break someone else's rule.

### 2.3 How to Extend

- In code: `BUILTIN_RULES.push(myRule)` (the array is exported); rules only depend on `ScannedLine.kind/region`, and the classifier can be taught new `kind`s.
- Reserved (not v1): store enabled rule ids in settings for per-rule toggles; v1 exposes only the master switch.

## 3. Protected Regions (scanner, `region`)

| id | Interval | Rationale | Status |
|---|---|---|---|
| P1 | Fenced code block (``` / ~~~, opener to matching closer; unclosed runs to EOF) | Blank lines are code content (the author's own note in `parser/ofm-features.md`: "dont remove these blank lines?") | v1 |
| P2 | Frontmatter (leading `---`/`+++` with a matching closer) | YAML block scalars `|`/`>` are blank-line sensitive | v1 |
| P3 | `$$ ... $$` display math | Blank lines inside matrix/align environments are content | v1 |
| P4 | `%% ... %%` block comment | Deleting blanks inside comments is mostly harmless, but protect conservatively | v1 |
| P5 | HTML block (`<div>` … `</div>`) | A blank line terminates a raw block | v2 candidate, high complexity |

**Explicitly out of scope** (recorded so it is not filed as a bug later):

- **Indented code blocks** (4 spaces / tab) are not protected. CommonMark protects their blank lines, but that conflicts with the existing `tabulation doesnt break it` contract, and paste scenarios are almost entirely plain indented text. The classifier ignores leading whitespace (consistent with the existing table tests).
- Blank lines between list items keep being deleted (existing `space list tabulation` tests); blank lines between a list item and its indented continuation are also deleted in v1 (only a tight/loose cosmetic difference).

## 4. Built-in Rules (candidates, as exhaustive as practical)

✔ marks v1 implementations. R1–R3 cover the issue itself.

| id | Decision | Rationale | Status |
|---|---|---|---|
| R1 `table-boundary` ✔ | `before` or `after` is a tableRow/tableDelimiter: one side table → keep; both sides table → delete only repairable seams ("header\|delimiter", "delimiter\|body"), keep everything else (`row\|row`, between two adjacent tables) | Tables cannot interrupt a paragraph, so block-boundary blanks are required; removing a header/delimiter break still yields a table (keeps existing tests); deleting a `row\|row` gap splices two adjacent tables into one bogus table | ✔ |
| R2 `heading-boundary` ✔ | `before`/`after` is atxHeading / setextTitle / setextUnderline | ATX headings do not strictly need blanks, but the issue asks for it and it is harmless; a setext underline **requires** the preceding blank line or it gets swallowed into paragraph text; setext title lines are also marked `setextTitle` so the blank between title and underline survives | ✔ |
| R3 `thematic-break-boundary` ✔ | `before`/`after` is an hr | A paragraph touching `---` is parsed as a setext heading; an hr must stand as its own block | ✔ |
| R4 `callout-boundary` ✔ | `before`/`after` is a callout opener | Deleting the blank merges two callouts (or a callout and a plain quote) into one, losing the second callout's structure | ✔ |
| R5 `blockquote-boundary` ✔ | one side is a blockquote line, the other is **not** | Two quote blocks fuse; in pasted text quote blocks are usually semantic boundaries | ✔ (downgrade if it proves too conservative) |
| R6 `frontmatter-boundary` ✔ | `before` is the frontmatter closing fence | Deleting it fuses the first body line into the closing fence | ✔ (added during implementation) |
| R7 `footnote-definition` | Between a footnote definition `[^id]:` and its indented continuation | Continuation merging is subtle, pasting this is rare | v2 candidate |
| R8 `html-block-boundary` | HTML raw-block boundaries | Depends on P5 | v2 candidate |
| R9 `math-block-boundary` | Between a `$$` fence and outside text | In Obsidian math blocks are already delimited by the `$` lines and rarely need blanks | v2 candidate (skipped for now) |
| R10 `preserve-double-newline` | User-defined hard break (keep every paragraph gap) | Beyond "required for rendering" | Not doing it; left as a rule-extension demo |

`$$` opener/closer lines themselves count as text and are handled by P3; when `hr` and `tableDelimiter` conflict (a table flush against a delimiter row), the table wins — the scanner classifies a `---` line as tableDelimiter rather than hr when the line above is a tableRow.

## 5. Settings

```ts
interface RemoveNewlineSettings {
  fixWhitespace: boolean;
  fixHyphenation: boolean;
  preserveUsefulBlankLines: boolean;   // new
}
const DEFAULT_SETTINGS = { ..., preserveUsefulBlankLines: true };
```

- New toggle in the settings tab: **Preserve useful blank lines** — "Keep blank lines required to render tables, headings, code blocks, etc. Disable to restore legacy remove-all behavior."
- **On by default**: the current behavior silently corrupts user content, so this is a bug fix; off = the complete old behavior (the engine takes the original filter path when off — one branch).
- Selection and Paste share `transformFn`, so wiring once covers both paths.
- Applies only to the remove-blank-lines commands; removeNewlines (collapse to one line) is unchanged.

## 6. Files and Change Surface

| File | Change |
|---|---|
| `detector.ts` | New: types, `scanDocument`, engine, `BUILTIN_RULES` |
| `utils.ts` | `removeBlankLines(text, preserveUseful = true)` delegates to the detector; keeps the original path when off |
| `main.ts` | Settings field + pass-through + SettingTab toggle |
| `tests/detector.test.ts` | New: rule unit tests |
| `tests/removeNewlines.test.ts` | Add regression cases; the existing 15 must stay untouched and green (their inputs contain no rule-hit blocks, so output is unchanged with the default on) |
| `README.md` / `DEVELOPERS.md` | Feature description / rule-extension guide |

No other logic in `main.ts`, the manifest, or versioning changes; `parser/` stays experimental — no remark toolchain (ESM-only, clashes with ts-jest CJS and esbuild `format:"cjs"`; clipboard content is often partial Markdown, so AST parsing is fragile and still needs a string-level fallback).

## 7. Test List

Existing 15 stay green (default on). Added:

- Paragraph ↔ table boundary blanks preserved (issue reproduction, red → green)
- Broken-row tables still merge (= the two existing cases, double coverage)
- Blank between two adjacent tables preserved
- Blanks before/after headings preserved; setext headings; heading adjacent to a table
- Blanks inside code blocks / frontmatter / `$$` / `%%` preserved
- Consecutive blanks hitting a rule collapse to 1
- Blank between an hr and a paragraph preserved
- Callout and blockquote boundaries
- Switch off: table cases byte-identical to the old implementation
- Extensibility: pushing a fake rule into `BUILTIN_RULES` takes effect (registry works)
- Leading/trailing runs always deleted (even next to a table/heading)

## 8. Implementation Order

1. `detector.ts`: scanner + engine + registry, backed by `detector.test.ts`
2. R1 (tables) + P1 → full test run, issue reproduction turns green
3. R2–R5 + P2–P4
4. Settings switch + `main.ts` wiring + SettingTab
5. README / DEVELOPERS docs
6. Smoke test: paste table-containing text inside Obsidian, verify Live Preview rendering; exercise both switch states