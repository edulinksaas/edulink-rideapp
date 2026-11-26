import { navigationItems, type View } from "../../types/navigation";

type AppNavigationProps = {
  currentView: View;
  isOperator: boolean;
  navigate: (view: View) => void;
};

function Navigation({ className, label, currentView, isOperator, navigate }: AppNavigationProps & { className: string; label: string }) {
  return (
    <nav className={className} aria-label={label}>
      {navigationItems.filter((item) => !item.operatorOnly || isOperator).map((item) => {
        const active = item.activeViews.includes(currentView);
        return <button key={item.view} type="button" className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => navigate(item.view)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>;
      })}
    </nav>
  );
}

export function DesktopNavigation(props: AppNavigationProps) {
  return <Navigation {...props} className="desktop-nav" label="상단 메뉴" />;
}

export function MobileNavigation(props: AppNavigationProps) {
  return <Navigation {...props} className="mobile-nav" label="하단 메뉴" />;
}
