import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LoginForm } from "./LoginForm";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/apiClient";

function renderForm(loginImpl?: AuthContextValue["login"]) {
  const login = vi.fn(loginImpl ?? (() => Promise.resolve()));
  const value: AuthContextValue = {
    status: "anonymous",
    user: null,
    isAuthenticated: false,
    login,
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
  };
  return {
    ...render(
      <AuthContext.Provider value={value}>
        <MemoryRouter>
          <LoginForm />
        </MemoryRouter>
      </AuthContext.Provider>,
    ),
    login,
  };
}

describe("LoginForm", () => {
  it("submits username and password", async () => {
    const user = userEvent.setup();
    const { login } = renderForm();
    await user.type(screen.getByLabelText(/用户名或邮箱/), "alice");
    await user.type(screen.getByLabelText(/密码/), "Secret123");
    await user.click(screen.getByRole("button", { name: /登录/ }));
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith("alice", "Secret123"),
    );
  });

  it("displays backend error detail", async () => {
    const user = userEvent.setup();
    renderForm(async () => {
      throw new AuthApiError(401, "用户名或密码错误");
    });
    await user.type(screen.getByLabelText(/用户名或邮箱/), "alice");
    await user.type(screen.getByLabelText(/密码/), "wrong");
    await user.click(screen.getByRole("button", { name: /登录/ }));
    expect(await screen.findByText("用户名或密码错误")).toBeInTheDocument();
  });

  it("disables submit button while pending", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const { login } = renderForm(() => new Promise<void>((r) => (resolve = r)));
    await user.type(screen.getByLabelText(/用户名或邮箱/), "alice");
    await user.type(screen.getByLabelText(/密码/), "Secret123");
    const btn = screen.getByRole("button", { name: /登录/ });
    await user.click(btn);
    expect(btn).toBeDisabled();
    resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(login).toHaveBeenCalled();
  });
});
