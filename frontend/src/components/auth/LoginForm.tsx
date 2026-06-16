import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/context/AuthContext"
import { AuthApiError } from "@/lib/apiClient"

export function LoginForm() {
  const { login } = useAuth()
  const [usernameOrEmail, setUoe] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await login(usernameOrEmail, password)
    } catch (e) {
      if (e instanceof AuthApiError) setError(e.detail)
      else setError("登录失败,请稍后重试")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="login-username">用户名或邮箱</Label>
        <Input
          id="login-username"
          name="username"
          autoComplete="username"
          required
          value={usernameOrEmail}
          onChange={(e) => setUoe(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">密码</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        登录
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        还没有账号?{" "}
        <Link to="/register" className="text-primary hover:underline">
          去注册
        </Link>
      </p>
    </form>
  )
}
