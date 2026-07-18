import { render, screen } from "@testing-library/react";
import { EXCHANGES } from "@zuo/types";
import { expect, it } from "vitest";
import Home from "./page";

it("renders the app name and every supported exchange", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: "Zuo" })).toBeDefined();
  for (const exchange of EXCHANGES) {
    expect(screen.getByText(exchange)).toBeDefined();
  }
});
