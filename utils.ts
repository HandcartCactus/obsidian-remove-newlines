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

const removeBlankLines = function(text: string, preserveUseful = true): string {
    // Original pipeline: split into lines, drop what does not belong, join.
    // The branch below only picks the decision map; removal is always the same
    // lookup. See docs/useful-blank-lines-plan.md.
    const lines = text.split(/\r?\n/);

    let decisionMap: KeepDecisionMap;
    if (preserveUseful) {
        // Detector: keep[i] says whether line i survives.
        decisionMap = decidePreservedLines(lines);
    } else {
        // Legacy: a line survives only if it has content.
        decisionMap = { keep: lines.map((line) => line.trim() !== "") };
    }

    return lines
        .filter((_, i) => decisionMap.keep[i])
        .map((line) => line.trimEnd())  // ES2019 lib in tsconfig.json; see DEVELOPERS.md
        .join("\n");
}

const clipboardItemToString = async function (
	item: ClipboardItem
): Promise<string | null> {

	if (item.types.includes("text/html")) {
		const html = await (await item.getType("text/html")).text();
		return htmlToMarkdown(html);
	}

	if (item.types.includes("text/plain")) {
		return await (await item.getType("text/plain")).text();
	}

	return null;
}


export { removeNewlines, removeBlankLines, clipboardItemToString };