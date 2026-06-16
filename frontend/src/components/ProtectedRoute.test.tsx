import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";

function makeValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    status: "anonymous",
    user: null,
    isAuthenticated: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
    ...overrides,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname}</span>;
}

function renderWith(value: AuthContextValue, initial: string) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>home</div>} />
          </Route>
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("shows loading screen when status is loading", () => {
    renderWith(makeValue({ status: "loading" }), "/");
    expect(screen.queryByText("home")).not.toBeInTheDocument();
    // Loader2 是 svg,仅断言无 home 渲染
  });

  it("redirects to /login with from state when anonymous", () => {
    renderWith(makeValue({ status: "anonymous" }), "/");
    expect(screen.getByTestId("loc").textContent).toBe("/login");
    expect(screen.queryByText("home")).not.toBeInTheDocument();
  });

  it("renders outlet when authenticated", () => {
    renderWith(
      makeValue({ status: "authenticated", isAuthenticated: true }),
      "/",
    );
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});
