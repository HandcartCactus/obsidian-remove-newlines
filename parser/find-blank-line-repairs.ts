import type { Node, Nodes } from "mdast";
import { visit } from "unist-util-visit";
import { parseOfm } from "./parse-ofm-strict.mjs";

/** All line numbers are one-based and refer to the original input. */
export interface BlankLineRepair {
    blankLines: number[];
    feature: Nodes["type"];
    fromLine: number;
    toLine: number;
}

// A feature must connect content on both sides of the gap. Simply merging
// plain paragraphs is the normal result of deleting a blank line.
function crossingFeatures(tree: ReturnType<typeof parseOfm>, above: number, below: number) {
    const features: { type: Nodes["type"]; position: NonNullable<Node["position"]> }[] = [];
    visit(tree, node => {
        if (node.type === "root" || node.type === "paragraph" || node.type === "text" || node.type === "break") return;
        const pos = node.position;
        if (pos && pos.start.line <= above && pos.end.line >= below) features.push({ type: node.type, position: pos });
    });
    return features;
}

/**
 * Try each interior blank run in document order. Keep successful trials in
 * the working copy so subsequent rows can join a newly recognized table.
 * This is a detector: the caller's source is never rewritten.
 */
export function findBlankLineRepairs(markdown: string): BlankLineRepair[] {
    const lines = markdown.split(/\r\n|\n|\r/).map((text, index) => ({ text, number: index + 1 }));
    const parseLines = (input: typeof lines) => parseOfm(input.map(line => line.text).join("\n"));
    let tree = parseLines(lines);
    const repairs: BlankLineRepair[] = [];
    let i = 0;
    while (i < lines.length) {
        if (!/^[ \t]*$/.test(lines[i].text)) {
            i++;
            continue;
        }
        const start = i;
        while (i < lines.length && /^[ \t]*$/.test(lines[i].text)) i++;
        if (start === 0 || i === lines.length) continue;

        const existing = crossingFeatures(tree, start, i + 1);
        const trial = lines.slice(0, start).concat(lines.slice(i));
        const candidate = parseLines(trial);
        const gained = crossingFeatures(candidate, start, start + 1).filter(node =>
            !existing.some(old => old.type === node.type &&
                old.position.start.line === node.position.start.line &&
                old.position.start.column === node.position.start.column)
        );
        if (!gained.length) continue;

        const blankLines = lines.slice(start, i).map(line => line.number);
        for (const node of gained) {
            const { start: from, end: to } = node.position;
            repairs.push({
                blankLines,
                feature: node.type,
                fromLine: trial[from.line - 1].number,
                toLine: trial[to.line - 1].number,
            });
        }
        lines.splice(start, i - start);
        tree = candidate;
        i = start;
    }
    return repairs;
}
