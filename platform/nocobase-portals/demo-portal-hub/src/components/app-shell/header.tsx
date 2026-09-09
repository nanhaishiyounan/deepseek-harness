import {
  useActiveAuthProvider,
  useLogout,
  useTranslate,
} from "@refinedev/core";
import { resolveNocoBaseSettingsUrl } from "@nocobase/portal-sdk/runtime";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/app-shell/user-avatar";
import { UserInfo } from "@/components/app-shell/user-info";
import { CanAccess } from "@/components/access-control/can-access";
import { useSidebar } from "@/components/ui/sidebar";
import { LogOutIcon, SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/app-shell/brand";
import { TopNav } from "@/components/app-shell/top-nav";
import { extensionUserMenuItems } from "@/app/extensions";

const pluginSettingsResource = {
  name: "plugin-settings",
  meta: {
    acl: {
      type: "snippet",
      name: "pm.*",
    },
  },
} as const;

export const Header = () => {
  const { isMobile } = useSidebar();

  return <>{isMobile ? <MobileHeader /> : <DesktopHeader />}</>;
};

function DesktopHeader() {
  return (
    <header
      className={cn(
        "sticky",
        "top-0",
        "flex",
        "h-16",
        "shrink-0",
        "items-center",
        "gap-4",
        "border-b",
        "border-border/70",
        "bg-background/80",
        "px-4",
        "justify-between",
        "backdrop-blur-xl",
        "z-40"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Brand logoClassName="h-7" />
        <div className="h-6 w-px shrink-0 bg-border" />
        <TopNav />
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-2">
        <SettingsLink />
        <ThemeToggle />
        <UserDropdown />
      </div>
    </header>
  );
}

function MobileHeader() {
  return (
    <header
      className={cn(
        "sticky",
        "top-0",
        "flex",
        "flex-col",
        "shrink-0",
        "border-b",
        "border-border/70",
        "bg-background/85",
        "backdrop-blur-xl",
        "z-40"
      )}
    >
      <div className="flex h-16 items-center justify-between gap-2 px-3">
        <Brand logoClassName="h-6" />
        <div className="flex shrink-0 items-center gap-1">
          <SettingsLink className="size-9" />
          <ThemeToggle className="size-9" />
          <UserDropdown />
        </div>
      </div>
      <div className="flex border-t border-border/70 px-3 py-1.5">
        <TopNav />
      </div>
    </header>
  );
}

function SettingsLink({ className }: { className?: string }) {
  const translate = useTranslate();
  const label = translate("shell.settings", "Settings");

  return (
    <CanAccess resourceItem={pluginSettingsResource}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              render={
                <a
                  href={resolveNocoBaseSettingsUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              variant="outline"
              size="icon"
              className={cn(
                "size-10 rounded-xl border-border/70 bg-background/60",
                className
              )}
            >
              <SettingsIcon />
              <span className="sr-only">{label}</span>
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </CanAccess>
  );
}

const UserDropdown = () => {
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const translate = useTranslate();

  const authProvider = useActiveAuthProvider();

  if (!authProvider?.getIdentity) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <UserAvatar />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <div className="px-2 py-2">
          <UserInfo />
        </div>
        {extensionUserMenuItems.map(({ id, Component }) => (
          <Component key={id} />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="mt-1 min-h-9 cursor-pointer gap-2 px-2 text-muted-foreground focus:text-foreground"
          onClick={() => {
            logout();
          }}
        >
          <LogOutIcon />
          <span>
            {isLoggingOut
              ? translate("auth.signingOut", "Signing out...")
              : translate("auth.signOut", "Sign out")}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

Header.displayName = "Header";
MobileHeader.displayName = "MobileHeader";
DesktopHeader.displayName = "DesktopHeader";
