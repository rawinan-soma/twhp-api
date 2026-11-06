import { describe, expect, it } from "bun:test";
import { verdictEmailCc, verdictFinishedJob } from "./verdictEmail";

const contact = (ccEmail: string | null) => ({
  email: "factory@example.com",
  ccEmail,
  factoryNameTh: "โรงงานทดสอบ",
});

describe("verdictEmailCc", () => {
  it("omits cc when the safety officer address is null", () => {
    expect(verdictEmailCc(contact(null))).toBeUndefined();
  });

  it("omits cc when the safety officer address is blank", () => {
    expect(verdictEmailCc(contact(""))).toBeUndefined();
  });

  it("omits cc when it equals the account address", () => {
    expect(verdictEmailCc(contact("factory@example.com"))).toBeUndefined();
  });

  it("returns the safety officer address when it differs", () => {
    expect(verdictEmailCc(contact("officer@example.com"))).toBe("officer@example.com");
  });
});

describe("verdictFinishedJob", () => {
  it("serializes to the worker payload, with cc when the officer has an address of their own", () => {
    expect(JSON.stringify(verdictFinishedJob(contact("officer@example.com"), "gold"))).toBe(
      '{"email":"factory@example.com","cc":"officer@example.com","grade":"gold","factoryNameTh":"โรงงานทดสอบ"}',
    );
  });

  it("drops cc from the serialized payload when there is none", () => {
    expect(JSON.stringify(verdictFinishedJob(contact(null), "silver"))).toBe(
      '{"email":"factory@example.com","grade":"silver","factoryNameTh":"โรงงานทดสอบ"}',
    );
  });
});
