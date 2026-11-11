# Developer Documentation
Deploying a release:
1. Make changes
2. Increase version in manifest.json
3. Increase version in versions.json
4. `npm run build`
5. Write tests
6. check if test passes with `npm run test`
7. Open obsidian, click the question mark in the bottom left, open up a sandbox vault
8. Deploy the plugin to the sandbox vault with `/bin/python3 ./pluginloader.py`
9. In obsidian sandbox, go to `settings > community plugins`. Click "turn on and reload".
10. Reopen settings. Turn on community plugins. Enable remove newlines.
11. Test plugin locally.
12. Write new entry for changelog in README.md
13. Push changes to repo.
14. Go to https://github.com/HandcartCactus/obsidian-remove-newlines/releases/new
15. create new tag for version, paste changelog notes
16. Click "attach binaries by dropping them here or selecting them", select your `main.js`, `styles.css`, and `manifest.json`.
17. click "release".

## Blank-line cleanup
`removeBlankLines` in [`utils.ts`](utils.ts) is still the original `split` → `filter` → `join`, but the filter no longer decides anything: it reads one keep/drop flag per line, and those flags come from the detector when the setting is on.

```ts
const lines = text.split(/\r?\n/);

let decisionMap: KeepDecisionMap;
if (preserveUseful) {
  decisionMap = decidePreservedLines(lines);          // markdown-aware flags
} else {
  decisionMap = { keep: lines.map((l) => l.trim() !== "") }; // legacy flags
}

return lines.filter((_, i) => decisionMap.keep[i]).join("\n");
```

The emission step trims trailing whitespace from every kept line (`trimEnd`). That method is typed only when the `ES2019` lib is included, which is why `tsconfig.json` has it — a compiler-only setting: no polyfill, nothing to download, and Obsidian's Chromium has had the method since Chrome 66.

The branch only picks the decisions; both have the same shape (`keep[i]`, one boolean per input line), and the removal step is the same lookup either way — `utils.ts` contains no blank-line logic at all. Both modes share one definition of "blank": `isBlankLine(raw)` is `raw.trim() === ""`, so whitespace-only lines (NBSP, form feed, U+3000) count as blank exactly as they did before. A kept gap keeps its first blank line; the emission step then trims trailing whitespace from every kept line, so whatever whitespace that line holds it lands as a real blank line. The decisions themselves only say keep or drop — the trim is applied to all kept lines, not just blank ones.

`decidePreservedLines` in [`detector.ts`](detector.ts) receives the complete line array (blank lines included) and returns `DecisionMap { lines, keep }`: `lines[i]` describes line `i` (kind, enclosing region, raw), and `keep[i]` is the single decision the caller acts on. The detector never removes, rewrites, joins or mutates anything; `keep` is a fresh frozen array parallel to the input.

Every non-blank line is always preserved; it carries no decision. A blank line is preserved when it is

1. **inside a protected region** — content: fenced code, frontmatter, `$$` math or `%%` comment; or
2. **the first blank line of a gap** whose two sides a rule in `BOUNDARY_RULES` says must not fuse.

Clause 2 is what collapses a gap to one line, and it only applies between two blocks — at a document edge nothing is kept. `removeBlankLines` then trims trailing whitespace from every kept line, so that kept line is emitted as an empty one. With `preserveUseful` off the detector is never called and the flags are the legacy trim-only ones.

To add a rule, push a predicate `(before, after) => boolean` into `BOUNDARY_RULES` and cover it in `tests/detector.test.ts`. The predicate receives the two nearest non-blank lines (never null) and reports whether they form a block boundary, i.e. must not fuse. Rules are conditions, not verdicts; the detector turns any matching boundary into `keep = true` and combines them with OR, so a new rule can only preserve more.
