import { Outlet } from "react-router";
import Header from "./AppHeader";

export default function Layout() {
  return (
    <div className="min-h-dvh bg-white">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  );
}