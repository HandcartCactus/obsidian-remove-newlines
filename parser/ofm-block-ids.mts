import type { Literal, Root } from "mdast";
import { visit } from "unist-util-visit";

interface BlockId extends Literal {
    type: "obsidianBlockId";
    /** Identifier without the leading caret. */
    value: string;
}

declare module "mdast" {
    interface PhrasingContentMap { obsidianBlockId: BlockId }
    interface RootContentMap { obsidianBlockId: BlockId }
}

// Quartz leaves definitions in text. A terminal " ^id" or a standalone
// "^id" labels a block; x^2, an escaped caret, and a link target do not.
export function markBlockIds(tree: Root, source: string) {
    visit(tree, ["paragraph", "heading"], node => {
        if (node.type !== "paragraph" && node.type !== "heading") return;
        const text = node.children[node.children.length - 1];
        if (text?.type !== "text" || !text.position) return;
        const { start, end } = text.position;
        if (start.offset === undefined || end.offset === undefined) return;

        const match = /\^([a-zA-Z0-9-]+)([ \t]*)$/.exec(text.value);
        if (!match) return;
        const offset = end.offset - match[0].length;
        if (source.slice(offset, end.offset) !== match[0]) return;
        if (offset !== node.position?.start.offset && !/\s/.test(source.charAt(offset - 1))) return;

        const markerStart = { line: end.line, column: end.column - match[0].length, offset };
        const padding = match[2];
        const markerEnd = { line: end.line, column: end.column - padding.length, offset: end.offset - padding.length };
        node.children.pop();
        if (match.index > 0) {
            node.children.push({ type: "text", value: text.value.slice(0, match.index), position: { start, end: markerStart } });
        }
        node.children.push({ type: "obsidianBlockId", value: match[1], position: { start: markerStart, end: markerEnd } });
        if (padding) node.children.push({ type: "text", value: padding, position: { start: markerEnd, end } });
    });
}
