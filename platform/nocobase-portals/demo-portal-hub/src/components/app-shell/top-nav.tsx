"use client";

import React from "react";
import { filterMenuItemsByAcl, useAclState } from "@nocobase/portal-sdk/acl";
import {
  useMenu,
  useLink,
  useTranslate,
  useUserFriendlyName,
  type TreeMenuItem,
} from "@refinedev/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, ListIcon, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { getResourceLabel } from "@/components/resources/resource-label";

// Horizontal primary navigation shown in the app-shell header. It reuses the
// same refine menu tree as the (removed) sidebar: top-level items are Overview
// + the seven group parents. Groups render as hover-open dropdown menus that
// reveal their child items (with a nested submenu for any 3rd level). When the
// items don't fit the available width, the trailing ones collapse into a "More"
// dropdown instead of showing a horizontal scrollbar.

const GAP = 4; // matches the flex `gap-1` (0.25rem) between nav items

function navButtonClass(isSelected?: boolean) {
  return cn(
    "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-normal transition-colors",
    {
      "bg-primary/10 text-primary hover:!bg-primary/15": isSelected,
      "text-foreground hover:bg-accent/70": !isSelected,
    }
  );
}

export function TopNav() {
  const { menuItems, selectedKey } = useMenu();
  const acl = useAclState();
  const items = React.useMemo(
    () =>
      acl.status === "ready"
        ? filterMenuItemsByAcl(menuItems, acl.permissions)
        : [],
    [acl, menuItems]
  );

  const containerRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = React.useState(items.length);

  const compute = React.useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const available = container.clientWidth;
    if (!available) return;
    const kids = Array.from(measure.children) as HTMLElement[];
    if (kids.length === 0) return;
    const moreW = kids[kids.length - 1]?.offsetWidth ?? 0;
    const itemW = kids.slice(0, -1).map((k) => k.offsetWidth);

    const totalAll = itemW.reduce((a, w, i) => a + w + (i > 0 ? GAP : 0), 0);
    let count: number;
    if (totalAll <= available) {
      count = itemW.length;
    } else {
      let used = 0;
      count = 0;
      for (let i = 0; i < itemW.length; i++) {
        const w = itemW[i] + (i > 0 ? GAP : 0);
        // reserve room for the trailing More button
        if (used + w + GAP + moreW <= available) {
          used += w;
          count++;
        } else {
          break;
        }
      }
      count = Math.max(1, count); // always keep Overview visible
    }
    setVisibleCount((prev) => (prev === count ? prev : count));
  }, []);

  // Recompute after every render (labels/locale/count changes) — cheap read of
  // ~9 nodes; converges because setState no-ops when the value is unchanged.
  React.useLayoutEffect(() => {
    compute();
  });

  // Recompute on container resize.
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => compute());
    ro.observe(container);
    return () => ro.disconnect();
  }, [compute]);

  const visible = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);

  return (
    <div
      ref={containerRef}
      className={cn("relative flex min-w-0 flex-1 items-center overflow-hidden")}
    >
      {/* Hidden measurement row: all items at natural width + the More button. */}
      <div
        ref={measureRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap opacity-0"
        )}
      >
        {items.map((item: TreeMenuItem) => (
          <MeasureItem
            key={`m-${item.key || item.name}`}
            item={item}
            selectedKey={selectedKey}
          />
        ))}
        <MoreButtonVisual />
      </div>

      {/* Visible row. */}
      <nav className={cn("flex items-center gap-1")}>
        {visible.map((item: TreeMenuItem) => (
          <TopNavItem
            key={item.key || item.name}
            item={item}
            selectedKey={selectedKey}
          />
        ))}
        {overflow.length > 0 && (
          <MoreMenu items={overflow} selectedKey={selectedKey} />
        )}
      </nav>
    </div>
  );
}

type ItemProps = {
  item: TreeMenuItem;
  selectedKey?: string;
};

function TopNavItem({ item, selectedKey }: ItemProps) {
  if (item.children && item.children.length > 0) {
    return <TopNavGroup item={item} selectedKey={selectedKey} />;
  }
  return <TopNavLink item={item} selectedKey={selectedKey} />;
}

// Hover-open state with a short close delay so moving from the trigger into the
// (portaled) flyout doesn't dismiss it.
function useHoverMenu() {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const scheduleClose = React.useCallback(() => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), 150);
  }, [cancelClose]);
  const openNow = React.useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);
  React.useEffect(() => cancelClose, [cancelClose]);
  return { open, setOpen, openNow, scheduleClose, cancelClose };
}

