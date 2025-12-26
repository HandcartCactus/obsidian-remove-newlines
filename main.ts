// https://x.com/LegacyRussell/status/1366584145271488522
import {
	App,
	Editor,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

import { removeNewlines, removeBlankLines, clipboardItemToString } from "utils";

interface RemoveNewlineSettings {
	fixWhitespace: boolean;
	fixHyphenation: boolean;
}

const DEFAULT_SETTINGS: RemoveNewlineSettings = {
	fixWhitespace: true,
	fixHyphenation: true,
};

export default class RemoveNewline extends Plugin {
	settings: RemoveNewlineSettings;

	async onload() {
		await this.loadSettings();

		// Command / Remove newlines / Selection
		this.addCommand({
			id: "remove-newlines-from-selection",
			name: "Remove newlines from selection",
			editorCheckCallback: (checking, editor, ctx) => {
				if (editor.somethingSelected()) {
					if (!checking) {
						if (typeof this.removeNewlinesFromSelection !== "function") {
							console.error("removeNewlinesFromSelection is not defined or not a function.");
							return false;
						}
						this.removeNewlinesFromSelection(editor);
					}
					return true;
				}
				return false;
			},
		});
		// Command / Remove newlines / Paste
		this.addCommand({
			id: "paste-without-newlines",
			name: "Paste without newlines",
			editorCallback: (editor) => {
				if (typeof this.pasteWithoutNewlines !== "function") {
					console.error("pasteWithoutNewlines is not defined or not a function.");
					return;
				}
				void this.pasteWithoutNewlines(editor);
			},
		});

		// Context menu / Remove newlines / Selection
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				menu.addItem((item) => {
					item.setTitle("Remove newlines from selection")
						.setIcon("square-bottom-dashed-scissors")
						.setDisabled(!editor.somethingSelected())
						.onClick(() => {
							this.removeNewlinesFromSelection(editor);
						});
				});
			})
		);

		// Context menu  / Remove newlines  / Paste
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				menu.addItem((item) => {
					item.setTitle("Paste without newlines")
						.setIcon("clipboard-paste")
						//.setDisabled(this.clipboardHasText())
						.onClick(() => {
							void this.pasteWithoutNewlines(editor);
						});
				});
			})
		);

		// Context menu / Remove Blank Lines / Selection
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				menu.addItem((item)  => {
					item.setTitle("Remove blank lines from selection")
						.setIcon("square-bottom-dashed-scissors")
						.setDisabled(!editor.somethingSelected())
						.onClick(() => this.removeBlankLinesFromSelection(editor));
				});
			})
		);

		// Context menu / Remove Blank Lines / Paste
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				menu.addItem((item) => {
					item.setTitle("Paste without blank lines")
						.setIcon("clipboard-paste")
						//.setDisabled(this.clipboardHasText())
						.onClick(() => {
							void this.pasteWithoutBlankLines(editor);
						});
				});
			})
		);

		// Command / Remove Blank Lines / Paste
		this.addCommand({
			id: "paste-without-blank-lines",
			name: "Paste without blank lines",
			editorCallback: (editor) => {
				void this.pasteWithoutBlankLines(editor);
			},
		});

		// Command  / Remove Blank Lines  / Selection
		this.addCommand({
			id: "remove-blank-lines-from-selection",
			name: "Remove blank lines from selection",
			editorCheckCallback: (checking, editor, ctx) => {
				if (editor.somethingSelected()) {
					if (!checking) {
						this.removeBlankLinesFromSelection(editor);
					}
					return true;
				}
				return false;
			},
		});

		this.addSettingTab(new RemoveNewlineSettingsTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}



	// cleaning methods are wrapped so we can pass settings as params
	removeNewlines = (text: string): string => {
		return removeNewlines(text, this.settings.fixHyphenation, this.settings.fixWhitespace);
	}

	removeBlankLines = (text: string): string => {
		return removeBlankLines(text);
	}



	transformSelection = (editor: Editor, transformFn: (text: string) => string): void =>  {
		let selection = editor.getSelection();

		selection = transformFn(selection);

		editor.replaceSelection(selection);
	}

	removeNewlinesFromSelection = (editor: Editor): void =>  {
		this.transformSelection(editor, this.removeNewlines);
	}

	removeBlankLinesFromSelection = (editor: Editor): void =>  {
		this.transformSelection(editor, this.removeBlankLines);
	}




	pasteTransformed = async (editor: Editor, transformFn: (text: string) => string): Promise<void> => {
		// used to be .readText() but it was stripping formatting from html
		const clipboardItems = await navigator.clipboard.read();

		// AFAICT there's only one item in the ClipboardItems array. I think.
		// clipboardItemToString will preserve HTML formatting, .readText() will not.
		const textToTransform = await clipboardItemToString(clipboardItems[0])

		if (!textToTransform) return;

		const transformedText = transformFn(textToTransform);

		editor.replaceSelection(transformedText);
	}

	pasteWithoutNewlines = async (editor: Editor): Promise<void> => {
		this.pasteTransformed(editor, this.removeNewlines);
	}

	pasteWithoutBlankLines = async (editor: Editor): Promise<void> => {
		this.pasteTransformed(editor, this.removeBlankLines);
	}
}

class RemoveNewlineSettingsTab extends PluginSettingTab {
	plugin: RemoveNewline;

	constructor(app: App, plugin: RemoveNewline) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Fix whitespace when removing newlines")
			.setDesc(
				"Remove two or more whitespace characters in a row from the selection after removing the newlines. (Recommended)"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fixWhitespace)
					.onChange(async (value) => {
						this.plugin.settings.fixWhitespace = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Fix hyphenation when removing newlines")
			.setDesc(
				"If on, removes hyphens from the end of a line and also does not put a space where the newline was."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fixHyphenation)
					.onChange(async (value) => {
						this.plugin.settings.fixHyphenation = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
