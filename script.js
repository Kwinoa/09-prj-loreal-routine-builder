/* ---------- DOM references ---------- */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedCount = document.getElementById("selectedCount");
const clearSelectionsBtn = document.getElementById("clearSelections");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

/* ---------- App state ---------- */
let allProducts = [];
let selectedIds = new Set();
let conversationHistory = [];

const WORKER_API_URL = "https://loreal-worker.kalinathi86.workers.dev";
const OPENAI_MODEL = "gpt-4o";
const SELECTED_STORAGE_KEY = "loreal_selected_products";

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products.
  </div>
`;

chatWindow.innerHTML = `
  <div class="chat-message assistant-message">
    Hi! Select products, generate your routine, then ask follow-up questions.
  </div>
`;

/* ---------- Helpers ---------- */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveSelections() {
  localStorage.setItem(
    SELECTED_STORAGE_KEY,
    JSON.stringify(Array.from(selectedIds))
  );
}

function loadSelectionsFromStorage() {
  const saved = localStorage.getItem(SELECTED_STORAGE_KEY);
  if (!saved) {
    return;
  }

  try {
    const parsedIds = JSON.parse(saved);
    if (Array.isArray(parsedIds)) {
      selectedIds = new Set(parsedIds);
    }
  } catch (error) {
    console.error("Could not parse saved selections:", error);
  }
}

function getSelectedProducts() {
  return allProducts.filter((product) => selectedIds.has(product.id));
}

function addChatMessage(role, text) {
  const roleClass = role === "user" ? "user-message" : "assistant-message";
  const messageHtml = `
    <div class="chat-message ${roleClass}">
      ${escapeHtml(text).replaceAll("\n", "<br>")}
    </div>
  `;

  chatWindow.insertAdjacentHTML("beforeend", messageHtml);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* ---------- Product rendering ---------- */
function renderSelectedProducts() {
  const selectedProducts = getSelectedProducts();
  selectedCount.textContent = `${selectedProducts.length} product${
    selectedProducts.length === 1 ? "" : "s"
  } selected`;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML =
      '<p class="empty-selected">No products selected yet.</p>';
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-item" data-id="${product.id}">
        <span>${product.brand} - ${product.name}</span>
        <button type="button" class="remove-selected-btn" data-id="${product.id}">
          Remove
        </button>
      </div>
    `
    )
    .join("");
}

function renderProductGrid(products) {
  if (products.length === 0) {
    productsContainer.innerHTML =
      '<div class="placeholder-message">No products found in this category.</div>';
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedIds.has(product.id);

      return `
      <article
        class="product-card ${isSelected ? "selected" : ""}"
        data-id="${product.id}"
        role="button"
        tabindex="0"
        aria-pressed="${isSelected}"
        aria-label="Select ${product.name}"
      >
        <img src="${product.image}" alt="${product.name}">
        <div class="product-info">
          <h3>${product.name}</h3>
          <p class="brand-name">${product.brand}</p>
          <p class="category-pill">${product.category}</p>
          <button type="button" class="description-toggle" data-id="${product.id}">
            Show Description
          </button>
          <p class="product-description" id="desc-${product.id}" hidden>
            ${product.description}
          </p>
        </div>
      </article>
    `;
    })
    .join("");
}

