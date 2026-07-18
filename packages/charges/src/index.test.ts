import { expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";

it("placeholder until phase 2 (charges engine)", () => {
  expect(PACKAGE_NAME).toBe("@zuo/charges");
});
