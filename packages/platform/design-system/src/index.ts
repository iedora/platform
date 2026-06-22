// Iedora Manual — primitives kit.
//
// Component groups are in the order the Manual lists them:
//   §VI.1  Button
//   §VI.2  Badge
//   §VI.3  Card
//   §VI.4  Field · Checkbox · Toggle
//   §VI.5  Table
//   §VI.6  Dialog
//   §VI.7  Toast
//   §VI.8  EmptyState
//   §VI.9  Tabs · Breadcrumb
// Editorial chrome (Wordmark, MetaStrip, Statement, Lintel) sits outside §VI
// but speaks the same vocabulary and ships from this package.

export { Wordmark } from "./components/wordmark";
export { MetaStrip } from "./components/meta-strip";
export { Statement } from "./components/statement";
export { Lintel } from "./components/lintel";
export { HouseSvg } from "./components/house-svg";

// Editorial nav — shared chrome shell used by every product surface
// (menu landing, menu dashboard, house). Slot-based composition so the
// same primitive renders a marketing nav, a product chrome, and a
// minimal brand strip without copy-paste.
export {
  Nav,
  NavBrand,
  NavActions,
  type NavProps,
  type NavBrandProps,
  type NavActionsProps,
} from "./components/nav";

// Editorial sidebar — vertical chrome with a mobile drawer.
export {
  Sidebar,
  SidebarBrand,
  SidebarBrandMark,
  SidebarLinks,
  SidebarLink,
  SidebarSectionLabel,
  SidebarFooter,
  SidebarTrigger,
  SidebarClose,
  SidebarProvider,
  useSidebar,
} from "./components/sidebar";
export {
  SidebarUserCard,
  SidebarMenuItem,
} from "./components/sidebar-user-card";
export {
  ActiveSidebarLinks,
  type ActiveSidebarItem,
  type ActiveSidebarLinksProps,
} from "./components/active-sidebar-links";

export { Button, type ButtonProps } from "./components/button";
export { Badge } from "./components/badge";
export {
  Card,
  CardIndex,
  CardVisual,
  CardTitle,
  CardDesc,
  CardFoot,
} from "./components/card";
export {
  Field,
  FieldLabel,
  FieldHint,
  FieldError,
  FieldInput,
  FieldTextarea,
  FieldSelect,
  TextField,
  TextareaField,
  SelectField,
} from "./components/field";
export {
  Combobox,
  type ComboboxOption,
  type ComboboxProps,
} from "./components/combobox";
export { Checkbox, Toggle } from "./components/check-toggle";
export { Table, Th, Td, TableRowNum } from "./components/table";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogBody,
} from "./components/dialog";
export { Toast } from "./components/toast";
export { EmptyState } from "./components/empty-state";
export { Tabs, Tab } from "./components/tabs";
export {
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbHere,
} from "./components/breadcrumb";
export { SectionHeader } from "./components/section-header";

// Admin stats — snapshot panels (Stat, Histogram, StatsPanel) shared
// across cross-tenant admin surfaces (QR codes, sessions, …).
export {
  Stat,
  Histogram,
  StatsHeader,
  StatsPanel,
} from "./components/admin-stats";
