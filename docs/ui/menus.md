# Menu Components

Components for building context menus and application menu bars.

## Overview

The menu system provides a unified set of components that serve both context menus (right-click) and dropdown menus from a menu bar. All components integrate with the existing ThemeContext system and follow the codebase's styling patterns (CSS Modules for structure, inline styles for theming).

---

## Menu

The root container that manages positioning, keyboard navigation, and focus.

```typescript
interface MenuProps {
  open: boolean;
  onClose: () => void;
  anchorEl?: HTMLElement | null;       // For dropdown positioning
  anchorPosition?: { x: number; y: number };  // For context menu positioning
  placement?: MenuPlacement;
  children: ReactNode;
  onCloseAll?: () => void;             // Close all menus including parents
  isSubmenu?: boolean;
}

type MenuPlacement =
  | 'bottom-start' | 'bottom-end'
  | 'top-start' | 'top-end'
  | 'right-start' | 'right-end'
  | 'left-start' | 'left-end';
```

**Features:**
- Portal rendering (escapes parent stacking context)
- Viewport collision detection and repositioning
- Fade-in animation (~150ms)
- Escape key closes menu
- Click outside closes menu

**Usage:**

```tsx
const [open, setOpen] = useState(false);
const buttonRef = useRef<HTMLButtonElement>(null);

<button ref={buttonRef} onClick={() => setOpen(true)}>
  Open Menu
</button>

<Menu
  open={open}
  onClose={() => setOpen(false)}
  anchorEl={buttonRef.current}
  placement="bottom-start"
>
  <MenuItem onClick={handleAction}>Action</MenuItem>
</Menu>
```

---

## MenuItem

A clickable menu entry.

```typescript
interface MenuItemProps {
  onClick?: () => void;
  disabled?: boolean;
  shortcut?: string;     // Keyboard shortcut label (display only)
  icon?: ReactNode;      // Leading icon
  children: ReactNode;
}
```

**Behavior:**
- Highlights on hover/focus
- Closes all menus when clicked (unless disabled)
- Supports keyboard activation (Enter/Space)

---

## MenuItemCheckbox

A toggle menu item with checkmark indicator.

```typescript
interface MenuItemCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  shortcut?: string;
  children: ReactNode;
}
```

**Behavior:**
- Shows checkmark when checked
- Does NOT close menu on toggle (allows multiple toggles)
- Supports keyboard activation (Enter/Space)

---

## MenuSeparator

A visual divider between menu sections.

```tsx
<MenuSeparator />
```

---

## SubMenu

A menu item that opens a nested menu.

```typescript
interface SubMenuProps {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}
```

**Behavior:**
- Opens submenu on hover (200ms delay)
- Opens immediately on ArrowRight key
- Closes on ArrowLeft key
- No hard limit on nesting depth
- Submenu repositions to stay within viewport

---

## MenuContent

Wrapper for arbitrary content inside a menu (controls, previews, etc.).

```typescript
interface MenuContentProps {
  children: ReactNode;
}
```

**Usage:**

```tsx
<Menu {...props}>
  <MenuItem>Regular Item</MenuItem>
  <MenuSeparator />
  <MenuContent>
    <div style={{ padding: 12 }}>
      <Knob value={volume} onChange={setVolume} label="Volume" />
    </div>
  </MenuContent>
</Menu>
```

---

## MenuBar

Horizontal menu bar container for application-level menus.

```typescript
interface MenuBarProps {
  children: ReactNode;
  /** Optional className for the container */
  className?: string;
  /** Optional inline styles for the container */
  style?: CSSProperties;
}
```

**Behavior:**
- Click to open first menu
- Hover switches between menus while any menu is open (macOS-style)

**Styling:**
The MenuBar provides only structural styles (flexbox layout) and does not include visual styling (background, border, padding). This allows it to be embedded within custom containers that provide their own visual chrome. Pass `className` or `style` props to customize the appearance.

---

## MenuBarItem

Individual item in the menu bar that triggers a dropdown.

