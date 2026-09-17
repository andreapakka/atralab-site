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

loadIncludes();
