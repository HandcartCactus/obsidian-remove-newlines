import { htmlToMarkdown } from "obsidian";
import { decidePreservedLines } from "detector";
import type { KeepDecisionMap } from "detector";
/* 

This file was broken out so that I could implement testing for the plugin.

*/

const removeNewlines = function(text: string, fixHyphenation:boolean, fixWhitespace:boolean): string {
        
    if (fixHyphenation) {
        text = text.replace(/-(\r\n|\r|\n)/g, "");
    }

    text = text.replace(/(\r\n|\r|\n)/g, " ");

    if (fixWhitespace) {
        text = text.replace(/\s{2,}/g, " ");
    }

    return text;
}

const removeBlankLines = function(
    text: string,
    preserveUseful = true,
    trimTrailing = false
): string {
    // Original pipeline: split into lines, drop what does not belong, join.
    // The branch below only picks the decision map; the loop only applies it.
    // See docs/useful-blank-lines-plan.md.
    const lines = text.split(/\r?\n/);

    let decisionMap: KeepDecisionMap;
    if (preserveUseful) {
        decisionMap = decidePreservedLines(lines);
    } else {
        decisionMap = { keep: lines.map((line) => line.trim() !== "") };
    }

    return lines
        .filter((_, i) => decisionMap.keep[i])
        .map((line) => (trimTrailing ? line.trimEnd() : line))
        .join("\n");
}

/**
 * True when two texts differ only in whitespace. The HTML converter inserts
 * structural whitespace of its own (list-item indentation, block separators),
 * so a copy whose HTML carries no extra formatting is better used as copied.
 */
const onlyWhitespaceDiffers = function (a: string, b: string): boolean {
	return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
};

const clipboardItemToString = async function (
	item: ClipboardItem
): Promise<string | null> {
	const plain = item.types.includes("text/plain")
		? await (await item.getType("text/plain")).text()
		: null;

	if (item.types.includes("text/html")) {
		const html = await (await item.getType("text/html")).text();
		const markdown = htmlToMarkdown(html);
		if (plain !== null && onlyWhitespaceDiffers(markdown, plain)) return plain;
		return markdown;
	}

	return plain;
}


export { removeNewlines, removeBlankLines, clipboardItemToString };