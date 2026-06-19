import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { UserMenu } from "./UserMenu";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";

const user = {
  id: 1,
  username: "alice",
  email: "alice@x.com",
  role: "user" as const,
  is_active: true,
  created_at: "2026-06-16T00:00:00Z",
};

function renderMenu(valueOverrides: Partial<AuthContextValue> = {}) {
  const logout = vi.fn();
  const value: AuthContextValue = {
    status: "authenticated",
    user,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout,
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
    ...valueOverrides,
  };
  const utils = render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { ...utils, logout };
}

describe("UserMenu", () => {
  it("shows trigger with username initial and username", () => {
    renderMenu();
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("opens menu and shows email", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /alice/i }));
    expect(await screen.findByText("alice@x.com")).toBeInTheDocument();
  });

  it("clicking '退出登录' calls logout", async () => {
    const user = userEvent.setup();
    const { logout } = renderMenu();
    await user.click(screen.getByRole("button", { name: /alice/i }));
    await user.click(await screen.findByRole("menuitem", { name: /退出登录/ }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("renders only trigger when user is null", () => {
    render(
      <AuthContext.Provider
        value={{
          status: "anonymous",
          user: null,
          isAuthenticated: false,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          changePassword: vi.fn(),
          deleteAccount: vi.fn(),
        }}
      >
        <MemoryRouter>
          <UserMenu />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.queryByRole("button")).toBeInTheDocument();
    // DropdownMenu 不会展开
  });
});