function TopNavGroup({ item, selectedKey }: ItemProps) {
  const { children } = item;
  const isSelected = isTreeItemSelected(item, selectedKey);
  const label = useMenuItemLabel(item);
  const { open, setOpen, openNow, scheduleClose, cancelClose } = useHoverMenu();

  return (
    <div onMouseEnter={openNow} onMouseLeave={scheduleClose}>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="default"
              className={navButtonClass(isSelected)}
            >
              <ItemIcon icon={item.meta?.icon ?? item.icon} isSelected={isSelected} />
              <span className="line-clamp-1">{label}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent
          align="start"
          className="min-w-52"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {children?.map((child: TreeMenuItem) => (
            <TopNavDropdownItem
              key={child.key || child.name}
              item={child}
              selectedKey={selectedKey}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Trailing overflow menu: the top-level items that didn't fit inline. Each group
// becomes a nested submenu; a bare link stays a link.
function MoreMenu({
  items,
  selectedKey,
}: {
  items: TreeMenuItem[];
  selectedKey?: string;
}) {
  const translate = useTranslate();
  const label = translate("shell.more", "More");
  const { open, setOpen, openNow, scheduleClose, cancelClose } = useHoverMenu();
  const isActive = items.some((it) => isTreeItemSelected(it, selectedKey));

  return (
    <div onMouseEnter={openNow} onMouseLeave={scheduleClose}>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="default"
              className={navButtonClass(isActive)}
            >
              <ItemIcon icon={<MoreHorizontal />} isSelected={isActive} />
              <span className="line-clamp-1">{label}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent
          align="end"
          className="min-w-52"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {items.map((item: TreeMenuItem) => (
            <TopNavDropdownItem
              key={item.key || item.name}
              item={item}
              selectedKey={selectedKey}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TopNavDropdownItem({ item, selectedKey }: ItemProps) {
  const Link = useLink();
  const isSelected = isTreeItemSelected(item, selectedKey);
  const label = useMenuItemLabel(item);

  // Items with children (a group in the More menu, or any 3rd level) render as a
  // nested submenu.
  if (item.children && item.children.length > 0) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          <ItemIcon icon={item.meta?.icon ?? item.icon} isSelected={isSelected} />
          <span>{label}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-48">
          {item.children.map((child: TreeMenuItem) => (
            <TopNavDropdownItem
              key={child.key || child.name}
              item={child}
              selectedKey={selectedKey}
            />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <DropdownMenuItem
      render={
        <Link
          to={item.route || ""}
          className={cn("flex w-full items-center gap-2", {
            "bg-accent text-accent-foreground": isSelected,
          })}
        />
      }
    >
      <ItemIcon icon={item.meta?.icon ?? item.icon} isSelected={isSelected} />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function TopNavLink({ item, selectedKey }: ItemProps) {
  const Link = useLink();
  const isSelected = isTreeItemSelected(item, selectedKey);
  const label = useMenuItemLabel(item);

  return (
    <Button
      render={<Link to={item.route || ""} className="flex items-center gap-2" />}
      variant="ghost"
      size="default"
      className={navButtonClass(isSelected)}
    >
      <ItemIcon icon={item.meta?.icon ?? item.icon} isSelected={isSelected} />
      <span className="line-clamp-1">{label}</span>
    </Button>
  );
}

// Non-interactive visual clones used only inside the hidden measurement row so
// the widths match the real inline buttons exactly.
function MeasureItem({ item, selectedKey }: ItemProps) {
  const isGroup = Boolean(item.children && item.children.length > 0);
  const isSelected = isTreeItemSelected(item, selectedKey);
  const label = useMenuItemLabel(item);
  return (
    <Button
      variant="ghost"
      size="default"
      tabIndex={-1}
      className={navButtonClass(isSelected)}
    >
      <ItemIcon icon={item.meta?.icon ?? item.icon} isSelected={isSelected} />
      <span className="line-clamp-1">{label}</span>
      {isGroup && (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
    </Button>
  );
}

function MoreButtonVisual() {
  const translate = useTranslate();
  const label = translate("shell.more", "More");
  return (
    <Button
      variant="ghost"
      size="default"
      tabIndex={-1}
      className={navButtonClass(false)}
    >
      <ItemIcon icon={<MoreHorizontal />} />
      <span className="line-clamp-1">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Button>
  );
}

function useMenuItemLabel(item: TreeMenuItem) {
  const translate = useTranslate();
  const getUserFriendlyName = useUserFriendlyName();
  return getResourceLabel(
    item,
    "plural",
    translate,
    getUserFriendlyName,
    item.name
  );
}

function isTreeItemSelected(item: TreeMenuItem, selectedKey?: string) {
  return (
    item.key === selectedKey || Boolean(selectedKey?.startsWith(`${item.key}/`))
  );
}

function ItemIcon({
  icon,
  isSelected,
}: {
  icon: React.ReactNode;
  isSelected?: boolean;
}) {
  return (
    <div
      className={cn("w-4", {
        "text-muted-foreground": !isSelected,
        "text-primary": isSelected,
      })}
    >
      {icon ?? <ListIcon />}
    </div>
  );
}

TopNav.displayName = "TopNav";