function renderFilteredProducts() {
  const selectedCategory = categoryFilter.value;

  if (!selectedCategory) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category to view products.
      </div>
    `;
    return;
  }

  const filteredProducts = allProducts.filter(
    (product) => product.category === selectedCategory
  );

  renderProductGrid(filteredProducts);
}

/* ---------- Selection handlers ---------- */
function toggleProductSelection(productId) {
  if (selectedIds.has(productId)) {
    selectedIds.delete(productId);
  } else {
    selectedIds.add(productId);
  }

  saveSelections();
  renderSelectedProducts();
  renderFilteredProducts();
}

productsContainer.addEventListener("click", (event) => {
  const descriptionButton = event.target.closest(".description-toggle");

  if (descriptionButton) {
    event.stopPropagation();
    const id = Number(descriptionButton.dataset.id);
    const descriptionEl = document.getElementById(`desc-${id}`);
    const isHidden = descriptionEl.hasAttribute("hidden");

    if (isHidden) {
      descriptionEl.removeAttribute("hidden");
      descriptionButton.textContent = "Hide Description";
    } else {
      descriptionEl.setAttribute("hidden", "");
      descriptionButton.textContent = "Show Description";
    }

    return;
  }

  const card = event.target.closest(".product-card");
  if (!card) {
    return;
  }

  const productId = Number(card.dataset.id);
  toggleProductSelection(productId);
});

productsContainer.addEventListener("keydown", (event) => {
  const card = event.target.closest(".product-card");

  if (!card) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleProductSelection(Number(card.dataset.id));
  }
});

selectedProductsList.addEventListener("click", (event) => {
  const removeBtn = event.target.closest(".remove-selected-btn");
  if (!removeBtn) {
    return;
  }

  const productId = Number(removeBtn.dataset.id);
  selectedIds.delete(productId);
  saveSelections();
  renderSelectedProducts();
  renderFilteredProducts();
});

clearSelectionsBtn.addEventListener("click", () => {
  selectedIds.clear();
  saveSelections();
  renderSelectedProducts();
  renderFilteredProducts();
});

/* ---------- OpenAI API helpers ---------- */
async function fetchChatCompletion(messages) {
  const response = await fetch(WORKER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "API request failed");
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateRoutineFromSelections() {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    addChatMessage(
      "assistant",
      "Please select at least one product before generating a routine."
    );
    return;
  }

  const productPayload = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const systemMessage = {
    role: "system",
    content:
      "You are a helpful L'Oreal beauty advisor. Keep answers focused on beauty topics such as skincare, haircare, makeup, fragrance, and the user's generated routine. If a user asks unrelated topics, politely redirect back to beauty and routine support.",
  };

  const userMessage = {
    role: "user",
    content: `Build a clear personalized routine using only these selected products:\n${JSON.stringify(
      productPayload,
      null,
      2
    )}\n\nFormat with Morning, Evening, and Weekly tips. Keep it practical and beginner-friendly.`,
  };

  conversationHistory = [systemMessage, userMessage];

  addChatMessage("assistant", "Generating your personalized routine...");

  try {
    generateRoutineBtn.disabled = true;
    generateRoutineBtn.textContent = "Generating...";

    const routineText = await fetchChatCompletion(conversationHistory);

    conversationHistory.push({ role: "assistant", content: routineText });
    addChatMessage("assistant", routineText);
  } catch (error) {
    console.error(error);
    addChatMessage(
      "assistant",
      `I couldn't generate your routine right now: ${error.message}`
    );
  } finally {
    generateRoutineBtn.disabled = false;
    generateRoutineBtn.innerHTML =
      '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Routine';
  }
}

async function handleFollowUpQuestion(question) {
  if (conversationHistory.length === 0) {
    addChatMessage(
      "assistant",
      "Generate a routine first, then I can answer follow-up questions about it."
    );
    return;
  }

  const nextMessages = [...conversationHistory, { role: "user", content: question }];

  try {
    const reply = await fetchChatCompletion(nextMessages);
    conversationHistory = [...nextMessages, { role: "assistant", content: reply }];
    addChatMessage("assistant", reply);
  } catch (error) {
    console.error(error);
    addChatMessage(
      "assistant",
      `I couldn't answer that right now: ${error.message}`
    );
  }
}

/* ---------- Event listeners ---------- */
categoryFilter.addEventListener("change", () => {
  renderFilteredProducts();
});

generateRoutineBtn.addEventListener("click", generateRoutineFromSelections);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = userInput.value.trim();
  if (!question) {
    return;
  }

  addChatMessage("user", question);
  userInput.value = "";

  await handleFollowUpQuestion(question);
});

/* ---------- Start app ---------- */
async function initializeApp() {
  try {
    const response = await fetch("products.json");
    const data = await response.json();
    allProducts = data.products;

    loadSelectionsFromStorage();

    // Keep only valid ids in case the product list changes in the future.
    const validIds = new Set(allProducts.map((product) => product.id));
    selectedIds = new Set(Array.from(selectedIds).filter((id) => validIds.has(id)));

    renderSelectedProducts();
  } catch (error) {
    console.error("Could not load products:", error);
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        We could not load products right now. Please refresh the page.
      </div>
    `;
  }
}

initializeApp();
