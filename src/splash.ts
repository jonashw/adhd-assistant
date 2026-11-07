/* The loading screen lives in index.html so it shows before any script runs. Fade it out once the app is ready. */
export function hideSplash() {
    const splash = document.getElementById("splash");
    if (!splash || splash.classList.contains("gone")) return;
    splash.classList.add("gone");
    window.setTimeout(() => splash.remove(), 500);
}
