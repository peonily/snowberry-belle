function getCurrentFile() {
  return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
}

function isShopPage() {
  const file = getCurrentFile();
  return file === "shop" || file === "shop.html";
}

function getCurrentHash() {
  return window.location.hash.toLowerCase();
}

function getQueryParam(name) {
  const search = window.location.search || "";
  if (window.URLSearchParams) {
    return new URLSearchParams(search).get(name) || "";
  }

  const raw = search.replace(/^\?/, "");
  if (!raw) return "";

  const pairs = raw.split("&");
  for (let i = 0; i < pairs.length; i += 1) {
    const part = pairs[i].split("=");
    const key = decodeURIComponent(part[0] || "");
    if (key.toLowerCase() === name.toLowerCase()) {
      return decodeURIComponent(part[1] || "");
    }
  }
  return "";
}

function getNormalizedQueryParam(name) {
  return getQueryParam(name).toLowerCase();
}

function isHomePage() {
  const file = getCurrentFile();
  return file === "" || file === "index.html";
}

function isProductPage() {
  return Boolean(
    document.querySelector('meta[name="page:type"][content="product"]') ||
      document.querySelector('meta[property="og:type"][content="product"]')
  );
}

function ensureShopLinks() {
  document.querySelectorAll(".menu").forEach((menu) => {
    if (menu.querySelector('a[href="shop.html"]')) return;

    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = "shop.html";
    link.textContent = "Shop";
    item.appendChild(link);

    const blogItem = Array.from(menu.querySelectorAll("li")).find((entry) => {
      const anchor = entry.querySelector("a");
      return anchor && (anchor.getAttribute("href") || "").toLowerCase().includes("blog.html");
    });

    if (blogItem) {
      menu.insertBefore(item, blogItem);
    } else {
      menu.appendChild(item);
    }
  });

  document.querySelectorAll(".footer-links").forEach((group) => {
    if (group.querySelector('a[href="shop.html"]')) return;

    const link = document.createElement("a");
    link.href = "shop.html";
    link.textContent = "Shop";

    const blogLink = Array.from(group.querySelectorAll("a")).find((entry) =>
      ((entry.getAttribute("href") || "").toLowerCase().includes("blog.html"))
    );

    if (blogLink) {
      group.insertBefore(link, blogLink);
    } else {
      group.appendChild(link);
    }
  });
}

