import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { DeleteAccountDialog } from "@/components/auth/DeleteAccountDialog";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
        <Button variant="ghost" onClick={() => navigate("/")}>
          ← 返回聊天
        </Button>
        <UserMenu />
      </header>
      <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>账户信息</CardTitle>
            <CardDescription>当前登录账号的只读资料</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">用户名: </span>
              {user?.username}
            </div>
            <div>
              <span className="text-muted-foreground">邮箱: </span>
              {user?.email}
            </div>
            <div>
              <span className="text-muted-foreground">角色: </span>
              {user?.role}
            </div>
            <div>
              <span className="text-muted-foreground">注册时间: </span>
              {user?.created_at ? new Date(user.created_at).toLocaleString() : "-"}
            </div>
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  void logout();
                }}
              >
                退出登录
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>修改密码</CardTitle>
            <CardDescription>修改后需使用新密码重新登录</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">注销账户</CardTitle>
            <CardDescription>账户将被永久停用且无法再登录</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setDialogOpen(true)}
            >
              注销账户
            </Button>
          </CardContent>
        </Card>
      </main>

      <DeleteAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
