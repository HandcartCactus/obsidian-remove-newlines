jest.mock("obsidian", () => ({
	htmlToMarkdown: (html: string) => html,
}));

import { clipboardItemToString } from "../utils";

const item = (parts: Record<string, string>) =>
	({
		types: Object.keys(parts),
		getType: async (type: string) => ({ text: async () => parts[type] }),
	} as unknown as ClipboardItem);

describe("clipboardItemToString", () => {
	test("returns the plain text when HTML only adds whitespace", () => {
		const plain = "aaa\n1. bbb\n2. ccc\ndddd";
		const html = "aaa\n1. bbb\n2. ccc\n    dddd";
		return expect(clipboardItemToString(item({ "text/html": html, "text/plain": plain }))).resolves.toBe(plain);
	});

	test("keeps the HTML conversion when it carries formatting", () => {
		const html = "aaa **bold**";
		return expect(clipboardItemToString(item({ "text/html": html, "text/plain": "aaa bold" }))).resolves.toBe(html);
	});

	test("falls back to the HTML conversion without plain text", () => {
		return expect(clipboardItemToString(item({ "text/html": "**x**" }))).resolves.toBe("**x**");
	});

	test("falls back to plain text without HTML", () => {
		return expect(clipboardItemToString(item({ "text/plain": "x" }))).resolves.toBe("x");
	});

	test("returns null for other clipboard types", () => {
		return expect(clipboardItemToString(item({ "image/png": "" }))).resolves.toBeNull();
	});
});
