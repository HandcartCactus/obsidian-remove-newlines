// https://github.com/orgs/remarkjs/discussions/1056
// Obsidian supports single-line displaymath but the main remark-math does not
// @ziloen's version supports single-line displaymath. 
// Unfortunately, it also supports LaTeX delimiters, so we have to disable those
import remarkMath from "@ziloen/remark-math"; 
import { mathToMarkdown } from "mdast-util-math";
import type { Handle, Join, Options } from "mdast-util-to-markdown";
import type { Processor } from "unified";
import type { Paragraph, Root } from "mdast";
import type {} from "remark-stringify";
import { location } from "vfile-location";
import { visit } from "unist-util-visit";

declare module "mdast" {
    interface Data {
        ofmMathSource?: string;
        ofmMathValue?: string;
    }
}

// Obsidian does not recognize LaTeX delimiters \(x\) and \[x\] as math but @ziloen/remark-math does
export function ziloenRemarkMathNoLatexDelimiters(this: Processor) {
    const firstMathExtension = this.data("micromarkExtensions")?.length ?? 0;
    remarkMath.call(this);
    const backslash = "\\".charCodeAt(0);
    for (const extension of this.data("micromarkExtensions")?.slice(firstMathExtension) ?? []) {
        // this disables \ as a potential trigger for inline and displaymath
        delete extension.flow?.[backslash];
        delete extension.text?.[backslash];
    }
    const writers = this.data("toMarkdownExtensions");
    const defaults = writers?.[writers.length - 1]?.handlers;
    const doubleDollarMath = mathToMarkdown({ singleDollarTextMath: false }).handlers?.inlineMath;
    if (!writers || !defaults?.inlineMath || !defaults.math || !doubleDollarMath) {
        throw new Error("Missing Markdown serializer for math");
    }
    writers.push(mathWriter(defaults.inlineMath, defaults.math, doubleDollarMath));
}

// The one drawback of @ziloen/remark-math is that it's reconstruction of
// $$displaymath$$\n$inlinemath$ REMOVES the newline that should be there between them
// so we have to make sure that adjacent math is ok

// The plugin trims a separator from the text value but leaves its source
// span intact: in "$$x$$\n$y$" an empty text node still covers the newline.
function trimMathBoundary(paragraph: Paragraph, side: "start" | "end", source: string, points: ReturnType<typeof location>) {
    const first = side === "start";
    const index = first ? 0 : paragraph.children.length - 1;
    const edge = paragraph.children[index];
    if (edge?.type !== "text" || !edge.position || !paragraph.position) return;

    if (edge.value === "") {
        paragraph.children.splice(index, 1);
        const neighbor = first ? paragraph.children[0] : paragraph.children[paragraph.children.length - 1];
        if (neighbor?.position) paragraph.position[side] = neighbor.position[side];
        return;
    }

    const { start, end } = edge.position;
    const raw = source.slice(start.offset, end.offset);
    const boundary = first ? /^[ \t]*(?:\r\n|[\r\n])[> \t]*/ : /[ \t]*(?:\r\n|[\r\n])[ \t]*$/;
    const removed = boundary.exec(raw)?.[0].length;
    if (!removed) return;
    if (start.offset === undefined || end.offset === undefined) return;
    const offset = first ? start.offset + removed : end.offset - removed;
    const point = points.toPoint(offset);
    if (point) paragraph.position[side] = edge.position[side] = point;
}

export function preserveMathSource(tree: Root, source: string) {
    const points = location(source);
    visit(tree, node => {
        if (node.type !== "math" && node.type !== "inlineMath") return;
        const position = node.position;
        if (!position || position.start.line !== position.end.line) return;
        const raw = source.slice(position.start.offset, position.end.offset);
        node.data = { ...node.data, ofmMathSource: raw, ofmMathValue: node.value };
    });
    visit(tree, "paragraph", (paragraph, index, parent) => {
        if (!parent || index === undefined) return;
        if (parent.children[index - 1]?.type === "math") trimMathBoundary(paragraph, "start", source, points);
        if (parent.children[index + 1]?.type === "math") trimMathBoundary(paragraph, "end", source, points);
    });
}

function mathWriter(singleDollarMath: Handle, defaultDisplayMath: Handle, doubleDollarMath: Handle): Options {
    // In "see $$x$$ here", the default writer emits "see $x$ here". Keep
    // the delimiters even after a value edit, e.g. x → y gives "see $$y$$ here".
    const writeInlineMath: Handle = (node, parent, state, info) => {
        const raw = node.data?.ofmMathSource;
        if (typeof raw !== "string") return singleDollarMath(node, parent, state, info);
        if (node.value === node.data?.ofmMathValue) return raw;
        if (raw.startsWith("$$")) return doubleDollarMath(node, parent, state, info);
        return singleDollarMath(node, parent, state, info);
    };

    // Promoted $$x$$ keeps its one-line spelling, including after a simple value edit.
    const writeDisplayMath: Handle = (node, parent, state, info) => {
        const raw = node.data?.ofmMathSource;
        if (raw && !/[\r\n]/.test(node.value)) {
            if (node.value === node.data.ofmMathValue) return raw;
            if (node.value && !node.value.includes("$$")) return doubleDollarMath(node, parent, state, info);
        }
        return defaultDisplayMath(node, parent, state, info);
    };

    return {
        handlers: { inlineMath: writeInlineMath, math: writeDisplayMath },
        join: [joinAdjacentDisplayMath],
    };
}

// The default writer inserts a blank line between adjacent blocks.
const joinAdjacentDisplayMath: Join = (left, right) => {
    const leftIsDisplay = left.type === "math" && left.data?.ofmMathSource;
    const rightIsDisplay = right.type === "math" && right.data?.ofmMathSource;
    if (!leftIsDisplay && !rightIsDisplay) return;
    if (left.position && right.position && right.position.start.line === left.position.end.line + 1) return 0;
};
