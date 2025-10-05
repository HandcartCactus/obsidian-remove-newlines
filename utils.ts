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

const removeBlankLines = function(text: string): string {
    // text = text.replace(/[\r\n]+([\s]*[\r\n]+)+/g, "\r\n");
    text = text
    .split(/\r?\n/)
    .filter(line => line.trim() !== "")
    .join("\n");
    return text;
}

export { removeNewlines, removeBlankLines };