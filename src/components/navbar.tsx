
"use client";

import Link from 'next/link';
import { Home, Upload, LogIn, LogOut, UserCircle, Loader2, ListChecks } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Logo from './logo';
import { ThemeToggle } from './theme-toggle';

const Navbar = () => {
  const pathname = usePathname();
  const { user, loading, signOutUser } = useAuth();

  const navItems = [
    { href: '/', label: 'Home', icon: Home, public: true },
    { href: '/jokes', label: 'Jokes', icon: ListChecks, public: true },
    // "Manage" promised settings and delivered a file input.
    { href: '/manage', label: 'Import', icon: Upload, public: false, requiresAuth: true },
  ];

  if (loading) {
    return (
      <nav aria-label="Main" className="bg-background sticky top-0 z-50 border-b border-border/50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Logo width={96} priority />
          </Link>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="bg-background sticky top-0 z-50 border-b border-border/50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Logo width={96} priority />
        </Link>
        <div className="flex items-center space-x-1 sm:space-x-2">
          {navItems.map((item) =>
            (item.public || (item.requiresAuth && user)) && (
            <Button
              key={item.href}
              variant="ghost" // Default to ghost
              size="sm"
              asChild
              className={cn(
                "flex items-center",
                pathname === item.href 
                  ? "bg-accent text-accent-foreground hover:bg-accent/90" // Active style for all links
                  : "text-foreground hover:bg-accent/50 hover:text-accent-foreground", // Inactive style
                 item.href === '/jokes' && pathname !== item.href ? "text-foreground hover:bg-accent/50 hover:text-accent-foreground" : "", // Specific for Jokes if needed
                 item.href === '/manage' && pathname !== item.href ? "text-foreground hover:bg-accent/50 hover:text-accent-foreground" : ""  // Specific for Manage if needed
              )}
            >
              <Link href={item.href}>
                <item.icon className={cn("mr-0 h-4 w-4 sm:mr-2", pathname === item.href ? "text-accent-foreground" : "text-primary")} />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            </Button>
          ))}

          {user ? (
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center text-muted-foreground hover:text-primary hover:bg-accent/50">
                  <UserCircle className="mr-0 h-5 w-5 sm:mr-2 text-primary" />
                  <span className="hidden sm:inline">{user.email || 'Account'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>{user.email}</DropdownMenuItem>
                <DropdownMenuItem onClick={signOutUser} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            pathname !== '/auth' && (
              <Button variant="ghost" size="sm" asChild className="hover:bg-accent/50">
                <Link href="/auth?redirect=/jokes" className="flex items-center text-muted-foreground hover:text-primary">
                  <LogIn className="mr-0 h-4 w-4 sm:mr-2 text-primary" />
                  <span className="hidden sm:inline">Login</span>
                </Link>
              </Button>
            )
          )}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
