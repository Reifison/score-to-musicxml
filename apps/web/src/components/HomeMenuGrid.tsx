import { Heart, Music, Settings, Trash2, UserRound } from "lucide-react";
import type { ReactNode } from "react";

type HomeMenuItem = {
  label: string;
  color: string;
  iconColor?: string;
  icon: ReactNode;
  onClick: () => void;
};

export function HomeMenuGrid({ onNavigate }: { onNavigate: (view: "scores" | "favorites" | "settings" | "profile" | "trash") => void }) {
  const items: HomeMenuItem[] = [
    {
      label: "Minhas partituras",
      color: "#F06432",
      icon: <Music size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("scores")
    },
    {
      label: "Favoritas",
      color: "var(--surface-soft)",
      iconColor: "var(--brand)",
      icon: <Heart size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("favorites")
    },
    {
      label: "Configurações",
      color: "var(--surface-soft)",
      iconColor: "var(--muted)",
      icon: <Settings size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("settings")
    },
    {
      label: "Perfil",
      color: "var(--surface-soft)",
      iconColor: "var(--muted)",
      icon: <UserRound size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("profile")
    },
    {
      label: "Lixeira",
      color: "var(--surface-soft)",
      iconColor: "var(--muted)",
      icon: <Trash2 size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("trash")
    }
  ];

  return (
    <section className="home-menu-grid" aria-label="Menu principal">
      {items.map((item) => (
        <button key={item.label} className="home-menu-item" onClick={item.onClick} type="button">
          <span className="home-menu-icon" style={{ background: item.color, color: item.iconColor ?? "oklch(0.985 0.008 70)" }}>
            {item.icon}
          </span>
          <span className="home-menu-label">{item.label}</span>
        </button>
      ))}
    </section>
  );
}
