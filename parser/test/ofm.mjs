import assert from "node:assert/strict";
import test from "node:test";
import { parseOfm, stringifyOfm } from "../node_modules/.cache/test/parse-ofm-strict.mjs";
import { findBlankLineRepairs } from "../node_modules/.cache/test/find-blank-line-repairs.mjs";

function nodes(node) {
    return [node, ...(node.children ?? []).flatMap(nodes)];
}

test("standalone and inline math retain their delimiters after value edits", () => {
    const tree = parseOfm("$$X^2$$\n$X^2$");
    const [display, inline] = nodes(tree).filter(node => node.type === "inlineMath");
    assert.equal(display.data.display, true);
    assert.ok(!inline.data.display);
    display.value = "y";
    inline.value = "z";
    assert.equal(stringifyOfm(tree), "$$y$$\n$z$");
});

test("multiline comments preserve blank lines and offsets", () => {
    const source = "%%one\n\ntwo%%\n\n# Next";
    const tree = parseOfm(source);
    const [comment, heading] = tree.children;
    assert.equal(comment.type, "comment");
    assert.equal(comment.value, "one\n\ntwo");
    assert.equal(heading.position.start.offset, source.indexOf("#"));
    assert.equal(stringifyOfm(tree), source);
});

test("only terminal block IDs in prose are definitions", () => {
    const source = "😀 **text** ^example-1\n\n> quote\n\n^quote";
    const tree = parseOfm(source);
    const ids = nodes(tree).filter(node => node.type === "obsidianBlockId");
    assert.deepEqual(ids.map(n => n.value), ["example-1", "quote"]);
    for (const n of ids) assert.equal(source.slice(n.position.start.offset, n.position.end.offset), "^" + n.value);
    assert.equal(stringifyOfm(tree), source);
    for (const literal of ["x^2", "[^id]", "a ^mid word", "a \\^escaped", "`^code`", "%%^hidden%%", "[[Page#^id]]"]) {
        assert.ok(!nodes(parseOfm(literal)).some(n => n.type === "obsidianBlockId"), literal);
    }
});

test("Markdown inside inline HTML stays literal", () => {
    const tree = parseOfm("see <span>**bold** [[link]]</span>");
    assert.equal(nodes(tree).find(n => n.type === "html").value, "<span>**bold** [[link]]</span>");
});

test("repair detector ignores plain soft breaks and identifies both broken table gaps", () => {
    assert.deepEqual(findBlankLineRepairs("one\n\ntwo"), []);
    const repairs = findBlankLineRepairs("| a | b |\n\n|---|---|\n\n| x | y |");
    assert.deepEqual(repairs.map(r => [r.feature, r.blankLines]), [["table", [2]], ["table", [4]]]);
});
