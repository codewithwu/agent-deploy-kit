import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "./SettingsPage";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";

const user = {
  id: 1,
  username: "alice",
  email: "alice@x.com",
  role: "user" as const,
  isActive: true,
  createdAt: "2026-06-16T00:00:00Z",
};

function renderPage() {
  const value: AuthContextValue = {
    status: "authenticated",
    user,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("SettingsPage", () => {
  it("renders user info and three sections", () => {
    renderPage();
    const main = screen.getByRole("main");
    expect(within(main).getByText("alice")).toBeInTheDocument();
    expect(within(main).getByText("alice@x.com")).toBeInTheDocument();
    expect(within(main).getAllByText("账户信息").length).toBeGreaterThan(0);
    expect(within(main).getAllByText("修改密码").length).toBeGreaterThan(0);
    expect(within(main).getAllByText("注销账户").length).toBeGreaterThan(0);
  });

  it("opens DeleteAccountDialog on click", async () => {
    const userEv = userEvent.setup();
    renderPage();
    await userEv.click(screen.getByRole("button", { name: /注销账户/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/账户将被永久停用/)).toBeInTheDocument();
  });
});
