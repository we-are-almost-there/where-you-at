import { useState } from "react";
import SidebarDrawer from "./SidebarDrawer";

export default function AppHeader() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-divider px-4">
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="메뉴"
          className="cursor-pointer text-[20px] leading-none text-ink"
        >
          ☰
        </button>
        <span className="font-bold text-ink text-[19px]">어디까지왔니</span>
      </header>

      <SidebarDrawer isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </>
  );
}