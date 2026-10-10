/**
 * Nav menu block: chrome only. It renders the `sidebar.nav` registrants'
 * rows (one per function page, each carrying its own icon, label, badge, and
 * active styling) inside the sidebar's host seat. Wide state renders
 * icon+label rows; the sidebar rail renders icon-only rows (registrants hide
 * their labels and tooltips take over). The block owns no column chrome —
 * the sidebar does — and clamps its own height so an ever-growing menu
 * scrolls instead of starving the session browser below it.
 */
import clsx from 'clsx'
import type { NavRootComponentProps } from './contract/slots.ts'
import css from './NavRoot.module.css'

/**
 * Render the nav menu block.
 * @param props - composed slot props (host owner share, contract/slots.ts).
 * @returns the menu block element tree.
 */
export function NavRoot({ wide, t, renderSlot }: NavRootComponentProps) {
  return (
    <nav className={clsx(css.menu, !wide && css.rail)} aria-label={t('menu.region')} data-nav-block="">
      {renderSlot('sidebar.nav', { wide })}
    </nav>
  )
}
