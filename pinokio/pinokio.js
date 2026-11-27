module.exports = {
  version: "5.0",
  title: "Morningstar CLI",
  icon: "../assets/brand/icon-512.png",
  description: "Terminal coding agent with Ollama models, visible tools and resumable sessions.",
  menu: async (kernel, info) => {
    if (info.running("install.js")) return [{ text: "Installing", icon: "fa-solid fa-spinner", href: "install.js" }];
    if (info.running("start.js")) return [{ text: "Terminal", icon: "fa-solid fa-terminal", href: "start.js" }];
    const menu = [];
    if (info.exists(".installed")) menu.push({ text: "Start with Ollama", icon: "fa-solid fa-play", href: "start.js" });
    menu.push({ text: info.exists(".installed") ? "Rebuild / repair" : "Install", icon: "fa-solid fa-plug", href: "install.js" });
    menu.push({ text: "Instructions", icon: "fa-solid fa-book", href: "https://github.com/morningstarnasser/morningstar-cli/blob/main/docs/distribution.md" });
    return menu;
  }
};
