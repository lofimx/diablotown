import { CharacterClass, CHARACTER_CLASSES } from "../game/types";

const config = () => window.__HELLTOWN__;

export interface AuthResult {
  username: string;
  characterClass: CharacterClass;
}

export class IdentityManager {
  private overlay: HTMLElement;
  private input: HTMLInputElement;
  private submitBtn: HTMLElement;
  private errorEl: HTMLElement;
  private hud: HTMLElement;
  private hudUsername: HTMLElement;
  private classSelect: HTMLSelectElement;
  private onAuthenticated: (result: AuthResult) => void;

  constructor(onAuthenticated: (result: AuthResult) => void) {
    this.onAuthenticated = onAuthenticated;
    this.overlay = document.getElementById("identity-overlay")!;
    this.input = document.getElementById("username-input") as HTMLInputElement;
    this.submitBtn = document.getElementById("username-submit")!;
    this.errorEl = document.getElementById("identity-error")!;
    this.hud = document.getElementById("hud")!;
    this.hudUsername = document.getElementById("player-menu-btn")!;
    this.classSelect = document.getElementById("class-select") as HTMLSelectElement;

    this.submitBtn.addEventListener("click", () => this.submit());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.submit();
    });

    // If already authenticated, proceed directly
    if (config().user) {
      this.onAuthenticated({
        username: config().user!.username,
        characterClass: config().user!.character_class || "warrior",
      });
    }
  }

  private async submit() {
    const username = this.input.value.trim();
    if (!username) return;

    const characterClass = (this.classSelect?.value || "warrior") as CharacterClass;

    this.errorEl.textContent = "";
    this.submitBtn.textContent = "...";

    try {
      const res = await fetch("/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": config().csrfToken,
        },
        body: JSON.stringify({ username, character_class: characterClass }),
      });

      const data = await res.json();

      if (!res.ok) {
        this.errorEl.textContent = data.error || "Something went wrong";
        this.submitBtn.textContent = "Enter";
        return;
      }

      const resolvedClass = (data.character_class || characterClass) as CharacterClass;
      config().user = { username: data.username, character_class: resolvedClass };
      this.overlay.style.display = "none";
      this.hud.style.display = "";
      this.hudUsername.textContent = data.username;
      this.onAuthenticated({ username: data.username, characterClass: resolvedClass });
    } catch {
      this.errorEl.textContent = "Connection error";
      this.submitBtn.textContent = "Enter";
    }
  }
}
