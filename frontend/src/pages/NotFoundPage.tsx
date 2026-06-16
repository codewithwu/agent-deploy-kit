import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">页面不存在</h1>
      <p className="text-sm text-muted-foreground">你访问的页面已被移除或从未存在</p>
      <Button asChild>
        <Link to="/">回首页</Link>
      </Button>
    </div>
  );
}
