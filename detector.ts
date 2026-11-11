// Blank-line detector: pure, mark-only classification.
//
// `decidePreservedLines(lines)` takes the whole document as an array (blank lines included,
// nothing pre-filtered) and returns a per-line mapping: keep or drop. It
// never copies, deletes, rewrites or joins lines, and the mapping is a fresh
// array held next to the input, so nothing is mutated in place.
// See docs/useful-blank-lines-plan.md.

export type LineKind =
	| "blank"
	| "text"
	| "tableRow"
	| "tableDelimiter"
	| "atxHeading"
	| "setextTitle"
	| "setextUnderline"
	| "fenceOpen"
	| "fenceClose"
	| "hr"
	| "blockquote"
	| "callout"
	| "listItem"
	| "frontmatterFence";

export type Region = "none" | "fencedCode" | "frontmatter" | "math" | "comment";

/** Classification of one input line. `raw` is read, never written back. */
export interface ScannedLine {
	index: number;
	raw: string;
	kind: LineKind;
	/** Enclosing protected block, where blank lines are content. */
	region: Region;
}

/**
 * Detector output: one entry per input line, in input order, and immutable.
 * `keep[i]` is the only decision the caller acts on — true passes line `i` of
 * the input array to the output, false drops it.
 */
export interface DecisionMap {
	readonly lines: readonly ScannedLine[];
	readonly keep: readonly boolean[];
}

/** The part of `DecisionMap` the removal step consumes: one flag per line. */
export type KeepDecisionMap = Pick<DecisionMap, "keep">;

/**
 * A condition: true when `before` and `after` form a block boundary, i.e. the
 * gap between them needs one blank line. Rules are conditions, not verdicts —
 * the engine turns any matching boundary into `keep`. Both lines always exist,
 * so a rule is never asked about a document edge.
 */
export type BoundaryRule = (before: ScannedLine, after: ScannedLine) => boolean;

/**
 * A line is blank when it has no visible character, i.e. `trim()` removes all
 * of it (spaces, tabs, NBSP, form feed, U+2000..U+200A, U+3000, U+FEFF).
 */
