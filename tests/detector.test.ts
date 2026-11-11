import { scanDocument, removeBlankLinesWithDetector } from "../detector";
import { removeBlankLines } from "../utils";

describe("scanDocument", () => {
	test("classifies table rows, headings, hr, fence regions", () => {
		const doc = scanDocument(
			["text", "| a | b |", "| --- | --- |", "para", "```", "c", "```"].join("\n")
		);
		expect(doc.lines.map((l) => l.kind)).toEqual([
			"text",
			"tableRow",
			"tableDelimiter",
			"text",
			"fenceOpen",
			"text",
			"fenceClose",
		]);
		expect(doc.lines[5].region).toBe("fencedCode");
	});

	test("marks frontmatter region including inner blank lines", () => {
		const doc = scanDocument("---\ntitle: x\n\ntags: []\n---\nbody");
		expect(doc.lines.slice(0, 5).every((l) => l.region === "frontmatter")).toBe(true);
		expect(doc.lines[5].region).toBe("none");
	});

	test("marks math region", () => {
		const doc = scanDocument("$$\na\n\nb\n$$\nafter");
		expect(doc.lines.slice(1, 4).every((l) => l.region === "math")).toBe(true);
	});

	test("single-line $$x$$ is not a region", () => {
		const doc = scanDocument("$$x$$\na\n\nb");
		expect(doc.lines[0].region).toBe("none");
		expect(doc.runs.length).toBe(1);
	});
});

describe("removeBlankLinesWithDetector", () => {
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
		expect(removeBlankLinesWithDetector(input)).toBe(
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
		expect(removeBlankLinesWithDetector("para\n\n\n| a | b |\n\nnext")).toBe(
			"para\n\n| a | b |\n\nnext"
		);
	});

	test("two adjacent tables stay separated", () => {
		const input = "| a | b |\n| - | - |\n| 1 | 2 |\n\n| c | d |\n| - | - |\n| 3 | 4 |";
		expect(removeBlankLinesWithDetector(input)).toBe(input);
	});

	test("table followed by dash line is not treated as repair seam", () => {
		// Removing the blank here would turn "|a|" + "---" into a setext H2.
		expect(removeBlankLinesWithDetector("| a |\n\n---\n\nx")).toBe("| a |\n\n---\n\nx");
	});

	test("keeps blank lines around headings", () => {
		expect(removeBlankLinesWithDetector("a\n\n## H\n\nb")).toBe("a\n\n## H\n\nb");
		expect(removeBlankLinesWithDetector("a\n\nH\n---\n\nb")).toBe("a\n\nH\n---\n\nb");
	});

	test("hr boundaries keep blank lines (prevents setext swallowing)", () => {
		// Any blank line adjacent to a thematic break is preserved, both so
		// "para + ---" cannot merge into a setext H2 and so a real setext
		// heading ("Title" + "---") is never split apart by deletion.
		expect(removeBlankLinesWithDetector("para\n\n---")).toBe("para\n\n---");
		expect(removeBlankLinesWithDetector("Title\n\n---")).toBe("Title\n\n---");
		expect(removeBlankLinesWithDetector("---\n\ntitle\n---")).toBe("---\n\ntitle\n---");
	});

	test("keeps blank line between paragraph and blockquote", () => {
		expect(removeBlankLinesWithDetector("para\n\n> quote")).toBe("para\n\n> quote");
	});

	test("merges paragraph continuation lines inside a blockquote", () => {
		expect(removeBlankLinesWithDetector("> a\n\n> b")).toBe("> a\n> b");
	});

	test("keeps blank lines around and inside a callout, collapses multiples", () => {
		expect(removeBlankLinesWithDetector("para\n\n\n> [!note]\n> body\n\n\nnext")).toBe(
			"para\n\n> [!note]\n> body\n\nnext"
		);
	});

	test("preserves blank lines inside fenced code", () => {
		const input = "```py\nx = 1\n\ny = 2\n```";
		expect(removeBlankLinesWithDetector(input)).toBe(input);
	});

	test("preserves blank lines inside frontmatter and keeps boundary", () => {
		expect(removeBlankLinesWithDetector("---\na: 1\n\nb: 2\n---\n\ntext\n\nmore")).toBe(
			"---\na: 1\n\nb: 2\n---\n\ntext\nmore"
		);
	});

	test("preserves blank lines inside $$ math", () => {
		const input = "$$\na\n\nb\n$$";
		expect(removeBlankLinesWithDetector(input)).toBe(input);
	});

	test("preserves blank lines inside %% comments", () => {
		const input = "%%\nnote\n\nmore\n%%";
		expect(removeBlankLinesWithDetector(input)).toBe(input);
	});

	test("leading and trailing blank-line runs are dropped", () => {
		expect(removeBlankLinesWithDetector("\n\nfoo\n\nbar\n\n")).toBe("foo\nbar");
	});

	test("document without blanks is unchanged", () => {
		expect(removeBlankLinesWithDetector("a\nb")).toBe("a\nb");
	});

	test("registered rules decide; unregistered runs are deleted", () => {
		const doc = scanDocument("para\n\nlist item\n\n- a\n- b");
		// No built-in rule covers plain text or list items.
		expect(doc.runs.every((r) => !r.useful)).toBe(true);
		expect(removeBlankLinesWithDetector("para\n\nfoo\n\nbar")).toBe("para\nfoo\nbar");
	});

	test("legacy path drops every blank line when disabled", () => {
		expect(removeBlankLines("a\n\n| h |\n| - |\n\nb", false)).toBe("a\n| h |\n| - |\nb");
	});
});
