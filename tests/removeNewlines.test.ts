import {describe, expect, test} from '@jest/globals';
import { removeNewlines, removeBlankLines } from "../utils";

describe("removeNewlines", () => {
    test("removes newlines and preserves spaces", () => {
        const input = "This is a test.\nThis is another line.";
        const expected = "This is a test. This is another line.";
        expect(removeNewlines(input, false, false)).toBe(expected);
    });

    test("removes newlines and fixes whitespace", () => {
        const input = "This  is   a   test.\n\nAnother  line.";
        const expected = "This is a test. Another line.";
        expect(removeNewlines(input, false, true)).toBe(expected);
    });

    test("removes hyphenated line breaks", () => {
        const input = "This is a hyphen-\nbroken word.";
        const expected = "This is a hyphenbroken word.";
        expect(removeNewlines(input, true, false)).toBe(expected);
    });

    test("removes hyphenated line breaks and fixes whitespace", () => {
        const input = "A  hyphen-\nbroken  word.";
        const expected = "A hyphenbroken word.";
        expect(removeNewlines(input, true, true)).toBe(expected);
    });
});

describe("removeBlankLines", () => {
    test("removes multiple blank lines", () => {
        const input = "Line 1\n\n\nLine 2\n\nLine 3";
        const expected = "Line 1\nLine 2\nLine 3";
        expect(removeBlankLines(input)).toBe(expected);
    });

    test("handles text without blank lines", () => {
        const input = "Line 1\nLine 2\nLine 3";
        const expected = "Line 1\nLine 2\nLine 3";
        expect(removeBlankLines(input)).toBe(expected);
    });

    test("preserves single newlines", () => {
        const input = "Line 1\n\nLine 2\n\n\nLine 3";
        const expected = "Line 1\nLine 2\nLine 3";
        expect(removeBlankLines(input)).toBe(expected);
    });
});
