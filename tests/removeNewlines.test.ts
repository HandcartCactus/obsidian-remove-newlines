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
        const input = "This is line 1\n\n\nAnother line (2)";
        const expected = "This is line 1\nAnother line (2)";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });

    test("removes variable blank lines", () => {
        const input = "This is line 1\n\n\nAnother line (2)\n\nA third and final line (3)";
        const expected = "This is line 1\nAnother line (2)\nA third and final line (3)";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });

    test("handles text without blank lines", () => {
        const input = "This is line 1\nAnother line (2)\nA third and final line (3)";
        const expected = "This is line 1\nAnother line (2)\nA third and final line (3)";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });

    test("tabulation doesnt break it", () => {
        const input = "\tThis is line 1\n\t\n\tAnother line (2)\n\t\n\t\n\tA third and final line (3)";
        const expected = "\tThis is line 1\n\tAnother line (2)\n\tA third and final line (3)";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });

    test("space tabulation doesnt break it", () => {
        const input = "    This is line 1\n    \n    Another line (2)\n    \n    \n    A third and final line (3)";
        const expected = "    This is line 1\n    Another line (2)\n    A third and final line (3)";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });

    test("space list tabulation doesnt break it", () => {
        const input = " + This is line 1\n    \n + Another line (2)";
        const expected = " + This is line 1\n + Another line (2)";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });

    test("space list tabulation doesnt break it 2", () => {
        const input = "\n+ abc\n    \n+ def";
        const expected = "+ abc\n+ def";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });

    test("space list tabulation doesnt break it 3", () => {
        const input = "+ abc\n    \n+ def";
        const expected = "+ abc\n+ def";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });

    test("cleans up tables", () => {
        const input = "| a | b |\n\n| - | - |\n\t\n| c | d |";
        const expected = "| a | b |\n| - | - |\n| c | d |";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });

    test("cleans up tabbed tables", () => {
        const input = "\t| a | b |\n\t\n\t| - | - |\n\t\t\n\t| c | d |";
        const expected = "\t| a | b |\n\t| - | - |\n\t| c | d |";
        const actual = removeBlankLines(input);
        expect(actual).toBe(expected);
    });
});
