import { describe, expect, test } from "@jest/globals";
import { removeBlankLines } from "../utils";

// Behavior examples supplied for issue #16. Keep these pending until the
// syntax-aware removal path is chosen; remove `.skip` and bind that path then.
// These examples record the proposal, including policy choices still to review
// (for example, treating a lone pipe row as a table boundary).

// The attachment also proposed scanner internals. Record those separately
// without importing a nonexistent detector or committing to its data model.
describe("useful blank line detection — proposed scanner checks", () => {
    test.todo("classifies table rows, delimiters, and fence boundaries");
    test.todo("marks frontmatter including inner blank lines");
    test.todo("marks multiline display math including inner blank lines");
    test.todo("does not treat single-line display math as a multiline region");
});

describe.skip("removeBlankLines — useful blank lines (issue #16)", () => {
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
        expect(removeBlankLines("para\n\n\n| a | b |\n\nnext")).toBe(
            "para\n\n| a | b |\n\nnext"
        );
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
        // Any blank line adjacent to a thematic break is preserved, both so
        // "para + ---" cannot merge into a setext H2 and so a real setext
        // heading ("Title" + "---") is never split apart by deletion.
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

    test("leading and trailing blank-line runs are dropped", () => {
        expect(removeBlankLines("\n\nfoo\n\nbar\n\n")).toBe("foo\nbar");
    });

    test("document without blanks is unchanged", () => {
        expect(removeBlankLines("a\nb")).toBe("a\nb");
    });

    test("removes blank lines between plain paragraphs and before lists", () => {
        const input = "para\n\nlist item\n\n- a\n- b";
        const expected = "para\nlist item\n- a\n- b";
        expect(removeBlankLines(input)).toBe(expected);
    });
});

// The attachment's disabled-detector case describes the existing behavior.
// There is no detector flag yet, so exercise the current one-argument API.
describe("removeBlankLines — current behavior", () => {
    test("drops every blank line", () => {
        const input = "a\n\n| h |\n| - |\n\nb";
        const expected = "a\n| h |\n| - |\nb";
        expect(removeBlankLines(input)).toBe(expected);
    });
});
