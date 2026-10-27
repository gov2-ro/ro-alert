/* The page opens with the "Briefing" sidebar, which shows only the risk categories.
   Most suites exercise search, dates and other facets, so they follow "Mai multe filtre" after every load,
   as a user would. The default itself is checked in smoke.cjs without this helper. */
async function useConsole(ctx) {
  await ctx.addInitScript(() => {
    const obs = new MutationObserver(() => {
      if (!document.querySelector("#facets .facet")) return; // buildSidebar has wired the tabs
      const link = document.getElementById("mode-toggle");
      if (!link) return;
      obs.disconnect();
      if (document.getElementById("sidebar").dataset.mode !== "console") link.click();
    });
    document.addEventListener("DOMContentLoaded", () => obs.observe(document.body, { childList: true, subtree: true }));
  });
}

module.exports = { useConsole };
