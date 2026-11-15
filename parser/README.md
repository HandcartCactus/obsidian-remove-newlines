# parser
This directory is in support of remove-newlines understanding various markdown features to support syntax-aware newline removal.

The parser uses Quartz's `legacy` preset for Obsidian reading-mode syntax.
Single-line display math is an `inlineMath` node with `data.display === true`.
Embeds are `wikilink` nodes with `embedded === true`. The local adapters
preserve literal inline HTML and expose terminal block definitions as
`obsidianBlockId` nodes with source positions.

Run the parser regression tests from the repository root with
`npm test --workspace remove-newlines-ofm-parser`.

## Potentially Useful Links:
+ https://help.obsidian.md/obsidian-flavored-markdown#Supported+Markdown+extensions
+ https://www.npmjs.com/package/@heavycircle/remark-obsidian
+ https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c#im-having-problems-with-esm-and-typescript
+ https://github.com/jqhoogland/remark-preset-obsidian
+ https://forum.obsidian.md/t/obsidian-markdown-parser/55922/3

# Running the parser

From the repository root, install the dependencies and print the fixture AST:

```sh
npm ci
npx esbuild parser/ofm-parser.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/ofm-parser.mjs
node node_modules/.cache/ofm-parser.mjs
```

Pass a Markdown file path as the final argument to inspect a different note.
