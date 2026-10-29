import Link from "next/link";
import ThemeToggle from "../ThemeToggle";

export function DemoNav({ current, toggle = true }: { current: "parse" | "profile"; toggle?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <nav className="yd-nav min-w-0 flex-1 overflow-x-auto" aria-label="Разделы демо">
        <Link href="/" aria-current={current === "parse" ? "page" : undefined}><span className="min-[480px]:hidden">Разбор</span><span className="hidden min-[480px]:inline">Разбор резюме</span></Link>
        <Link href="/profile" aria-current={current === "profile" ? "page" : undefined}>
          <span className="min-[480px]:hidden">Мой профиль</span><span className="hidden min-[480px]:inline">Мой профиль и резюме</span>
        </Link>
      </nav>
      {toggle && <ThemeToggle />}
    </div>
  );
}
