import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoutePage } from "./RoutePage.js";

const authenticatedApp = vi.fn(() => <div>Área autenticada</div>);

vi.mock("./App.js", () => ({ App: () => authenticatedApp() }));

describe("páginas públicas", () => {
  it("abre o suporte sem iniciar a sessão do app", () => {
    render(<RoutePage pathname="/suporte/" />);

    expect(screen.getByRole("heading", { name: "Suporte" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "reifison@hotmail.com" })).toHaveAttribute("href", "mailto:reifison@hotmail.com");
    expect(screen.getAllByRole("link", { name: /Privacidade/ })[0]).toHaveAttribute("href", "/privacidade");
    expect(screen.getAllByRole("link", { name: /Voltar ao Conversor/ })[0]).toHaveAttribute("href", "/");
    expect(screen.queryByText("Área autenticada")).not.toBeInTheDocument();
    expect(authenticatedApp).not.toHaveBeenCalled();
  });

  it("abre a política de privacidade sem exigir login e liga de volta ao suporte", () => {
    render(<RoutePage pathname="/privacidade" />);

    expect(screen.getByRole("heading", { name: "Política de Privacidade" })).toBeInTheDocument();
    expect(screen.getByText(/endereço IP e metadados básicos de requisições/)).toBeInTheDocument();
    expect(screen.getByText(/restaurá-la durante sete dias/)).toBeInTheDocument();
    expect(screen.getByText(/reutilização expira depois de sete dias sem abertura/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Suporte/ })[0]).toHaveAttribute("href", "/suporte");
    expect(screen.getAllByRole("link", { name: /Voltar ao Conversor/ })[0]).toHaveAttribute("href", "/");
    expect(authenticatedApp).not.toHaveBeenCalled();
  });
});
