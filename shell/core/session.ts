import type { DocumentState } from "../../shared/desktop";

const CLEAN: DocumentState = { dirty: false, name: "" };

/**
 * What the shell knows about the open document: whether it has unsaved changes,
 * whether the user has already answered the close prompt, and a project the OS
 * asked us to open before the window was ready.
 *
 * It belongs to a window, not to the process. On macOS the app outlives its
 * window, so `reset` runs when the window closes; otherwise the answer given
 * for the old document would silently apply to the next one.
 */
export class DocumentSession {
  private state: DocumentState = CLEAN;
  private closeApproved = false;
  private queuedFile: string | undefined;

  get document(): DocumentState {
    return this.state;
  }

  update(state: DocumentState): void {
    this.state = state;
    // New unsaved work after an approved close (a cancelled close, say) must
    // be guarded again.
    if (state.dirty) this.closeApproved = false;
  }

  /** True when closing the window would discard work the user has not been asked about. */
  needsClosePrompt(): boolean {
    return this.state.dirty && !this.closeApproved;
  }

  approveClose(): void {
    this.closeApproved = true;
  }

  reset(): void {
    this.state = CLEAN;
    this.closeApproved = false;
  }

  queueFile(path: string): void {
    this.queuedFile = path;
  }

  takeQueuedFile(): string | undefined {
    const path = this.queuedFile;
    this.queuedFile = undefined;
    return path;
  }
}
