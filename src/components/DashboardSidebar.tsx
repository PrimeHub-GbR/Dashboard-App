'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Workflow, ShoppingCart, Database, RefreshCw } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { McpStatus } from '@/components/McpStatus'

const navItems = [
  { label: 'Workflow Hub', href: '/dashboard/workflow-hub', icon: LayoutDashboard },
  { label: 'Workflow Monitor', href: '/dashboard/workflows', icon: Workflow },
  { label: 'Bestellungen', href: '/dashboard/orders', icon: ShoppingCart },
  { label: 'Preisdatenbank', href: '/dashboard/prices', icon: Database },
  { label: 'Repricer', href: '/dashboard/repricer', icon: RefreshCw },
]

interface DashboardSidebarProps {
  userEmail: string | null
}

export function DashboardSidebar({ userEmail }: DashboardSidebarProps) {
  const pathname = usePathname()

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {
      // sign out failed, redirect anyway to clear client state
    } finally {
      window.location.href = '/'
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <a href="/landing" className="font-semibold text-sm hover:text-primary transition-colors">PrimeHub Dashboard</a>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-3 gap-2">
        <McpStatus />
        <Separator />
        {userEmail && (
          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start text-xs text-muted-foreground hover:text-foreground px-0"
        >
          Abmelden
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}