class I18nHelper {
  constructor() {
    this.translations = null;
    this.currentLang = localStorage.getItem("lang") || "uk";
  }

  async loadTranslations() {
    if (this.translations) return this.translations;
    const response = await fetch("i18n.json");
    if (!response.ok) {
      throw new Error("Unable to load i18n.json");
    }
    this.translations = await response.json();
    return this.translations;
  }

  t(key, fallback = "") {
    if (!this.translations) return fallback || key;
    const keys = key.split(".");
    let value = this.translations[this.currentLang];
    for (const k of keys) {
      if (value && Object.prototype.hasOwnProperty.call(value, k)) {
        value = value[k];
      } else {
        return fallback || key;
      }
    }
    return typeof value === "string" ? value : fallback || key;
  }

  applyTranslations(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = this.t(key, el.textContent);
    });

    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", this.t(key, el.getAttribute("placeholder") || ""));
    });

    document.documentElement.lang = this.currentLang;
  }

  async init() {
    await this.loadTranslations();
    this.applyTranslations();
  }

  async setLanguage(lang) {
    this.currentLang = lang;
    localStorage.setItem("lang", lang);
    await this.loadTranslations();
    this.applyTranslations();
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
  }

  bindSwitcher(selectId = "languageSwitcher") {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.value = this.currentLang;
    select.addEventListener("change", async (event) => {
      await this.setLanguage(event.target.value);
    });
  }
}

window.i18nHelper = new I18nHelper();
window.t = (key, fallback = "") => window.i18nHelper.t(key, fallback);
