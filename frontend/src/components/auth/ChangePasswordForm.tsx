import { useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/context/AuthContext"
import { AuthApiError } from "@/lib/apiClient"

export function ChangePasswordForm() {
  const { changePassword } = useAuth()
  const [oldPassword, setOld] = useState("")
  const [newPassword, setNew] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setError(null)
    if (newPassword !== confirm) {
      setError("两次密码不一致")
      return
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("密码须同时含字母和数字")
      return
    }

    setPending(true)
    try {
      await changePassword(oldPassword, newPassword)
      toast.success("密码已修改")
      setOld("")
      setNew("")
      setConfirm("")
    } catch (e) {
      setError(e instanceof AuthApiError ? e.detail : "修改失败,请稍后重试")
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
        <Label htmlFor="cp-old">旧密码</Label>
        <Input
          id="cp-old"
          type="password"
          required
          value={oldPassword}
          onChange={(e) => setOld(e.target.value)}
          disabled={pending}
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-new">新密码</Label>
        <Input
          id="cp-new"
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          disabled={pending}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-confirm">确认新密码</Label>
        <Input
          id="cp-confirm"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={pending}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        修改密码
      </Button>
    </form>
  )
}
