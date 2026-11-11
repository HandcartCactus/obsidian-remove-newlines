import { decidePreservedLines, BOUNDARY_RULES } from "../detector";
import type { BoundaryRule } from "../detector";
import { removeBlankLines } from "../utils";

const split = (text: string) => text.split(/\r?\n/);
const scan = (text: string) => decidePreservedLines(split(text)).lines;
const keepOf = (text: string) => decidePreservedLines(split(text)).keep;
const blankKeep = (text: string) => keepOf(text).filter((_, i) => scan(text)[i].kind === "blank");

describe("decidePreservedLines", () => {
	test("classifies table rows, headings, hr, fence regions", () => {
		const lines = scan(["text", "| a | b |", "| --- | --- |", "para", "```", "c", "```"].join("\n"));
		expect(lines.map((l) => l.kind)).toEqual([
			"text",
			"tableRow",
			"tableDelimiter",
			"text",
			"fenceOpen",
			"text",
			"fenceClose",
		]);
		expect(lines[5].region).toBe("fencedCode");
	});

	test("keeps the caller's raw line on every entry", () => {
		const raws = ["  | a | b |", "", "```py", "x  ", "```"];
		expect(decidePreservedLines(raws).lines.map((l) => l.raw)).toEqual(raws);
	});

	test("does not mutate or reserialize its input", () => {
		const raws = split("para\n\n| a |\n");
		const snapshot = [...raws];
		const result = decidePreservedLines(raws);
		expect(raws).toEqual(snapshot);
		expect(Object.isFrozen(result.keep)).toBe(true);
	});

	test("marks frontmatter region including inner blank lines", () => {
		const lines = scan("---\ntitle: x\n\ntags: []\n---\nbody");
		expect(lines.slice(0, 5).every((l) => l.region === "frontmatter")).toBe(true);
		expect(lines[5].region).toBe("none");
		// The inner blank stays a blank line and is marked as content.
		expect(lines[2].kind).toBe("blank");
		expect(keepOf("---\ntitle: x\n\ntags: []\n---\nbody")[2]).toBe(true);
	});

	test("marks math region", () => {
		const lines = scan("$$\na\n\nb\n$$\nafter");
		expect(lines.slice(1, 4).every((l) => l.region === "math")).toBe(true);
	});

	test("single-line $$x$$ is not a region", () => {
		const lines = scan("$$x$$\na\n\nb");
		expect(lines[0].region).toBe("none");
		expect(blankKeep("$$x$$\na\n\nb").every((k) => k === false)).toBe(true);
	});

	test("a list item never turns the next --- into a setext underline", () => {
		expect(scan("- a\n---").map((l) => l.kind)).toEqual(["listItem", "hr"]);
	});

	test("only the first blank line of a gap is kept", () => {
		expect(blankKeep("| a | b |\n| - | - |\n\n\n\nx")).toEqual([true, false, false]);
	});

	test("blank lines inside a region are content and all kept", () => {
		expect(blankKeep("```\na\n\n\nb\n```")).toEqual([true, true]);
	});

	test("non-blank lines are kept without a classification-driven exception", () => {
		const result = decidePreservedLines(split("para\n\n| a |"));
		const blanks = result.lines.map((l) => l.kind === "blank");
		expect(blanks).toEqual([false, true, false]);
		expect(result.keep.filter((k, i) => !blanks[i]).every((k) => k)).toBe(true);
	});
});

