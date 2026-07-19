import { expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";

it("placeholder until the API surface exists (phase 1+)", () => {
  expect(PACKAGE_NAME).toBe("@zuo/api-client");
});
