import { describe, expect, test } from "@jest/globals";
import { removeNewlines } from "../utils";

// Issue #13 concerns the remove-newlines operation: join ordinary text lines
// while retaining selected spacing around Markdown blocks. Issue #16's
// remove-blank-lines examples live in removeUsefulBlankLines.test.ts.
// Keep these pending until the smart path and its options are designed, then
// remove `.skip` and bind each group to the corresponding configuration.
// Disable unrelated hyphenation/whitespace cleanup in these spacing examples.
describe.skip("removeNewlines: smart spacing (issue #13)", () => {
    describe("spacing before headings", () => {
        test.each(["#", "##", "###", "####", "#####", "######"])(
            "preserves a blank line before a %s heading while joining prose",
            (marker) => {
                const input = `First line\ncontinued text\n\n${marker} Heading`;
                const expected = `First line continued text\n\n${marker} Heading`;
                const actual = removeNewlines(input, false, false);
                expect(actual).toBe(expected);
            }
        );
    });

    describe("optional spacing after headings — enabled", () => {
        test("preserves a blank line after a heading while joining following prose", () => {
            const input = "## Heading\n\nFirst line\ncontinued text";
            const expected = "## Heading\n\nFirst line continued text";
            const actual = removeNewlines(input, false, false);
            expect(actual).toBe(expected);
        });

        test("preserves blank lines on both sides of a heading", () => {
            const input = "Intro line\ncontinued intro\n\n## Heading\n\nBody line\ncontinued body";
            const expected = "Intro line continued intro\n\n## Heading\n\nBody line continued body";
            const actual = removeNewlines(input, false, false);
            expect(actual).toBe(expected);
        });
    });

    describe("optional spacing before lists — enabled", () => {
        test.each([
            ["unordered", "- First item\n- Second item"],
            ["ordered", "1. First item\n2. Second item"],
            ["task", "- [ ] First item\n- [x] Second item"],
        ])("preserves a blank line before a %s list", (_kind, list) => {
            const input = `Intro line\ncontinued intro\n\n${list}`;
            const expected = `Intro line continued intro\n\n${list}`;
            const actual = removeNewlines(input, false, false);
            expect(actual).toBe(expected);
        });
    });

    describe("optional spacing after lists — enabled", () => {
        test.each([
            ["unordered", "- First item\n- Second item"],
            ["ordered", "1. First item\n2. Second item"],
            ["task", "- [ ] First item\n- [x] Second item"],
        ])("preserves a blank line after a %s list", (_kind, list) => {
            const input = `${list}\n\nBody line\ncontinued body`;
            const expected = `${list}\n\nBody line continued body`;
            const actual = removeNewlines(input, false, false);
            expect(actual).toBe(expected);
        });
    });

    describe("optional spacing around thematic breaks — enabled", () => {
        test("preserves a blank line before a thematic break", () => {
            const input = "Intro line\ncontinued intro\n\n---";
            const expected = "Intro line continued intro\n\n---";
            const actual = removeNewlines(input, false, false);
            expect(actual).toBe(expected);
        });

        test("preserves a blank line after a thematic break", () => {
            // Preceding content keeps this from being opening frontmatter.
            const input = "Intro\n\n---\n\nBody line\ncontinued body";
            const expected = "Intro\n\n---\n\nBody line continued body";
            const actual = removeNewlines(input, false, false);
            expect(actual).toBe(expected);
        });
    });
});

// The issue leaves defaults and disabled-option behavior open. In particular,
// decide whether disabling spacing leaves a structural newline or joins text
// across that boundary before writing exact output assertions or an options API.
describe("smart spacing — unresolved option behavior (issue #13)", () => {
    test.todo("choose defaults for optional spacing after headings, around lists, and around thematic breaks");
    test.todo("define output when spacing after headings is disabled");
    test.todo("define output when spacing before or after lists is disabled");
    test.todo("define output when spacing around thematic breaks is disabled");
});
