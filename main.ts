// https://x.com/LegacyRussell/status/1366584145271488522
import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

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

		this.addCommand({
			id: "remove-newlines-from-selection",
			name: "Remove newlines from selection",
			editorCheckCallback(checking, editor, ctx) {
				if (editor.somethingSelected()) {
					if (!checking) {
						this.removeNewlinesFromSelection(editor);
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "paste-without-newlines",
			name: "Paste without newlines",
			editorCallback(editor) {
				this.pasteWithoutNewlines(editor);
			},
		});

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

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				menu.addItem((item) => {
					item.setTitle("Paste without newlines")
						.setIcon("clipboard-paste")
						//.setDisabled(this.clipboardHasText())
						.onClick(() => {
							this.pasteWithoutNewlines(editor);
						});
				});
			})
		);

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

	removeNewlines(text: string) {
		if (this.settings.fixHyphenation) {
			text = text.replace(/-\n/g, "");
		}

		text = text.replace(/\n/g, " ");

		if (this.settings.fixWhitespace) {
			text = text.replace(/\s{2,}/g, " ");
		}

		return text;
	}

	removeNewlinesFromSelection(editor: Editor) {
		let selection = editor.getSelection();

		selection = this.removeNewlines(selection);

		editor.replaceSelection(selection);
	}

	async pasteWithoutNewlines(editor: Editor) {
		let selection = await navigator.clipboard.readText();

		selection = this.removeNewlines(selection);

		editor.replaceSelection(selection);
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

		new Setting(containerEl).setName('Remove Newlines').setHeading();

		//containerEl.createEl("h2", { text: "Remove Newlines From Selection" });

		new Setting(containerEl)
			.setName("Fix whitespace")
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
			.setName("Fix hyphenation")
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
