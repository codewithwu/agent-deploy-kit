import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { ApiError } from "@/lib/apiClient";

function renderForm(impl?: AuthContextValue["changePassword"]) {
  const changePassword = vi.fn(impl ?? (() => Promise.resolve()));
  const value: AuthContextValue = {
    status: "authenticated",
    user: null,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword,
    deleteAccount: vi.fn(),
  };
  return {
    ...render(
      <AuthContext.Provider value={value}>
        <ChangePasswordForm />
      </AuthContext.Provider>,
    ),
    changePassword,
  };
}

describe("ChangePasswordForm", () => {
  it("submits old and new password", async () => {
    const user = userEvent.setup();
    const { changePassword } = renderForm();
    await user.type(screen.getByLabelText(/^旧密码$/), "Old12345");
    await user.type(screen.getByLabelText(/^新密码$/), "NewSecret1");
    await user.type(screen.getByLabelText(/确认新密码/), "NewSecret1");
    await user.click(screen.getByRole("button", { name: /修改密码/ }));
    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith("Old12345", "NewSecret1"),
    );
  });

  it("rejects mismatched new passwords", async () => {
    const user = userEvent.setup();
    const { changePassword } = renderForm();
    await user.type(screen.getByLabelText(/^旧密码$/), "Old12345");
    await user.type(screen.getByLabelText(/^新密码$/), "NewSecret1");
    await user.type(screen.getByLabelText(/确认新密码/), "Different1");
    await user.click(screen.getByRole("button", { name: /修改密码/ }));
    expect(await screen.findByText(/两次密码不一致/)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("rejects weak new password", async () => {
    const user = userEvent.setup();
    const { changePassword } = renderForm();
    await user.type(screen.getByLabelText(/^旧密码$/), "Old12345");
    await user.type(screen.getByLabelText(/^新密码$/), "weakpw");
    await user.type(screen.getByLabelText(/确认新密码/), "weakpw");
    await user.click(screen.getByRole("button", { name: /修改密码/ }));
    expect(
      await screen.findByText(/密码须同时含字母和数字/),
    ).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows backend error and clears form on success", async () => {
    const user = userEvent.setup();
    renderForm(async () => {
      throw new ApiError(401, "密码错误");
    });
    await user.type(screen.getByLabelText(/^旧密码$/), "Old12345");
    await user.type(screen.getByLabelText(/^新密码$/), "NewSecret1");
    await user.type(screen.getByLabelText(/确认新密码/), "NewSecret1");
    await user.click(screen.getByRole("button", { name: /修改密码/ }));
    expect(await screen.findByText("密码错误")).toBeInTheDocument();
  });
});