function setupReveal() {
  const revealItems = document.querySelectorAll(".reveal");
  if (!revealItems.length) return;

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => {
      item.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries, observerInstance) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observerInstance.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -24px 0px" }
  );

  revealItems.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index * 55, 220)}ms`;
    observer.observe(item);
  });
}

function setupYear() {
  const yearNode = document.querySelector("[data-year]");
  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }
}

function setupHeaderSearch() {
  document.querySelectorAll(".site-header .nav").forEach((nav) => {
    if (nav.querySelector(".header-search")) return;

    const form = document.createElement("form");
    form.className = "header-search";
    form.action = "blog.html";
    form.method = "get";
    form.setAttribute("role", "search");
    form.setAttribute("aria-label", "Search Snowberry Belle");

    const input = document.createElement("input");
    input.className = "header-search__input";
    input.type = "search";
    input.name = "search";
    input.placeholder = "Search blog";
    input.autocomplete = "off";
    input.value = getQueryParam("search");

    const button = document.createElement("button");
    button.className = "header-search__button";
    button.type = "submit";
    button.innerHTML = "<span>Search</span>";

    form.append(input, button);
    nav.appendChild(form);
  });
}

function setupBlogSearch() {
  const searchTerm = getQueryParam("search").trim().toLowerCase();
  if (!searchTerm) return;

  const cards = Array.from(document.querySelectorAll(".blog-card"));
  if (!cards.length) return;

  let visibleCount = 0;
  cards.forEach((card) => {
    const isMatch = card.textContent.toLowerCase().includes(searchTerm);
    card.hidden = !isMatch;
    if (isMatch) visibleCount += 1;
  });

  const introCopy = document.querySelector(".blog-intro-copy");
  if (introCopy) {
    const clearLink = document.createElement("a");
    clearLink.className = "shop-search-reset";
    clearLink.href = "blog.html";
    clearLink.textContent = "Clear search";
    introCopy.textContent = visibleCount
      ? `Showing ${visibleCount} article${visibleCount === 1 ? "" : "s"} for "${getQueryParam("search").trim()}".`
      : `No articles matched "${getQueryParam("search").trim()}".`;
    introCopy.append(" ", clearLink);
  }
}

function setupSharedFooter() {
  const footerMount = document.querySelector("[data-shared-footer]") || document.querySelector("footer.site-footer");
  if (!footerMount) return;

  footerMount.outerHTML = `
    <footer class="site-footer">
      <div>
        <strong>Snowberry Belle</strong><br>
        <span>Curated feminine fashion for dreamy, modern wardrobes.</span><br>
        <span class="footer-disclosure">This website is a participant in the Amazon Services LLC Associates Program. As an Amazon Associate, we earn from qualifying purchases at no additional cost to you.</span>
      </div>
      <div class="footer-links">
        <a href="index.html#home">Home</a>
        <a href="blog.html">Blog</a>
        <a href="about.html">About Us</a>
        <a href="index.html#categories">Categories</a>
        <a href="contact.html">Contact Us</a>
        <a href="privacy-policy.html">Privacy Policy</a>
        <a href="affiliate-disclosure.html">Affiliate Disclosure</a>
      </div>
      <div>&copy; <span data-year></span> Snowberry Belle</div>
    </footer>
  `.trim();
}

function updatePrimaryActiveStates() {
  const links = document.querySelectorAll(".menu a");
  if (!links.length) return;

  const currentFile = getCurrentFile();
  const currentHash = getCurrentHash();
  const isBlogPage = currentFile === "blog.html" || currentFile.startsWith("blog-");
  const isAboutPage = currentFile === "about.html";
  const isContactPage = currentFile === "contact.html";
  const isShopArea = isShopPage() || isProductPage();

  links.forEach((link) => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    let isActive = false;

    if (href === "shop.html") {
      isActive = isShopArea;
    } else if (href.includes("blog.html")) {
      isActive = isBlogPage;
    } else if (href.includes("about.html")) {
      isActive = isAboutPage;
    } else if (href.includes("contact.html")) {
      isActive = isContactPage;
    } else if (href.includes("#categories")) {
      isActive = isHomePage() && currentHash === "#categories";
    } else if (href.includes("#home")) {
      isActive = isHomePage() && (currentHash === "" || currentHash === "#home" || currentHash === "#lookbook");
    }

    if (isActive) {
      link.setAttribute("aria-current", "page");
      link.classList.add("active");
    } else {
      link.removeAttribute("aria-current");
      link.classList.remove("active");
    }
  });
}

function setupMobileMenu() {
  const body = document.body;
  const header = document.querySelector(".site-header");
  const nav = header ? header.querySelector(".nav") : null;
  const menu = nav ? nav.querySelector(".menu") : null;
  if (!body || !header || !nav || !menu) return;

  body.classList.add("nav-enhanced");

  let toggle = nav.querySelector(".menu-toggle");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "menu-toggle";
    toggle.setAttribute("aria-label", "Toggle navigation");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<span class="menu-toggle-bar"></span><span class="menu-toggle-bar"></span><span class="menu-toggle-bar"></span>';
    nav.insertBefore(toggle, menu);
  }

  const closeMenu = () => {
    header.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    body.classList.remove("menu-open");
  };

  toggle.addEventListener("click", () => {
    const nextOpen = !header.classList.contains("is-open");
    header.classList.toggle("is-open", nextOpen);
    toggle.setAttribute("aria-expanded", String(nextOpen));
    body.classList.toggle("menu-open", nextOpen);
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (event) => {
    if (!header.classList.contains("is-open")) return;
    if (!header.contains(event.target)) closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 768) closeMenu();
  });
}

function setupBottomNav() {
  if (document.querySelector(".mobile-bottom-nav")) return;

  const nav = document.createElement("nav");
  nav.className = "mobile-bottom-nav";
  nav.setAttribute("aria-label", "Quick navigation");

  const links = [
    { label: "Home", href: "index.html#home" },
    { label: "Shop", href: "shop.html" },
    { label: "Categories", href: "index.html#categories" },
    { label: "Blog", href: "blog.html" }
  ];

  links.forEach((item) => {
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.label;
    link.dataset.bottomNav = item.label.toLowerCase();
    nav.appendChild(link);
  });

  document.body.appendChild(nav);
}

function updateBottomNavActiveStates() {
  const links = document.querySelectorAll(".mobile-bottom-nav a");
  if (!links.length) return;

  const currentFile = getCurrentFile();
  const currentHash = getCurrentHash();
  const isShopArea = isShopPage() || isProductPage();

  links.forEach((link) => {
    const key = link.dataset.bottomNav;
    let isActive = false;

    if (key === "shop") {
      isActive = isShopArea;
    } else if (key === "blog") {
      isActive = currentFile === "blog.html" || currentFile.startsWith("blog-");
    } else if (key === "categories") {
      isActive = isHomePage() && currentHash === "#categories";
    } else if (key === "home") {
      isActive = isHomePage() && (currentHash === "" || currentHash === "#home" || currentHash === "#lookbook");
    }

    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function setupShopCatalog() {
  if (!isShopPage()) return;

  const sections = Array.from(document.querySelectorAll(".shop-section"));
  if (!sections.length) return;

  const pageSize = 5;
  const rawSearchTerm = getQueryParam("search").trim();
  const searchTerm = rawSearchTerm.toLowerCase();
  const categoryLinks = Array.from(document.querySelectorAll("[data-shop-category-link]"));
  const browserCopy = document.querySelector(".shop-browser__copy");
  let activeCategoryId = sections[0].id;

  if (searchTerm && browserCopy) {
    const resetLink = document.createElement("a");
    resetLink.className = "shop-search-reset";
    resetLink.href = "shop.html";
    resetLink.textContent = "Clear search";
    browserCopy.textContent = `Showing catalog matches for "${rawSearchTerm}".`;
    browserCopy.append(" ", resetLink);
  }

  const updateSectionVisibility = (categoryId) => {
    sections.forEach((section) => {
      section.hidden = searchTerm && section.dataset.searchMatch !== "true";
    });

    if (searchTerm && !sections.some((section) => !section.hidden)) {
      sections[0].hidden = false;
    }

    const activeSection = sections.find((section) => section.id === categoryId);
    if (activeSection) {
      activeSection.classList.add("is-visible");
    }
  };

  const setActiveCategory = (categoryId) => {
    const resolvedCategoryId = sections.find((section) => section.id === categoryId)
      ? categoryId
      : sections[0].id;
    activeCategoryId = resolvedCategoryId;
    sections.forEach((section) => {
      const isSearchMatch = searchTerm && section.dataset.searchMatch === "true";
      section.classList.toggle("is-active-category", isSearchMatch || section.id === resolvedCategoryId);
    });

    categoryLinks.forEach((link) => {
      const isActive = !searchTerm && link.dataset.shopCategoryLink === resolvedCategoryId;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    updateSectionVisibility(resolvedCategoryId);
  };

  sections.forEach((section) => {
    const cards = Array.from(section.querySelectorAll(".productCard"));
    const visibleCards = searchTerm
      ? cards.filter((card) => card.textContent.toLowerCase().includes(searchTerm))
      : cards;
    const countNode = section.querySelector("[data-category-count]");
    const paginationNode = section.querySelector("[data-shop-pagination]");
    const navCountNode = document.querySelector(`[data-shop-category-link="${section.id}"] [data-shop-category-count]`);
    const totalProducts = visibleCards.length;
    const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
    let currentPage = 1;

    if (searchTerm) {
      section.dataset.searchMatch = totalProducts > 0 ? "true" : "false";
    }

    if (navCountNode) {
      navCountNode.textContent = String(cards.length);
    }

    const updateCount = (startIndex, endIndex) => {
      if (!countNode) return;

      if (totalProducts === 0) {
        countNode.textContent = searchTerm
          ? `No products match "${searchTerm}" in this category.`
          : "No products in this category yet.";
        return;
      }

      if (totalPages === 1) {
        countNode.textContent = searchTerm
          ? `${totalProducts} result${totalProducts === 1 ? "" : "s"} for "${searchTerm}".`
          : `${totalProducts} product${totalProducts === 1 ? "" : "s"} in this category.`;
        return;
      }

      countNode.textContent = searchTerm
        ? `Showing ${startIndex + 1}-${endIndex} of ${totalProducts} results for "${searchTerm}".`
        : `Showing ${startIndex + 1}-${endIndex} of ${totalProducts} products.`;
    };

    const renderPagination = () => {
      if (!paginationNode) return;

      paginationNode.innerHTML = "";

      if (totalProducts <= pageSize) {
        paginationNode.hidden = true;
        return;
      }

      paginationNode.hidden = false;

      const makeButton = (label, nextPage, options = {}) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "shopPagination__button";
        button.textContent = label;
        button.disabled = Boolean(options.disabled);
        if (options.active) {
          button.classList.add("is-active");
          button.setAttribute("aria-current", "page");
        }
        button.addEventListener("click", () => {
          currentPage = nextPage;
          render();
        });
        paginationNode.appendChild(button);
      };

      makeButton("Prev", currentPage - 1, { disabled: currentPage === 1 });

      for (let page = 1; page <= totalPages; page += 1) {
        makeButton(String(page), page, { active: page === currentPage });
      }

      makeButton("Next", currentPage + 1, { disabled: currentPage === totalPages });
    };

    const render = () => {
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalProducts);

      cards.forEach((card) => {
        const visibleIndex = visibleCards.indexOf(card);
        card.hidden = visibleIndex < startIndex || visibleIndex >= endIndex;
      });

      updateCount(startIndex, endIndex);
      renderPagination();
    };

    render();
  });

  const scrollToCategory = (categoryId, behavior = "smooth") => {
    const targetSection = sections.find((section) => section.id === categoryId);
    if (!targetSection) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    targetSection.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : behavior,
      block: "start"
    });
  };

  const syncActiveCategoryFromLocation = () => {
    const requestedCategory = getNormalizedQueryParam("category");
    const hashCategory = getCurrentHash().replace("#", "");
    const activeCategory = sections.find((section) => section.id === hashCategory)
      ? hashCategory
      : sections.find((section) => section.id === requestedCategory)
        ? requestedCategory
        : sections[0].id;

    setActiveCategory(activeCategory);

    if (hashCategory || requestedCategory) {
      requestAnimationFrame(() => {
        scrollToCategory(activeCategory);
      });
    }
  };

  categoryLinks.forEach((link) => {
    link.addEventListener("click", () => {
      setActiveCategory(link.dataset.shopCategoryLink || "");
    });
  });

  syncActiveCategoryFromLocation();
  if (document.body) {
    document.body.classList.add("shop-catalog-ready");
  }
  window.addEventListener("hashchange", syncActiveCategoryFromLocation);
}

ensureShopLinks();
setupReveal();
setupSharedFooter();
setupYear();
setupHeaderSearch();
setupBlogSearch();
setupMobileMenu();
setupBottomNav();
setupShopCatalog();
updatePrimaryActiveStates();
updateBottomNavActiveStates();
window.addEventListener("hashchange", () => {
  updatePrimaryActiveStates();
  updateBottomNavActiveStates();
});
