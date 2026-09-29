import { describe, expect, it } from "vitest";
import { DocumentSession } from "../session";

const dirty = { dirty: true, name: "Tree" };
const clean = { dirty: false, name: "Tree" };

describe("DocumentSession", () => {
  it("only asks about closing when there is unsaved work", () => {
    const session = new DocumentSession();
    expect(session.needsClosePrompt()).toBe(false);
    session.update(dirty);
    expect(session.needsClosePrompt()).toBe(true);
    session.update(clean);
    expect(session.needsClosePrompt()).toBe(false);
  });

  it("stops asking once the user has decided", () => {
    const session = new DocumentSession();
    session.update(dirty);
    session.approveClose();
    expect(session.needsClosePrompt()).toBe(false);
  });

  it("guards the next window again after the previous one was closed", () => {
    // macOS keeps the app alive with no window. The answer given for the old
    // document must not carry over to whatever is opened next.
    const session = new DocumentSession();
    session.update(dirty);
    session.approveClose();
    session.reset();

    session.update(dirty);
    expect(session.needsClosePrompt()).toBe(true);
  });

  it("forgets the old document's state on reset", () => {
    const session = new DocumentSession();
    session.update({ dirty: true, name: "Old", filePath: "/old.ftree" });
    session.reset();
    expect(session.document).toEqual({ dirty: false, name: "" });
  });

  it("guards again if new edits arrive after an approval was given", () => {
    const session = new DocumentSession();
    session.update(dirty);
    session.approveClose();
    session.update({ dirty: false, name: "Tree" });
    session.update(dirty);
    expect(session.needsClosePrompt()).toBe(true);
  });

  it("hands a queued launch file over exactly once", () => {
    const session = new DocumentSession();
    expect(session.takeQueuedFile()).toBeUndefined();
    session.queueFile("/a.ftree");
    expect(session.takeQueuedFile()).toBe("/a.ftree");
    expect(session.takeQueuedFile()).toBeUndefined();
  });

  it("keeps only the most recently queued file", () => {
    const session = new DocumentSession();
    session.queueFile("/first.ftree");
    session.queueFile("/second.ftree");
    expect(session.takeQueuedFile()).toBe("/second.ftree");
  });
});
