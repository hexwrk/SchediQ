import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  passwordStrength,
  validateEmail,
  validateIntInRange,
  validateName,
  validatePassword,
  validateTimeWindow,
} from "../../shared/validation";

// These are the SAME functions the frontend forms import, so passing here means
// client and server reject exactly the same input.

describe("shared email validator", () => {
  const accept = ["tristan@gmail.com", "first.last+tag@uni.ac.za", "a1@mail.co.uk", "Name@Example.ORG"];
  const reject: [string, string][] = [
    ["yd@g.com", "1-char registrable label"],
    ["a@b.c", "1-char TLD"],
    ["", "empty"],
    ["no-at-sign.com", "no @"],
    ["two@@gmail.com", "two @"],
    ["@gmail.com", "empty local part"],
    ["user@", "empty domain"],
    ["user@gmail", "no TLD"],
    ["user@gmail.c0m", "numeric TLD"],
    [".user@gmail.com", "leading dot"],
    ["us..er@gmail.com", "double dot"],
    ["user@-gmail.com", "label starts with hyphen"],
    ["user name@gmail.com", "space"],
  ];
  for (const e of accept) it(`accepts ${e}`, () => assert.equal(validateEmail(e), null));
  for (const [e, why] of reject) it(`rejects "${e}" (${why})`, () => assert.notEqual(validateEmail(e), null));
});

describe("shared password validator", () => {
  it("rejects short, letter-only, digit-only and over-72", () => {
    assert.notEqual(validatePassword("abc123"), null);
    assert.notEqual(validatePassword("abcdefgh"), null);
    assert.notEqual(validatePassword("12345678"), null);
    assert.notEqual(validatePassword("a1".repeat(37)), null);
  });
  it("accepts 8+ with a letter and a number", () => assert.equal(validatePassword("abc12345"), null));
  it("grades strength", () => {
    assert.equal(passwordStrength("abc"), "weak");
    assert.equal(passwordStrength("abc12345"), "fair");
    assert.equal(passwordStrength("Abc12345!xyzQ"), "strong");
  });
});

describe("shared number / name / time validators", () => {
  it("number rules give specific messages", () => {
    assert.match(validateIntInRange("", "durationMin") ?? "", /required/);
    assert.match(validateIntInRange("abc", "durationMin") ?? "", /must be a number/);
    assert.match(validateIntInRange("-5", "durationMin") ?? "", /cannot be negative/);
    assert.match(validateIntInRange("2.5", "durationMin") ?? "", /whole number/);
    assert.match(validateIntInRange(9999, "durationMin") ?? "", /between 5 and 600/);
    assert.equal(validateIntInRange("90", "durationMin"), null);
  });
  it("name is required and whitespace counts as blank", () => {
    assert.notEqual(validateName("   "), null);
    assert.equal(validateName("Tristan"), null);
  });
  it("time window end must be after start", () => {
    assert.notEqual(validateTimeWindow("10:00", "09:00"), null);
    assert.equal(validateTimeWindow("09:00", "21:00"), null);
  });
});
