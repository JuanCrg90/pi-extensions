/** Standalone educational panel; does not change timeline filters or events. */
function initializeEventGuide({ closeStatePanel }) {
  const toggle = document.getElementById("event-guide-toggle");
  const dialog = document.getElementById("event-guide");
  const close = document.getElementById("event-guide-close");
  const search = document.getElementById("event-guide-search");
  const status = document.getElementById("event-guide-status");
  const retry = document.getElementById("event-guide-retry");
  const list = document.getElementById("event-guide-list");
  let entries = null;
  let loading = false;

  function render() {
    const query = search.value.trim().toLowerCase();
    list.replaceChildren();
    let count = 0;
    for (const category of ["session", "agent", "prompt", "tool", "provider"]) {
      const matches = entries.filter((entry) => entry.category === category &&
        `${entry.type} ${entry.category} ${entry.description} ${entry.inspect}`.toLowerCase().includes(query));
      if (!matches.length) continue;
      count += matches.length;
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.className = "state-section-title";
      heading.textContent = category;
      section.appendChild(heading);
      for (const entry of matches) {
        const item = document.createElement("details");
        item.className = "guide-entry";
        const summary = document.createElement("summary");
        const name = document.createElement("code");
        name.textContent = entry.type;
        summary.appendChild(name);
        const description = document.createElement("p");
        description.textContent = entry.description;
        const inspect = document.createElement("p");
        inspect.className = "guide-inspect";
        const label = document.createElement("strong");
        label.textContent = "What to inspect: ";
        inspect.append(label, entry.inspect);
        item.append(summary, description, inspect);
        section.appendChild(item);
      }
      list.appendChild(section);
    }
    status.textContent = count ? `${count} event types. Expand an event for its meaning and payload tips.` :
      "No matching event types. Try a different name, category, or keyword.";
  }

  async function load() {
    if (loading || entries) return;
    loading = true;
    status.textContent = "Loading event reference…";
    retry.hidden = true;
    try {
      const response = await fetch("/api/event-types");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      entries = await response.json();
      render();
    } catch {
      entries = null;
      status.textContent = "Could not load the event reference. Try again when the debugger is connected.";
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }

  toggle.addEventListener("click", () => {
    closeStatePanel();
    dialog.showModal();
    toggle.classList.add("active");
    toggle.setAttribute("aria-expanded", "true");
    search.focus();
    load();
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", (event) => {
    // Search inputs can otherwise consume Escape to clear their value first.
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener("click", (event) => {
    // The native backdrop targets the dialog; blank space inside it must not close it.
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener("close", () => {
    toggle.classList.remove("active");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  });
  search.addEventListener("input", () => { if (entries) render(); });
  retry.addEventListener("click", load);
}
