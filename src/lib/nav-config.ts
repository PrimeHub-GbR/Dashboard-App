import {
  LayoutDashboard, Workflow, ShoppingCart, Database,
  RefreshCw, Package, BookOpen, Clock, CheckSquare, Building2,
  MessageCircle, BookCheck, Wallet, Cog, Boxes, Users, Banknote, Grid3x3,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  desc: string
  href: string
  icon: LucideIcon
}

export interface NavGroup {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

// Standalone-Link über den Gruppen
export const homeItem: NavItem = {
  label: 'Übersicht',
  desc: 'Dashboard-Start',
  href: '/dashboard',
  icon: LayoutDashboard,
}

export const navGroups: NavGroup[] = [
  {
    label: 'Automatisierung',
    icon: Cog,
    items: [
      { label: 'Workflow Hub', desc: 'Upload & Verarbeitung', href: '/dashboard/workflow-hub', icon: LayoutDashboard },
      { label: 'Workflow Monitor', desc: 'N8N Status & Steuerung', href: '/dashboard/workflows', icon: Workflow },
      { label: 'Repricer Preissync', desc: 'Automatische Preise', href: '/dashboard/repricer', icon: RefreshCw },
      { label: 'Lieferantenlisten', desc: 'Blank · A43-Kulturgut · Avus', href: '/dashboard/lieferantenlisten', icon: Package },
    ],
  },
  {
    label: 'Daten & Katalog',
    icon: Boxes,
    items: [
      { label: 'Bestellungen', desc: 'Google Drive Sync', href: '/dashboard/orders', icon: ShoppingCart },
      { label: 'Preisdatenbank', desc: 'SKU, ASIN & EAN', href: '/dashboard/prices', icon: Database },
      { label: 'Rebuy Scraper', desc: 'Bücher · wöchentlich · Excel', href: '/dashboard/rebuy', icon: BookOpen },
      { label: 'Buchpreisbindung', desc: 'Preiskonformität · Amazon · VLB', href: '/dashboard/buchpreisbindung', icon: BookCheck },
    ],
  },
  {
    label: 'Team & Aufgaben',
    icon: Users,
    items: [
      { label: 'Zeiterfassung', desc: 'Check-in · Stunden · Planung', href: '/dashboard/zeiterfassung', icon: Clock },
      { label: 'Aufgaben', desc: 'To-Dos · Delegation · KPIs', href: '/dashboard/aufgaben', icon: CheckSquare },
      { label: 'Organisation', desc: 'Team · Hierarchie · Stammdaten', href: '/dashboard/organisation', icon: Building2 },
      { label: 'Skill-Matrix', desc: 'Kompetenzen · Wer kann was', href: '/dashboard/skill-matrix', icon: Grid3x3 },
    ],
  },
  {
    label: 'Finanzen & Kommunikation',
    icon: Banknote,
    items: [
      { label: 'CashFlow', desc: 'Barmittel · Trend · Analyse', href: '/dashboard/cashflow', icon: Wallet },
      { label: 'Kommunikation', desc: 'WhatsApp · Nachrichten · Verlauf', href: '/dashboard/kommunikation', icon: MessageCircle },
    ],
  },
]

// Flache Liste aller Items (für Suche / Command-Palette)
export const allNavItems: NavItem[] = [homeItem, ...navGroups.flatMap((g) => g.items)]
