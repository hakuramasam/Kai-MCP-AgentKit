"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MainNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/landing", label: "Landing" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/api-status", label: "API Status" },
  ];

  return (
    <nav className="flex items-center space-x-4 lg:space-x-6">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`text-sm font-medium transition-colors hover:text-primary ${
            pathname === item.href ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}
      <Button asChild size="sm" variant="outline">
        <Link href="/dashboard">Agent Dashboard</Link>
      </Button>
    </nav>
  );
}