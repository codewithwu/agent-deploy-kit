import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { RegisterForm } from "./RegisterForm"
import { AuthContext, type AuthContextValue } from "@/context/AuthContext"
import { AuthApiError } from "@/lib/apiClient"

function renderForm(registerImpl?: AuthContextValue["register"]) {
  const register = vi.fn(registerImpl ?? (() => Promise.resolve()))
  const value: AuthContextValue = {
    status: "anonymous",
    user: null,
    isAuthenticated: false,
    login: vi.fn(),
    register,
    logout: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
  }
  return {
    ...render(
      <AuthContext.Provider value={value}>
        <MemoryRouter>
          <RegisterForm />
        </MemoryRouter>
      </AuthContext.Provider>,
    ),
    register,
  }
}

describe("RegisterForm", () => {
  it("submits valid inputs", async () => {
    const user = userEvent.setup()
    const { register } = renderForm()
    await user.type(screen.getByLabelText(/^用户名$/), "alice")
    await user.type(screen.getByLabelText(/^邮箱$/), "alice@x.com")
    await user.type(screen.getByLabelText(/^密码$/), "Secret123")
    await user.type(screen.getByLabelText(/确认密码/), "Secret123")
    await user.click(screen.getByRole("button", { name: /注册/ }))
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith("alice", "alice@x.com", "Secret123"),
    )
  })

  it("rejects mismatched passwords client-side", async () => {
    const user = userEvent.setup()
    const { register } = renderForm()
    await user.type(screen.getByLabelText(/^用户名$/), "alice")
    await user.type(screen.getByLabelText(/^邮箱$/), "alice@x.com")
    await user.type(screen.getByLabelText(/^密码$/), "Secret123")
    await user.type(screen.getByLabelText(/确认密码/), "Different1")
    await user.click(screen.getByRole("button", { name: /注册/ }))
    expect(await screen.findByText(/两次密码不一致/)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it("rejects weak password client-side (missing letter or digit)", async () => {
    const user = userEvent.setup()
    const { register } = renderForm()
    await user.type(screen.getByLabelText(/^用户名$/), "alice")
    await user.type(screen.getByLabelText(/^邮箱$/), "alice@x.com")
    await user.type(screen.getByLabelText(/^密码$/), "nodigits")
    await user.type(screen.getByLabelText(/确认密码/), "nodigits")
    await user.click(screen.getByRole("button", { name: /注册/ }))
    expect(
      await screen.findByText(/密码须同时含字母和数字/),
    ).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it("displays backend field error on username", async () => {
    const user = userEvent.setup()
    renderForm(async () => {
      throw new AuthApiError(400, "参数错误", [
        { loc: ["body", "username"], msg: "用户名格式不合法" },
      ])
    })
    await user.type(screen.getByLabelText(/^用户名$/), "!!")
    await user.type(screen.getByLabelText(/^邮箱$/), "alice@x.com")
    await user.type(screen.getByLabelText(/^密码$/), "Secret123")
    await user.type(screen.getByLabelText(/确认密码/), "Secret123")
    await user.click(screen.getByRole("button", { name: /注册/ }))
    expect(await screen.findByText("用户名格式不合法")).toBeInTheDocument()
  })
})
