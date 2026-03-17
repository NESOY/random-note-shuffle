import { AbstractInputSuggest, App, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

type SelectionMode = 'random' | 'weighted-random';

interface RandomPageSettings {
	selectionMode: SelectionMode;
	weightProperty: string;
	weightIntensity: number;
	excludedFolders: string[];
}

const DEFAULT_SETTINGS: RandomPageSettings = {
	selectionMode: 'random',
	weightProperty: 'updated',
	weightIntensity: 50,
	excludedFolders: [],
};

const SELECTION_MODE_OPTIONS: Record<SelectionMode, string> = {
	'random': 'Random',
	'weighted-random': 'Weighted random (spaced repetition)',
};

class PropertySuggest extends AbstractInputSuggest<string> {
	private properties: string[];

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.properties = this.getAllProperties();
	}

	private getAllProperties(): string[] {
		const props = new Set<string>();
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter) {
				for (const key of Object.keys(cache.frontmatter)) {
					if (key !== 'position') {
						props.add(key);
					}
				}
			}
		}
		return [...props].sort();
	}

	getSuggestions(query: string): string[] {
		const lower = query.toLowerCase();
		return this.properties.filter((p) => p.toLowerCase().includes(lower));
	}

	renderSuggestion(prop: string, el: HTMLElement): void {
		el.setText(prop);
	}

	selectSuggestion(prop: string): void {
		this.setValue(prop);
		this.close();
	}
}

class FolderSuggest extends AbstractInputSuggest<string> {
	private folders: string[];

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.folders = this.getAllFolders();
	}

	private getAllFolders(): string[] {
		const folders: string[] = [];
		this.app.vault.getAllLoadedFiles().forEach((file) => {
			if (file instanceof TFolder && file.path !== '/') {
				folders.push(file.path);
			}
		});
		return folders.sort();
	}

	getSuggestions(query: string): string[] {
		const lower = query.toLowerCase();
		return this.folders.filter((f) => f.toLowerCase().includes(lower));
	}

	renderSuggestion(folder: string, el: HTMLElement): void {
		el.setText(folder);
	}

	selectSuggestion(folder: string): void {
		this.setValue(folder);
		this.close();
	}
}

export default class RandomPagePlugin extends Plugin {
	settings: RandomPageSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('dice', 'Open random page', () => {
			this.openRandomPage();
		});

		this.addCommand({
			id: 'open-random-page',
			name: 'Open random page',
			callback: () => {
				this.openRandomPage();
			},
		});

