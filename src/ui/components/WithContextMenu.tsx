import type { ReactNode } from "react";
import { Menu, MenuItem, useContextMenu } from "./Menu";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface WithContextMenuProps {
  /** The element to wrap with a context menu */
  children: ReactNode;
  /** Menu items to display */
  items: ContextMenuItem[];
}

/**
 * Higher-order component that adds a context menu to any element.
 *
 * @example
 * ```tsx
 * <WithContextMenu items={[{ label: "Reset", onClick: handleReset }]}>
 *   <Knob value={value} onChange={setValue} min={0} max={100} />
 * </WithContextMenu>
 * ```
 */
export function WithContextMenu({ children, items }: WithContextMenuProps) {
  const { contextMenuProps, menuProps, closeMenu } = useContextMenu();

  return (
    <>
      <div {...contextMenuProps} style={{ display: "contents" }}>
        {children}
      </div>
      <Menu {...menuProps}>
        {items.map((item, index) => (
          <MenuItem
            key={index}
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              closeMenu();
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
