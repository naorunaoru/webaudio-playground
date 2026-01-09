import { useState, useCallback, type PointerEvent as ReactPointerEvent } from "react";

export interface UseContextMenuResult {
  /** Props to spread on the element that triggers the context menu */
  contextMenuProps: {
    onContextMenu: (e: React.MouseEvent) => void;
  };
  /** Props to spread on the Menu component */
  menuProps: {
    open: boolean;
    onClose: () => void;
    anchorPosition: { x: number; y: number } | undefined;
  };
  /** Function to close the menu programmatically */
  closeMenu: () => void;
  /** Whether the menu is currently open */
  isOpen: boolean;
}

/**
 * Hook for easily attaching context menus to elements.
 *
 * @example
 * ```tsx
 * const { contextMenuProps, menuProps, closeMenu } = useContextMenu();
 *
 * return (
 *   <>
 *     <div {...contextMenuProps}>Right-click me</div>
 *     <Menu {...menuProps}>
 *       <MenuItem onClick={() => { doSomething(); closeMenu(); }}>
 *         Action
 *       </MenuItem>
 *     </Menu>
 *   </>
 * );
 * ```
 */
export function useContextMenu(): UseContextMenuResult {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>(
    undefined
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    contextMenuProps: {
      onContextMenu: handleContextMenu,
    },
    menuProps: {
      open: isOpen,
      onClose: closeMenu,
      anchorPosition: position,
    },
    closeMenu,
    isOpen,
  };
}