		this.addSettingTab(new RandomPageSettingTab(this.app, this));
	}

	openRandomPage() {
		const excluded = this.settings.excludedFolders;

		const files = this.app.vault.getMarkdownFiles().filter((file) => {
			return !excluded.some((folder) => file.path.startsWith(folder + '/'));
		});

		if (files.length === 0) {
			new Notice('No markdown files found.');
			return;
		}

		let selected: TFile;
		switch (this.settings.selectionMode) {
			case 'weighted-random': {
				selected = this.selectWeightedRandom(files);
				break;
			}
			default:
				selected = files[Math.floor(Math.random() * files.length)];
		}

		this.app.workspace.openLinkText(selected.path, '', false);
	}

	private selectWeightedRandom(files: TFile[]): TFile {
		const now = Date.now();
		const prop = this.settings.weightProperty;
		const DAY_MS = 86400000;

		const weighted = files.map((file) => {
			const cache = this.app.metadataCache.getFileCache(file);
			const lastReviewed = cache?.frontmatter?.[prop];

			let daysSince: number;
			if (!lastReviewed) {
				// Never reviewed → maximum weight
				daysSince = 365;
			} else {
				const reviewedTime = new Date(lastReviewed).getTime();
				daysSince = Math.max(1, Math.floor((now - reviewedTime) / DAY_MS));
			}

			// Exponent from 0.5 (intensity=1, nearly flat) to 4 (intensity=100, steep)
			const exponent = 0.5 + (this.settings.weightIntensity - 1) * (3.5 / 99);
			const weight = Math.pow(daysSince, exponent);
			return { file, weight };
		});

		const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
		let roll = Math.random() * totalWeight;

		for (const entry of weighted) {
			roll -= entry.weight;
			if (roll <= 0) {
				return entry.file;
			}
		}

		return weighted[weighted.length - 1].file;
	}


	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// Migrate from old comma-separated string format
		if (data && typeof data.excludedFolders === 'string') {
			this.settings.excludedFolders = data.excludedFolders
				.split(',')
				.map((f: string) => f.trim())
				.filter((f: string) => f.length > 0);
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class RandomPageSettingTab extends PluginSettingTab {
	plugin: RandomPagePlugin;

	constructor(app: App, plugin: RandomPagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Selection mode
		new Setting(containerEl)
			.setName('Selection mode')
			.setDesc('How to pick the next page.')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(SELECTION_MODE_OPTIONS)
					.setValue(this.plugin.settings.selectionMode)
					.onChange(async (value) => {
						this.plugin.settings.selectionMode = value as SelectionMode;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// Weight property & intensity (only shown when weighted-random mode)
		if (this.plugin.settings.selectionMode === 'weighted-random') {
			new Setting(containerEl)
				.setName('Weight property')
				.setDesc('Frontmatter date property to calculate weight. Older values have higher chance of being selected.')
				.addText((text) => {
					text
						.setPlaceholder('e.g. updated')
						.setValue(this.plugin.settings.weightProperty)
						.onChange(async (value) => {
							this.plugin.settings.weightProperty = value.trim();
							await this.plugin.saveSettings();
						});
					new PropertySuggest(this.app, text.inputEl);
				});

			new Setting(containerEl)
				.setName('Weight intensity')
				.setDesc('1 = nearly equal chance, 100 = strongly favor older notes.')
				.addText((text) =>
					text
						.setValue(String(this.plugin.settings.weightIntensity))
						.onChange(async (value) => {
							const num = Math.min(100, Math.max(1, parseInt(value) || 50));
							this.plugin.settings.weightIntensity = num;
							await this.plugin.saveSettings();
						})
				);
		}

		// Add folder input
		new Setting(containerEl)
			.setName('Exclude folder')
			.setDesc('Select a folder to exclude from random page selection.')
			.addText((text) => {
				text.setPlaceholder('Type folder name...');
				const suggest = new FolderSuggest(this.app, text.inputEl);

				const addFolder = async () => {
					const value = text.getValue().trim();
					if (value && !this.plugin.settings.excludedFolders.includes(value)) {
						this.plugin.settings.excludedFolders.push(value);
						await this.plugin.saveSettings();
						text.setValue('');
						this.renderTags(tagsContainer);
					}
				};

				suggest.onSelect(async () => {
					await addFolder();
				});

				text.inputEl.addEventListener('keydown', async (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						await addFolder();
					}
				});
			});

		// Tags display inside the setting control area (right side)
		const tagsContainer = containerEl.createDiv({ cls: 'random-page-tags' });
		this.renderTags(tagsContainer);
	}

	private renderTags(container: HTMLElement): void {
		container.empty();

		if (this.plugin.settings.excludedFolders.length === 0) {
			container.createSpan({
				text: 'No excluded folders.',
				cls: 'random-page-tags-empty',
			});
			return;
		}

		for (const folder of this.plugin.settings.excludedFolders) {
			const tag = container.createSpan({ cls: 'random-page-tag' });
			tag.createSpan({ text: folder });
			const removeBtn = tag.createSpan({ cls: 'random-page-tag-remove', text: '\u00d7' });
			removeBtn.addEventListener('click', async () => {
				this.plugin.settings.excludedFolders =
					this.plugin.settings.excludedFolders.filter((f) => f !== folder);
				await this.plugin.saveSettings();
				this.renderTags(container);
			});
		}
	}
}
