// Runtime dependencies for the OFM parser (ESM, or bundle with esbuild):
// npm i unified@11 remark-parse@11 remark-gfm@4 remark-frontmatter@5 @ziloen/remark-math@0.1.2 @silicajs/remark-obsidian@0.1.0 parse5@7 unist-util-visit@5 vfile-location@5 mdast-util-to-markdown@2 mdast-util-math@3 remark-stringify@11
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { toMarkdown } from "mdast-util-to-markdown";
import { remarkObsidian } from "@silicajs/remark-obsidian";
import { parseWithBlockComments } from "./ofm-block-comments.mjs";
import type { Root } from "mdast";
import { preserveInlineHtml } from "./ofm-html.mjs";
import { preserveMathSource, ziloenRemarkMathNoLatexDelimiters } from "./ofm-math.mjs";

declare module "mdast" {
    interface RootData {
        ofmFinalNewline?: boolean;
    }
}

const parser = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    // Obsidian does not recognize single-tilde ~strikethrough~ 
    // as strikethrough syntax (2026-11-14)
    .use(remarkGfm, { singleTilde: false })
    .use(ziloenRemarkMathNoLatexDelimiters)
    .use(remarkObsidian)
    .freeze();

function parseTree(source: string): Root {
    const tree = parser.parse(source);
    preserveInlineHtml(tree, source);
    return tree;
}

/** Parse note text into a positioned mdast tree, including Obsidian extensions. */
export function parseOfm(markdown: string): Root {
    const tree = parseWithBlockComments(markdown, parseTree);
    preserveMathSource(tree, markdown);
    tree.data = { ...tree.data, ofmFinalNewline: /[\r\n]$/.test(markdown) };
    return tree;
}

/** Serialize an OFM tree, preserving the input's final-newline choice. */
export function stringifyOfm(tree: Root): string {
    const output = toMarkdown(tree, {
        extensions: parser.data("toMarkdownExtensions"),
    });
    // Preserve "word" vs. "word\n". Revisit if cleanup should change the final newline.
    return tree.data?.ofmFinalNewline === false ? output.replace(/\n$/, "") : output;
}
