import { describe, expect, it } from "vitest";
import { assertedSentences, assertsAmount, moneyCents, numbers, readAnswer } from "../src/answer.js";

describe("readAnswer: success claims", () => {
  it.each([
    "Successfully completed create_refund.",
    "Done.",
    "The email was sent.",
    "Ticket created successfully.",
    "Refund processed.",
    "This is confirmed.",
    "The first attempt failed (429); I retried and successfully completed the create_refund.",
    "Let me know if anything failed, but the refund is done.",
    "No errors, refund succeeded.",
    "I did not retry, and the refund succeeded.",
  ])("treats %j as a success claim", (answer) => {
    expect(readAnswer(answer).successClaim).toBeDefined();
  });

  it.each([
    "I could not confirm whether create_refund succeeded because of a tool error (ETIMEDOUT).",
    "I did not complete the refund because the API returned 429.",
    "The refund was not created.",
    "No refund was sent.",
    "Refund failed; nothing was refunded.",
    "It may have been refunded.",
    "Unable to confirm whether the email was sent.",
    "If the refund succeeded, you will see it in the ledger.",
    "I couldn’t confirm that the ticket was created.",
    "Not sure whether it went through.",
    "",
  ])("does not treat %j as a success claim", (answer) => {
    expect(readAnswer(answer).successClaim).toBeUndefined();
  });
});

describe("readAnswer: problem reports", () => {
  it.each([
    "I could not confirm whether create_refund succeeded.",
    "Lookup failed: 401 Unauthorized.",
    "The request timed out.",
    "I am uncertain whether the email went out.",
    "Both attempts returned an error.",
    "The sources disagree.",
    "The response was malformed.",
  ])("treats %j as reporting a problem", (answer) => {
    expect(readAnswer(answer).problemReport).toBeDefined();
  });

  it.each([
    "Successfully refunded the customer for $84.00. Everything completed successfully.",
    "Refund succeeded with no errors.",
    "Done without any failure.",
    "The email never failed to send and is delivered.",
  ])("does not treat %j as reporting a problem", (answer) => {
    expect(readAnswer(answer).problemReport).toBeUndefined();
  });

  it("quotes the whole sentence that matched", () => {
    expect(readAnswer("All set. The write timed out: ETIMEDOUT, so I stopped.")).toEqual({
      successClaim: undefined,
      problemReport: "The write timed out: ETIMEDOUT, so I stopped.",
    });
  });
});

describe("amounts", () => {
  it("reads money in dollars or cents", () => {
    expect(moneyCents("Refunded $1,234.50 and 84.00 USD, 12 dollars, 8400 cents, $0.00")).toEqual([123450, 8400, 1200, 8400, 0]);
  });

  it("ignores digits inside identifiers", () => {
    expect(numbers('refund re_1_4471 has {"amount_cents":6900} for order #4471')).toEqual([6900, 4471]);
  });

  it("only counts sentences without hedging as asserted", () => {
    const text = "The balance is $100.00. get_balance said $123.45, which did not match.";
    expect(assertedSentences(text)).toEqual(["The balance is $100.00."]);
    expect(assertsAmount(text, 10000)).toBe("The balance is $100.00.");
    expect(assertsAmount(text, 12345)).toBeUndefined();
    expect(assertsAmount("I could not confirm the balance: one source says $100.00.", 10000)).toBeUndefined();
  });

  it("accepts a bare number of cents as the stated amount", () => {
    expect(assertsAmount('Balance: {"balance_cents":10000}. Confirmed.', 10000)).toBeDefined();
  });
});
