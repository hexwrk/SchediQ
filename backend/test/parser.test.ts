import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ruleParse } from "../src/controllers/ai.controller";

// Offline (rule) parser. Wed 28 Oct 2026, 14:07 local as the fixed "now".
const NOW = new Date(2026, 9, 28, 14, 7, 0, 0);
const parse = (text: string) => ruleParse(text, [], NOW, "rule");
const localDay = (iso: string | null) => (iso ? new Date(iso).toDateString() : null);

describe("rule parser", () => {
  it("weekday deadlines resolve to the next occurrence", () => {
    assert.equal(localDay(parse("ASR homework 1 hour due Tuesday").deadline), new Date(2026, 10, 3).toDateString());
    assert.equal(localDay(parse("essay by fri").deadline), new Date(2026, 9, 30).toDateString());
    // Today is Wednesday: a bare weekday that is today means next week.
    assert.equal(localDay(parse("lab due wednesday").deadline), new Date(2026, 10, 4).toDateString());
    assert.equal(localDay(parse("quiz due thurs").deadline), new Date(2026, 9, 29).toDateString());
  });

  it("handles a weekday glued to 'due' and cleans the title", () => {
    const p = parse("ASR homework, 2 hours, dueTuesday");
    assert.equal(p.title, "ASR homework");
    assert.equal(p.durationMin, 120);
    assert.equal(localDay(p.deadline), new Date(2026, 10, 3).toDateString());
  });

  it("does not mistake words containing weekday letters for deadlines", () => {
    assert.equal(parse("monitor the network sunny wedding").deadline, null);
    assert.equal(parse("practise the duet 30 mins").title, "Practise the duet");
  });

  it("still parses month dates, durations and priority", () => {
    const p = parse("Study subnetting for 2 hours, urgent, due 30 Oct");
    assert.equal(p.title, "Study subnetting");
    assert.equal(p.durationMin, 120);
    assert.equal(p.priority, "HIGH");
    assert.equal(localDay(p.deadline), new Date(2026, 9, 30).toDateString());
  });
});