export const isBlankLine = (raw: string): boolean => raw.trim() === "";
const tableRowRE = /^[ \t]*\|/;
const tableDelimiterRE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*\|/;
const atxHeadingRE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const setextUnderlineRE = /^ {0,3}(=+|-+)[ \t]*$/;
const fenceRE = /^ {0,3}(`{3,}|~{3,})/;
const hrRE = /^ {0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;
const blockquoteRE = /^ {0,3}>/;
const calloutRE = /^ {0,3}>[ \t]*\[[A-Za-z][A-Za-z0-9-]*[+-]?\][ \t]*/;
const listItemRE = /^(?: {0,3}[-*+][ \t]+| {0,3}\d{1,9}[.)][ \t]+)/;
const mathOpenRE = /^ {0,3}\$\$(?!.*\$\$)/;
const mathCloseRE = /\$\$[ \t]*$/;
const fmDashOpenRE = /^---[ \t]*$/;
const fmDashCloseRE = /^(---|\.\.\.)[ \t]*$/;
// "+++" closes with itself, so opener and closer are the same pattern.
const fmPlusFenceRE = /^\+\+\+[ \t]*$/;

function kindOf(raw: string, prev: ScannedLine | null, lines: ScannedLine[]): LineKind {
	if (isBlankLine(raw)) return "blank";
	if (fenceRE.test(raw)) return "fenceOpen"; // → fenceClose once matched as closer
	if (mathOpenRE.test(raw)) return "fenceOpen"; // $$ opener, same handling
	if (calloutRE.test(raw)) return "callout";
	if (blockquoteRE.test(raw)) return "blockquote";
	if (tableRowRE.test(raw)) {
		return tableDelimiterRE.test(raw) ? "tableDelimiter" : "tableRow";
	}
	if (atxHeadingRE.test(raw)) return "atxHeading";
	// A dash/equals line is the previous text line's setext underline when
	// they are adjacent, or separated only by blank lines. The latter stays
	// ambiguous, but keeping the heading reading is safe: R2/R3 keep the
	// blank either way, while misreading a real heading's underline as an hr
	// would delete it and split the heading from its title.
	if (setextUnderlineRE.test(raw)) {
		let p = prev;
		while (p && p.kind === "blank") p = lines[p.index - 1] ?? null;
		if (p && p.kind === "text") return "setextUnderline";
	}
	if (hrRE.test(raw)) return "hr";
	if (listItemRE.test(raw)) return "listItem";
	return "text";
}

function nearestContent(lines: ScannedLine[], from: number, dir: number): ScannedLine | null {
	for (let i = from; i >= 0 && i < lines.length; i += dir) {
		if (lines[i].kind !== "blank") return lines[i];
	}
	return null;
}

/**
 * Classifies every line of `raws` and returns one keep/drop flag per line. Non-blank
 * lines are always kept; a blank line is kept when it is content (inside a
 * protected region) or when it is the first blank of a gap whose two sides a
 * boundary rule says must not fuse. Reads `raws`, never writes it.
 */
export function decidePreservedLines(raws: readonly string[]): DecisionMap {
	const lines: ScannedLine[] = [];
	for (let i = 0; i < raws.length; i++) {
		const prev = lines.length ? lines[lines.length - 1] : null;
		lines.push({ index: i, raw: raws[i], kind: kindOf(raws[i], prev, lines), region: "none" });
	}

	// YAML/TOML frontmatter: opener on line 0 with a matching closer below.
	// Only the two fences get their own kind; the body keeps its own classes,
	// so blank lines inside stay blank and still get a decision.
	if (lines.length > 1) {
		const isPlus = fmPlusFenceRE.test(lines[0].raw);
		if (isPlus || fmDashOpenRE.test(lines[0].raw)) {
			const closeRE = isPlus ? fmPlusFenceRE : fmDashCloseRE;
			// An unclosed "---" stays a thematic break (kindOf's reading).
			for (let i = 1; i < lines.length; i++) {
				if (!closeRE.test(lines[i].raw)) continue;
				lines[0].kind = "frontmatterFence";
				lines[i].kind = "frontmatterFence";
				for (let j = 0; j <= i; j++) lines[j].region = "frontmatter";
				break;
			}
		}
	}

	// Protected regions; also resolves fenceOpen candidates to fenceClose.
	let code: { ch: string; len: number } | null = null;
	let inMath = false;
	let inComment = false;
	for (const line of lines) {
		if (line.region === "frontmatter") continue;
		const raw = line.raw;
		if (code) {
			line.region = "fencedCode";
			const m = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(raw);
			if (m && m[1][0] === code.ch && m[1].length >= code.len) {
				line.kind = "fenceClose";
				code = null;
			} else if (fenceRE.test(raw) || mathOpenRE.test(raw)) {
				line.kind = "text"; // fence-like marker inside a code block
			}
			continue;
		}
		if (inMath) {
			line.region = "math";
			if (mathCloseRE.test(raw)) {
				line.kind = "fenceClose";
				inMath = false;
			}
			continue;
		}
		if (inComment) {
			line.region = "comment";
			if (raw.indexOf("%%") !== -1) inComment = false;
			continue;
		}
		if (line.kind === "fenceOpen") {
			const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw);
			if (m) {
				code = { ch: m[1][0], len: m[1].length };
			} else {
				inMath = true; // $$ opener; its own line stays region "none"
			}
			continue;
		}
		// A blank line cannot carry "%%"; only content lines open a comment.
		const at = raw.indexOf("%%");
		if (at !== -1 && raw.indexOf("%%", at + 2) === -1) inComment = true;
	}

	// A setext underline makes the text line above it (blank lines skipped) a
	// heading title. Marking titles lets R2 keep blanks inside a multi-line
	// setext heading.
	for (const line of lines) {
		if (line.kind !== "setextUnderline") continue;
		const title = nearestContent(lines, line.index - 1, -1);
		if (title && title.kind === "text") title.kind = "setextTitle";
	}

	// Non-blank lines are never inspected: they are always kept. A blank line is
	// kept when it is content, or when it is the first blank of a gap whose two
	// sides a boundary rule says must not fuse — that first-blank clause is what
	// collapses a gap to one line. The caller trims the kept line, so the kept
	// line is emitted as a real blank whatever whitespace it holds.
	const kept = lines.map((line) => {
		if (line.kind !== "blank") return true;
		if (line.region !== "none") return true;
		const before = nearestContent(lines, line.index - 1, -1);
		const after = nearestContent(lines, line.index + 1, +1);
		return (
			lines[line.index - 1]?.kind !== "blank" &&
			before !== null &&
			after !== null &&
			BOUNDARY_RULES.some((rule) => rule(before, after))
		);
	});
	return { lines, keep: Object.freeze(kept) };
}

const isTable = (l: ScannedLine): boolean =>
	l.kind === "tableRow" || l.kind === "tableDelimiter";
const isHeading = (l: ScannedLine): boolean =>
	l.kind === "atxHeading" || l.kind === "setextTitle" || l.kind === "setextUnderline";

// A blank line between two rows may be deleted only when the seam still forms
// a pipe-table once merged: header | delimiter, or delimiter | body. Row | row
// is not repairable — merging would splice two adjacent tables into one.
function isTableRepairSeam(before: ScannedLine, after: ScannedLine): boolean {
	if (before.kind === "tableDelimiter") return after.kind === "tableRow";
	return before.kind === "tableRow" && after.kind === "tableDelimiter";
}

const tableBoundary: BoundaryRule = (before, after) => {
	// Table ↔ text is a block boundary. Inside a table only a repairable seam
	// (header | delimiter, delimiter | row) is not, because merging it still
	// yields a pipe-table.
	if (!isTable(before) && !isTable(after)) return false;
	return !(isTable(before) && isTable(after) && isTableRepairSeam(before, after));
};

const headingBoundary: BoundaryRule = (before, after) => isHeading(before) || isHeading(after);

const thematicBreakBoundary: BoundaryRule = (before, after) =>
	before.kind === "hr" || after.kind === "hr";

const calloutBoundary: BoundaryRule = (before, after) =>
	before.kind === "callout" || after.kind === "callout";

// The blank after a closed frontmatter block must survive, or the first body
// line fuses into the closing fence.
const frontmatterBoundary: BoundaryRule = (before) => before.kind === "frontmatterFence";

// Quote ↔ non-quote is a block boundary; two quotes stay one block.
const blockquoteBoundary: BoundaryRule = (before, after) =>
	(before.kind === "blockquote") !== (after.kind === "blockquote");

/** Registry; push more predicates to extend. Any boundary keeps the gap. */
export const BOUNDARY_RULES: BoundaryRule[] = [
	tableBoundary,
	headingBoundary,
	thematicBreakBoundary,
	calloutBoundary,
	frontmatterBoundary,
	blockquoteBoundary,
];