```typescript
interface MenuBarItemProps {
  label: string;
  children: ReactNode;
  index?: number;        // Position in menu bar (for hover switching)
}
```

**Usage:**

```tsx
<MenuBar>
  <MenuBarItem label="File" index={0}>
    <MenuItem shortcut="Ctrl+N">New</MenuItem>
    <MenuItem shortcut="Ctrl+O">Open</MenuItem>
    <MenuSeparator />
    <MenuItem shortcut="Ctrl+S">Save</MenuItem>
    <SubMenu label="Export">
      <MenuItem>Export as WAV</MenuItem>
      <MenuItem>Export as MP3</MenuItem>
    </SubMenu>
  </MenuBarItem>

  <MenuBarItem label="Edit" index={1}>
    <MenuItem shortcut="Ctrl+Z">Undo</MenuItem>
    <MenuItem shortcut="Ctrl+Y">Redo</MenuItem>
  </MenuBarItem>

  <MenuBarItem label="View" index={2}>
    <MenuItemCheckbox checked={showGrid} onChange={setShowGrid}>
      Show Grid
    </MenuItemCheckbox>
  </MenuBarItem>
</MenuBar>
```

---

## useContextMenu Hook

Convenience hook for attaching context menus to elements.

```typescript
interface UseContextMenuResult {
  contextMenuProps: {
    onContextMenu: (e: React.MouseEvent) => void;
  };
  menuProps: {
    open: boolean;
    onClose: () => void;
    anchorPosition: { x: number; y: number } | undefined;
  };
  closeMenu: () => void;
  isOpen: boolean;
}

function useContextMenu(): UseContextMenuResult;
```

**Usage:**

```tsx
function MyComponent() {
  const { contextMenuProps, menuProps, closeMenu } = useContextMenu();
  const [showGrid, setShowGrid] = useState(true);

  return (
    <>
      <div {...contextMenuProps}>
        Right-click me
      </div>

      <Menu {...menuProps}>
        <MenuItem onClick={() => console.log('Cut')}>Cut</MenuItem>
        <MenuItem onClick={() => console.log('Copy')}>Copy</MenuItem>
        <MenuItem onClick={() => console.log('Paste')}>Paste</MenuItem>
        <MenuSeparator />
        <MenuItemCheckbox checked={showGrid} onChange={setShowGrid}>
          Show Grid
        </MenuItemCheckbox>
        <SubMenu label="More Options">
          <MenuItem>Option A</MenuItem>
          <MenuItem>Option B</MenuItem>
        </SubMenu>
      </Menu>
    </>
  );
}
```

---

## Keyboard Navigation

| Key | Action |
| --- | ------ |
| `ArrowDown` | Move to next item |
| `ArrowUp` | Move to previous item |
| `ArrowRight` | Open submenu |
| `ArrowLeft` | Close submenu, return to parent |
| `Enter` / `Space` | Activate focused item |
| `Escape` | Close menu |
| `Home` | Move to first item |
| `End` | Move to last item |

---

## File Structure

```text
src/ui/components/
├── Menu/
│   ├── Menu.tsx
│   ├── Menu.module.css
│   ├── MenuItem.tsx
│   ├── MenuItemCheckbox.tsx
│   ├── MenuSeparator.tsx
│   ├── SubMenu.tsx
│   ├── MenuContent.tsx
│   ├── MenuContext.tsx
│   ├── useContextMenu.ts
│   └── index.ts
├── MenuBar/
│   ├── MenuBar.tsx
│   ├── MenuBar.module.css
│   ├── MenuBarItem.tsx
│   └── index.ts
```

---

## Theming

Menus use colors from ThemeContext:

| Element | Color |
| ------- | ----- |
| Menu background | `chrome.tooltip` |
| Menu border | `chrome.border` |
| Text | `chrome.text` |
| Shortcut text | `chrome.textMuted` |
| Separator | `chrome.border` |
| Focused item background | `theme.primary` |
| Focused item text | `#fff` |
