import { parseFragment } from "parse5";
import { visit } from "unist-util-visit";
import type { Parent, Root } from "mdast";

// A tag inside a Markdown code span can fool the HTML parser. Spaces hide
// those false tags without shifting the source offsets we need afterward.
function maskNonHtml(children: Parent["children"], source: string) {
    const origin = children[0].position?.start.offset;
    if (origin === undefined) return;

    const starts = new Map<number, number>();
    const ends = new Map<number, number>();
    let markup = "";
    for (const [index, child] of children.entries()) {
        const from = child.position?.start.offset;
        const to = child.position?.end.offset;
        if (from === undefined || to === undefined) return;

        starts.set(from - origin, index);
        ends.set(to - origin, index);
        markup = markup.padEnd(from - origin);
        if (child.type === "html") markup += source.slice(from, to);
        else markup += " ".repeat(to - from);
    }
    return { markup, starts, ends };
}

// "a <span>**b**</span>" keeps the whole span as one literal HTML node.
function mergeInlineElements(children: Parent["children"], source: string) {
    if (!children.some(child => child.type === "html")) return;

    const fragment = maskNonHtml(children, source);
    if (!fragment) return;
    const parsed = parseFragment(fragment.markup, { sourceCodeLocationInfo: true });

    // Replace rightmost siblings first so earlier indices stay valid.
    for (const element of parsed.childNodes.reverse()) {
        if (!("tagName" in element)) continue;
        const span = element.sourceCodeLocation;
        if (!span?.endTag) continue;

        const first = fragment.starts.get(span.startOffset);
        const last = fragment.ends.get(span.endOffset);
        if (first === undefined || last === undefined || first >= last) continue;

        const start = children[first].position?.start;
        const end = children[last].position?.end;
        if (!start || !end) continue;
        const value = source.slice(start.offset, end.offset);
        children.splice(first, last - first + 1, { type: "html", value, position: { start, end } });
    }
}

export function preserveInlineHtml(tree: Root, source: string) {
    visit(tree, node => {
        if (node.type !== "root" && "children" in node && node.children) mergeInlineElements(node.children, source);
    });
}
