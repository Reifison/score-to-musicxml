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
      color: "#F06432",
      icon: <Music size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("scores")
    },
    {
      label: "Favoritas",
      color: "#D96A54",
      icon: <Heart size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("favorites")
    },
    {
      label: "Configurações",
      color: "#D9992F",
      icon: <Settings size={34} strokeWidth={1.75} />,
      onClick: () => onNavigate("settings")
    },
    {
      label: "Perfil",
      color: "#4D7D91",
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
