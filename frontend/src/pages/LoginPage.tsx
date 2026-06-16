import { Navigate, useSearchParams } from "react-router-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const { isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const justDeleted = params.get("deleted") === "1";

  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-[380px]">
        <CardHeader>
          <CardTitle>登录</CardTitle>
          <CardDescription>输入账号信息以继续</CardDescription>
        </CardHeader>
        <CardContent>
          {justDeleted ? (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              账户已注销
            </div>
          ) : null}
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
