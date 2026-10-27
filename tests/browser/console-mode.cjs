/* The page opens with the "Briefing" sidebar, which hides the Console-only facets.
   Most suites exercise those facets, so they switch to "Consolă" after every load,
   as a user would. The default itself is checked in smoke.cjs without this helper. */
async function useConsole(ctx) {
  await ctx.addInitScript(() => {
    const obs = new MutationObserver(() => {
      if (!document.querySelector("#facets .facet")) return; // buildSidebar has wired the tabs
      const tab = document.querySelector('.stab[data-mode="console"]');
      if (!tab) return;
      obs.disconnect();
      if (tab.getAttribute("aria-pressed") !== "true") tab.click();
    });
    document.addEventListener("DOMContentLoaded", () => obs.observe(document.body, { childList: true, subtree: true }));
  });
}

module.exports = { useConsole };
