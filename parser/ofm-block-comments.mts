import { location } from "vfile-location";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";

// Only markers in literal text at the beginning of a source line can open
// a block comment. A marker inside a code block is invisible to this visit.
function blockCommentOpeners(tree: Root, source: string): number[] {
    const offsets: number[] = [];
    visit(tree, "text", node => {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (start === undefined || end === undefined) return;

        const text = source.slice(start, end);
        for (const match of text.matchAll(/^%%/gm)) {
            if (match.index === undefined) continue;
            const offset = start + match.index;
            if (offset === 0 || /[\r\n]/.test(source[offset - 1])) offsets.push(offset);
        }
    });
    return offsets;
}

// "%%one\n\ntwo%%" must reach remark as one text block. Each replaced
// newline occupies the same number of UTF-16 offsets as the original.
function foldBlockComments(tree: Root, source: string): string {
    const parts: string[] = [];
    let cursor = 0;
    for (const start of blockCommentOpeners(tree, source)) {
        if (start < cursor) continue;
        const close = source.indexOf("%%", start + 2);
        if (close === -1) break;

        const end = close + 2;
        const comment = source.slice(start, end);
        if (!/[\r\n]/.test(comment)) continue;

        parts.push(source.slice(cursor, start), comment.replace(/[\r\n]/g, " "));
        cursor = end;
    }
    if (!parts.length) return source;
    parts.push(source.slice(cursor));
    return parts.join("");
}

function restoreCommentPositions(tree: Root, markdown: string) {
    // Folding "%%one\n\ntwo%%\n# next" moves the heading to line 2.
    // Offsets still index the original string, where the heading is on line 4.
    const original = location(markdown);
    visit(tree, node => {
        if (!node.position) return;
        const { start, end } = node.position;
        if (start.offset === undefined || end.offset === undefined) return;
        const from = original.toPoint(start.offset);
        const to = original.toPoint(end.offset);
        if (!from || !to) return;
        node.position = { start: from, end: to };
        if (node.type === "obsidianComment") {
            node.value = markdown.slice(start.offset + 2, end.offset - 2);
        }
    });
}

export function parseWithBlockComments(markdown: string, parseTree: (source: string) => Root): Root {
    let source = markdown;
    let tree = parseTree(source);
    let folded = foldBlockComments(tree, source);
    while (folded !== source) {
        source = folded;
        tree = parseTree(source);
        folded = foldBlockComments(tree, source);
    }
    if (source !== markdown) restoreCommentPositions(tree, markdown);
    return tree;
}
