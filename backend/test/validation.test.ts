import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RESERVED_USERNAMES,
  isCommonPassword,
  normalizeUsername,
  passwordChecks,
  passwordErrors,
  passwordStrength,
  usernameErrors,
  validateEmail,
  validateIntInRange,
  validateName,
  validatePassword,
  validateTimeWindow,
  validateUsername,
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
  const ctx = { username: "tristan_j", email: "tjoubert@gmail.com" };
  const ids = (pw: string, c = {}) => passwordChecks(pw, c).filter((r) => !r.passed).map((r) => r.id);

  it("accepts a strong password", () => {
    assert.equal(validatePassword("Correct-Horse-42", ctx), null);
    assert.deepEqual(passwordErrors("Correct-Horse-42", ctx), []);
  });
  it("reports EVERY failing rule, one message each", () => {
    assert.deepEqual(ids("abc"), ["length", "upper", "digit", "symbol", "common"]);
    assert.equal(passwordErrors("abc").length, 5);
    assert.deepEqual(ids("alllowercase12!"), ["upper"]);
    assert.deepEqual(ids("ALLUPPERCASE12!"), ["lower"]);
    assert.deepEqual(ids("NoDigitsHere!!"), ["digit"]);
    assert.deepEqual(ids("NoSymbolsHere12"), ["symbol"]);
    assert.deepEqual(ids("Aa1!" + "x".repeat(70)), ["max"]);
    assert.deepEqual(passwordErrors(""), ["Password is required."]);
  });
  it("rejects a password containing the username or email name (case-insensitive)", () => {
    assert.deepEqual(ids("My-TRISTAN_J-2026", ctx), ["personal"]);
    assert.deepEqual(ids("xTJoubert#2026", ctx), ["personal"]);
    // +tag is ignored, 1-2 char names are not enforced.
    assert.deepEqual(ids("Hello-Anna-2026x", { email: "anna+uni@x.com" }), ["personal"]);
    assert.deepEqual(ids("Correct-Horse-42", { username: "co", email: "jo@x.com" }), []);
  });
  it("rejects common passwords even when dressed up to pass composition", () => {
    for (const pw of ["Password123!", "P@ssw0rd!2024", "Qwerty123456!", "Welcome@2026", "Admin12345!!", "PasswordPassword1!"]) {
      assert.ok(isCommonPassword(pw), pw);
      assert.deepEqual(ids(pw), ["common"], pw);
    }
    assert.ok(isCommonPassword("123456"));
    assert.ok(!isCommonPassword("Correct-Horse-42"));
  });
  it("grades strength; anything failing a rule is weak", () => {
    assert.equal(passwordStrength("abc"), "weak");
    assert.equal(passwordStrength("Password123!"), "weak");
    assert.equal(passwordStrength("Horsebattery9!"), "good");
    assert.equal(passwordStrength("Horse!battery-staple9"), "strong");
  });
});

describe("shared username validator", () => {
  it("normalises (trim + lower-case) before checking", () => {
    assert.equal(normalizeUsername("  Tristan_J "), "tristan_j");
    assert.equal(validateUsername("  Tristan_J "), null);
  });
  const reject: [string, RegExp][] = [
    ["", /required/],
    ["ab", /at least 3/],
    ["a".repeat(21), /at most 20/],
    ["john doe", /spaces/],
    ["1john", /start with a letter/],
    ["_john", /start with a letter/],
    ["john.doe", /lowercase letters, numbers and underscores/],
    ["jöhn", /lowercase letters, numbers and underscores/],
    ["admin", /reserved/],
    ["ROOT", /reserved/],
  ];
  for (const [u, msg] of reject) it(`rejects "${u}"`, () => assert.match(validateUsername(u) ?? "", msg));
  it("reports every failing rule", () => {
    assert.equal(usernameErrors("1 a.").length, 3);
  });
  it("accepts valid names", () => {
    for (const u of ["abc", "tristan_j", "user2026", "a".repeat(20)]) assert.equal(validateUsername(u), null, u);
  });
  it("the backfill migration reserves exactly the shared list", () => {
    const sql = readFileSync(join(__dirname, "../prisma/migrations/20261101090000_user_username/migration.sql"), "utf8");
    const block = /ARRAY\[([\s\S]*?)\]/.exec(sql)?.[1] ?? "";
    const inSql = [...block.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    assert.deepEqual([...inSql].sort(), [...RESERVED_USERNAMES].sort());
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
