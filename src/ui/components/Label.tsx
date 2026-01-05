import { useTheme } from "../context";

export interface LabelProps {
  text: string;
  variant?: "default" | "heading";
}

export function Label({ text, variant = "default" }: LabelProps) {
  const { chrome } = useTheme();

  return (
    <div
      style={{
        fontSize: variant === "heading" ? 12 : 10,
        color: variant === "heading" ? chrome.text : chrome.textMuted,
        marginTop: 4,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}
