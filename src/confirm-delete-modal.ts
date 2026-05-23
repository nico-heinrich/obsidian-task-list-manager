import { App, ButtonComponent, Modal, Platform } from "obsidian";

const MOBILE_MODAL_CLOSE_MS = 300;

function afterModalCloseMobile(work: () => void): void {
	window.setTimeout(work, MOBILE_MODAL_CLOSE_MS);
}

export type ConfirmDeletePreview = string | ((container: HTMLElement) => void);

export class ConfirmDeleteModal extends Modal {
	private readonly title: string;
	private readonly preview: ConfirmDeletePreview;
	private readonly resolvePromise: (confirmed: boolean) => void;
	private settled = false;

	constructor(
		app: App,
		title: string,
		preview: ConfirmDeletePreview,
		resolvePromise: (confirmed: boolean) => void,
	) {
		super(app);
		this.title = title;
		this.preview = preview;
		this.resolvePromise = resolvePromise;
	}

	private settle(confirmed: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolvePromise(confirmed);
	}

	onOpen(): void {
		this.modalEl.addClass("tlm-confirm-delete-modal");
		this.setTitle(this.title);
		const { contentEl } = this;
		const previewEl = contentEl.createDiv({ cls: "tlm-delete-preview" });
		if (typeof this.preview === "function") {
			this.preview(previewEl);
		} else {
			previewEl.setText(this.preview);
		}

		const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
		new ButtonComponent(btnRow).setButtonText("Delete").setWarning().onClick(() => {
			this.settle(true);
			this.close();
		});
		new ButtonComponent(btnRow)
			.setButtonText("Cancel")
			.onClick(() => {
				this.settle(false);
				this.close();
			});
	}

	onClose(): void {
		this.settle(false);
		const { contentEl } = this;
		const empty = (): void => {
			contentEl.empty();
		};
		if (Platform.isMobile) {
			afterModalCloseMobile(empty);
		} else {
			empty();
		}
	}
}

export function confirmDelete(app: App, title: string, preview: ConfirmDeletePreview): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new ConfirmDeleteModal(app, title, preview, resolve);
		modal.open();
	});
}
