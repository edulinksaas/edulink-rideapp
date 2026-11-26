import type { ReactNode } from "react";

export const Icon = ({ name }: { name: "bus" | "edit" | "list" | "back" }) => {
  const paths: Record<typeof name, ReactNode> = {
    bus: (
      <>
        <rect x="4" y="3" width="16" height="16" rx="3" />
        <path d="M7 7h10M7 11h2m6 0h2M6 19v2m12-2v2M4 15h16" />
        <circle cx="8" cy="16" r="1" />
        <circle cx="16" cy="16" r="1" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    list: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2m6 2V2M9 9h6m-6 4h6m-6 4h4" />
      </>
    ),
    back: <path d="m15 18-6-6 6-6" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
};