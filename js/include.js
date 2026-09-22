function loadCommonHead() {
  const head = document.head;

  // Favicon SVG
  if (!document.querySelector('link[rel="icon"][href="/assets/icons/favicon.svg"]')) {
    const faviconSvg = document.createElement("link");
    faviconSvg.rel = "icon";
    faviconSvg.href = "/assets/icons/favicon.svg";
    faviconSvg.type = "image/svg+xml";
    head.appendChild(faviconSvg);
  }

  // Favicon ICO fallback
  if (!document.querySelector('link[rel="icon"][href="/assets/icons/favicon.ico"]')) {
    const faviconIco = document.createElement("link");
    faviconIco.rel = "icon";
    faviconIco.href = "/assets/icons/favicon.ico";
    faviconIco.sizes = "any";
    head.appendChild(faviconIco);
  }
}

async function loadIncludes() {
  const elements = document.querySelectorAll("[data-include]");

  for (const element of elements) {
    const file = element.getAttribute("data-include");

    try {
      const response = await fetch(file);

      if (!response.ok) {
        throw new Error(`Impossibile caricare ${file}`);
      }

      element.innerHTML = await response.text();
    } catch (error) {
      console.error(error);
    }
  }
}

loadCommonHead();
loadIncludes();

function updateBackToTop() {
  const button = document.getElementById("backToTop");

  if (!button) return;

  button.classList.toggle("show", window.scrollY > 300);
}

window.addEventListener("scroll", updateBackToTop, { passive: true });

document.addEventListener("click", function (event) {
  const button = event.target.closest("#backToTop");

  if (!button) return;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});

/* Il footer viene caricato dinamicamente */
const backToTopObserver = new MutationObserver(() => {
  if (document.getElementById("backToTop")) {
    updateBackToTop();
  }
});

backToTopObserver.observe(document.body, {
  childList: true,
  subtree: true
});


