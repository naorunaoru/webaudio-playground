import { useTheme } from "@ui/context";

export type LabelPosition = "bottom" | "left" | "right";

export interface LabelProps {
  text: string;
  variant?: "default" | "heading";
  position?: LabelPosition;
}

export function Label({ text, variant = "default", position = "bottom" }: LabelProps) {
  const { chrome } = useTheme();

  const isHorizontal = position === "left" || position === "right";

  return (
    <div
      style={{
        fontSize: variant === "heading" ? 12 : 10,
        color: variant === "heading" ? chrome.text : chrome.textMuted,
        marginTop: isHorizontal ? 0 : 4,
        marginLeft: position === "right" ? 6 : 0,
        marginRight: position === "left" ? 6 : 0,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}
