import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

function Hello() {
  return <h1>Hello, test</h1>;
}

describe("sanity", () => {
  it("renders a component", () => {
    render(<Hello />);
    expect(screen.getByRole("heading", { name: /hello, test/i })).toBeInTheDocument();
  });
});
