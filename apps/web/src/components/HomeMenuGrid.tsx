import { Heart, Music, Settings, UserRound } from "lucide-react";
import type { ReactNode } from "react";

type HomeMenuItem = {
  label: string;
  color: string;
  icon: ReactNode;
  onClick: () => void;
};

export function HomeMenuGrid({ onNavigate }: { onNavigate: (view: "scores" | "favorites" | "settings" | "profile") => void }) {
  const items: HomeMenuItem[] = [
    {
      label: "Minhas partituras",
      color: "#5347ce",
      icon: <Music size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("scores")
    },
    {
      label: "Favoritas",
      color: "#d3988d",
      icon: <Heart size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("favorites")
    },
    {
      label: "Configurações",
      color: "#4896fe",
      icon: <Settings size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("settings")
    },
    {
      label: "Perfil",
      color: "#9282ce",
      icon: <UserRound size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("profile")
    }
  ];

  return (
    <section className="home-menu-grid" aria-label="Menu principal">
      {items.map((item) => (
        <button key={item.label} className="home-menu-item" onClick={item.onClick} type="button">
          <span className="home-menu-icon" style={{ background: item.color }}>
            {item.icon}
          </span>
          <span className="home-menu-label">{item.label}</span>
        </button>
      ))}
    </section>
  );
}
