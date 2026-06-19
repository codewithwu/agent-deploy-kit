import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/context/AuthContext"
import { ApiError } from "@/lib/apiClient"

interface FieldErrors {
  username?: string
  email?: string
  password?: string
  confirmPassword?: string
}

function pickFieldError(
  err: ApiError,
  field: "username" | "email" | "password",
): string | undefined {
  if (!err.fieldErrors) return undefined
  return err.fieldErrors.find((e) => e.loc.includes(field))?.msg
}

export function RegisterForm() {
  const { register } = useAuth()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [errors, setErrors] = useState<FieldErrors>({})
  const [topError, setTopError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function validate(): FieldErrors {
    const e: FieldErrors = {}
    if (password !== confirmPassword) e.confirmPassword = "两次密码不一致"
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      e.password = "密码须同时含字母和数字"
    }
    return e
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setTopError(null)
    const clientErrs = validate()
    setErrors(clientErrs)
    if (Object.keys(clientErrs).length > 0) return

    setPending(true)
    try {
      await register(username, email, password)
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors({
          username: pickFieldError(e, "username"),
          email: pickFieldError(e, "email"),
          password: pickFieldError(e, "password"),
        })
        setTopError(e.fieldErrors ? null : e.detail)
      } else {
        setTopError("注册失败,请稍后重试")
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {topError ? (
        <Alert variant="destructive">
          <AlertDescription>{topError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="reg-username">用户名</Label>
        <Input
          id="reg-username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(errors.username)}
        />
        {errors.username ? (
          <p className="text-xs text-destructive">{errors.username}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-email">邮箱</Label>
        <Input
          id="reg-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email ? (
          <p className="text-xs text-destructive">{errors.email}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-password">密码</Label>
        <Input
          id="reg-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(errors.password)}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-confirm">确认密码</Label>
        <Input
          id="reg-confirm"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(errors.confirmPassword)}
        />
        {errors.confirmPassword ? (
          <p className="text-xs text-destructive">{errors.confirmPassword}</p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        注册
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        已有账号?{" "}
        <Link to="/login" className="text-primary hover:underline">
          去登录
        </Link>
      </p>
    </form>
  )
}