describe("removeBlankLines", () => {
	test("keeps blank lines around a table but removes interior ones", () => {
		const input = [
			"Some intro text",
			"",
			"| First name | Last name |",
			"| ---------- | --------- |",
			"",
			"| Max        | Planck    |",
			"| Marie      | Curie     |",
			"",
			"Some outro text",
		].join("\n");
		expect(removeBlankLines(input)).toBe(
			[
				"Some intro text",
				"",
				"| First name | Last name |",
				"| ---------- | --------- |",
				"| Max        | Planck    |",
				"| Marie      | Curie     |",
				"",
				"Some outro text",
			].join("\n")
		);
	});

	test("multiple blank lines at a boundary collapse to one", () => {
		expect(removeBlankLines("para\n\n\n| a | b |\n\nnext")).toBe("para\n\n| a | b |\n\nnext");
	});

	test("two adjacent tables stay separated", () => {
		const input = "| a | b |\n| - | - |\n| 1 | 2 |\n\n| c | d |\n| - | - |\n| 3 | 4 |";
		expect(removeBlankLines(input)).toBe(input);
	});

	test("table followed by dash line is not treated as repair seam", () => {
		// Removing the blank here would turn "|a|" + "---" into a setext H2.
		expect(removeBlankLines("| a |\n\n---\n\nx")).toBe("| a |\n\n---\n\nx");
	});

	test("keeps blank lines around headings", () => {
		expect(removeBlankLines("a\n\n## H\n\nb")).toBe("a\n\n## H\n\nb");
		expect(removeBlankLines("a\n\nH\n---\n\nb")).toBe("a\n\nH\n---\n\nb");
	});

	test("hr boundaries keep blank lines (prevents setext swallowing)", () => {
		expect(removeBlankLines("para\n\n---")).toBe("para\n\n---");
		expect(removeBlankLines("Title\n\n---")).toBe("Title\n\n---");
		expect(removeBlankLines("---\n\ntitle\n---")).toBe("---\n\ntitle\n---");
	});

	test("keeps blank line between paragraph and blockquote", () => {
		expect(removeBlankLines("para\n\n> quote")).toBe("para\n\n> quote");
	});

	test("merges paragraph continuation lines inside a blockquote", () => {
		expect(removeBlankLines("> a\n\n> b")).toBe("> a\n> b");
	});

	test("keeps blank lines around and inside a callout, collapses multiples", () => {
		expect(removeBlankLines("para\n\n\n> [!note]\n> body\n\n\nnext")).toBe(
			"para\n\n> [!note]\n> body\n\nnext"
		);
	});

	test("preserves blank lines inside fenced code", () => {
		const input = "```py\nx = 1\n\ny = 2\n```";
		expect(removeBlankLines(input)).toBe(input);
	});

	test("preserves blank lines inside frontmatter and keeps boundary", () => {
		expect(removeBlankLines("---\na: 1\n\nb: 2\n---\n\ntext\n\nmore")).toBe(
			"---\na: 1\n\nb: 2\n---\n\ntext\nmore"
		);
	});

	test("preserves blank lines inside $$ math", () => {
		const input = "$$\na\n\nb\n$$";
		expect(removeBlankLines(input)).toBe(input);
	});

	test("preserves blank lines inside %% comments", () => {
		const input = "%%\nnote\n\nmore\n%%";
		expect(removeBlankLines(input)).toBe(input);
	});

	test("leading and trailing blank lines are dropped", () => {
		expect(removeBlankLines("\n\nfoo\n\nbar\n\n")).toBe("foo\nbar");
	});

	test("document without blanks is unchanged", () => {
		expect(removeBlankLines("a\nb")).toBe("a\nb");
	});

	test("blank means trim() is empty, so NBSP junk counts as blank", () => {
		expect(removeBlankLines("a\n\u00a0\nb")).toBe("a\nb");
		// The NBSP line is the gap head here, so one line is kept — as a real blank.
		expect(removeBlankLines("| a | b |\n\u00a0\n\n| c | d |")).toBe("| a | b |\n\n| c | d |");
	});

	test("kept lines are emitted without trailing whitespace", () => {
		expect(removeBlankLines("para  \n   \n| a | b |  \n")).toBe("para\n\n| a | b |");
		expect(removeBlankLines("```\nx\n   \ny  \n```")).toBe("```\nx\n\ny\n```");
	});

	test("a kept blank lookalike still lands as a real blank line", () => {
		expect(removeBlankLines("| a | b |\n\u00a0\n\u00a0\n| c | d |")).toBe("| a | b |\n\n| c | d |");
	});

	test("unregistered blank lines are dropped", () => {
		// No built-in rule covers plain text or list items.
		expect(blankKeep("para\n\nlist item\n\n- a\n- b").some((kept) => kept)).toBe(false);
		expect(removeBlankLines("para\n\nfoo\n\nbar")).toBe("para\nfoo\nbar");
	});

	test("keeps blank lines between a heading and a table", () => {
		const input = "## H\n\n| a | b |\n| - | - |\n\nx";
		expect(removeBlankLines(input)).toBe(input);
	});

	test("a rule pushed into BOUNDARY_RULES decides blanks", () => {
		const rule: BoundaryRule = () => true;
		BOUNDARY_RULES.push(rule);
		try {
			// Edges have no second block, so they go regardless of the rule.
			expect(removeBlankLines("\n\na\n\n\nb\n\n")).toBe("a\n\nb");
		} finally {
			BOUNDARY_RULES.splice(BOUNDARY_RULES.indexOf(rule), 1);
		}
		expect(removeBlankLines("a\n\nb")).toBe("a\nb");
	});

	test("rules are asked once per gap with the nearest non-blank lines", () => {
		const seen: string[] = [];
		const rule: BoundaryRule = (before, after) => {
			seen.push(`${before.kind}->${after.kind}`);
			return false;
		};
		BOUNDARY_RULES.unshift(rule);
		try {
			decidePreservedLines(split("## H\n\n\n\nx\n\n\n"));
		} finally {
			BOUNDARY_RULES.splice(BOUNDARY_RULES.indexOf(rule), 1);
		}
		// The trailing gap has no second block, so no rule is asked about it.
		expect(seen).toEqual(["atxHeading->text"]);
	});

	test("legacy path drops every blank line when disabled", () => {
		expect(removeBlankLines("a\n\n| h |\n| - |\n\nb", false)).toBe("a\n| h |\n| - |\nb");
	});
});
