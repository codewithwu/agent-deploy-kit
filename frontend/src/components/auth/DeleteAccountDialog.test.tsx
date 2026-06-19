import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { ApiError } from "@/lib/apiClient";

function renderDialog(
  open: boolean,
  deleteImpl?: AuthContextValue["deleteAccount"],
) {
  const deleteAccount = vi.fn(deleteImpl ?? (() => Promise.resolve()));
  const onOpenChange = vi.fn();
  const value: AuthContextValue = {
    status: "authenticated",
    user: null,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount,
  };
  return {
    ...render(
      <AuthContext.Provider value={value}>
        <DeleteAccountDialog open={open} onOpenChange={onOpenChange} />
      </AuthContext.Provider>,
    ),
    deleteAccount,
    onOpenChange,
  };
}

describe("DeleteAccountDialog", () => {
  it("does not render content when closed", () => {
    renderDialog(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls deleteAccount with password on confirm", async () => {
    const user = userEvent.setup();
    const { deleteAccount } = renderDialog(true);
    await user.type(screen.getByLabelText(/^密码$/), "MyPw1234");
    await user.click(screen.getByRole("button", { name: /确认注销/ }));
    await waitFor(() =>
      expect(deleteAccount).toHaveBeenCalledWith("MyPw1234"),
    );
  });

  it("displays backend error detail on failure", async () => {
    const user = userEvent.setup();
    renderDialog(true, async () => {
      throw new ApiError(401, "密码错误");
    });
    await user.type(screen.getByLabelText(/^密码$/), "wrong");
    await user.click(screen.getByRole("button", { name: /确认注销/ }));
    expect(await screen.findByText("密码错误")).toBeInTheDocument();
  });
});
