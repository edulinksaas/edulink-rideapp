import type { ReactNode } from "react";

type AppHeaderProps = {
  centerName: string;
  navigation: ReactNode;
  onHome: () => void;
  onLogout: () => void;
};

export function AppHeader({
  centerName,
  navigation,
  onHome,
  onLogout,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={onHome}>
        {centerName}
      </button>
      {navigation}
      <button className="header-logout" type="button" onClick={onLogout}>
        로그아웃
      </button>
    </header>
  );
}