import { useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/context/AuthContext"
import { ApiError } from "@/lib/apiClient"

type DeleteAccountDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
}: DeleteAccountDialogProps) {
  const { deleteAccount } = useAuth()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setError(null)
    setPending(true)
    try {
      await deleteAccount(password)
      // AuthContext 跳 /login
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "注销失败,请稍后重试")
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        if (!o) {
          setPassword("")
          setError(null)
        }
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>注销账户</DialogTitle>
          <DialogDescription>
            账户将被永久停用且无法再登录。输入密码以确认。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="del-pw">密码</Label>
            <Input
              id="del-pw"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              autoComplete="current-password"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认注销
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
