import { UserMenu } from "./UserMenu";

type TopBarProps = {
  agentName: string;
};

export function TopBar({ agentName }: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <h1 className="text-base font-medium">{agentName}</h1>
      <UserMenu />
    </header>
  );
}
