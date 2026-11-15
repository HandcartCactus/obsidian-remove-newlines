import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkObsidian from "@quartz-community/remark-obsidian";
import remarkStringify from "remark-stringify";
import type { Root } from "mdast";
import { preserveInlineHtml } from "./ofm-html.mjs";
import { markBlockIds } from "./ofm-block-ids.mjs";

declare module "mdast" {
    interface RootData {
        ofmFinalNewline?: boolean;
    }
}

const parser = unified()
    .use(remarkParse)
    .use(remarkGfm, { singleTilde: false })
    .use(remarkObsidian, { preset: "legacy", parseComments: false, bomOffsets: true })
    .use(remarkStringify, { handlers: { obsidianBlockId: node => "^" + node.value } })
    .freeze();

/** Parse note text into a positioned mdast tree, including Obsidian extensions. */
export function parseOfm(markdown: string): Root {
    const tree = parser.runSync(parser.parse(markdown), markdown) as Root;
    preserveInlineHtml(tree, markdown);
    markBlockIds(tree, markdown);
    tree.data = { ...tree.data, ofmFinalNewline: /[\r\n]$/.test(markdown) };
    return tree;
}

/** Serialize an OFM tree, preserving the input's final-newline choice. */
export function stringifyOfm(tree: Root): string {
    const output = parser.stringify(tree);
    // Preserve "word" vs. "word\n". Revisit if cleanup should change the final newline.
    return tree.data?.ofmFinalNewline === false ? output.replace(/\n$/, "") : output;
}
