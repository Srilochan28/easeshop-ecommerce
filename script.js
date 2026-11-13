
let products = [];
let cart = [];

// HTML elements
const productGrid = document.getElementById("productGrid");
const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const message = document.getElementById("message");

// Format price in Indian Rupees
function formatPrice(amount) {
    return "₹" + Number(amount).toLocaleString("en-IN");
}

// Get products from MySQL through Node.js
async function loadProducts() {
    try {
        const response = await fetch("/api/products");

        if (!response.ok) {
            throw new Error("Could not load products");
        }

        products = await response.json();

        displayProducts();
        displayCart();

        console.log("Products loaded from backend:", products);

    } catch (error) {
        console.error("Error loading products:", error);

        productGrid.innerHTML =
            '<p class="empty-message">Unable to load products. Please check that the server is running.</p>';
    }
}

// Display products
function displayProducts() {

    const searchTerm = searchInput.value.toLowerCase().trim();
    const category = categoryFilter.value;

    const filteredProducts = products.filter(product => {

        const productCategory = product.category || "General";

        const matchesSearch =
            product.name.toLowerCase().includes(searchTerm) ||
            productCategory.toLowerCase().includes(searchTerm);

        const matchesCategory =
            category === "All" || productCategory === category;

        return matchesSearch && matchesCategory;
    });

    if (filteredProducts.length === 0) {
        productGrid.innerHTML =
            '<p class="empty-message">No products found.</p>';
        return;
    }

    productGrid.innerHTML = filteredProducts.map(product => `
        <article class="product-card">

            <div class="product-image">
                <img
                    src="${product.image_url || ''}"
                    alt="${product.name}"
                    onerror="this.style.display='none'; this.parentElement.textContent='🛍️';"
                >
            </div>

            <div class="product-info">

                <span class="product-category">
                    ${product.category || "General"}
                </span>

                <h3>${product.name}</h3>

                <p class="product-price">
                    ${formatPrice(product.price)}
                </p>

                <button class="add-button" data-add="${product.id}">
                    Add to Cart +
                </button>

            </div>

        </article>
    `).join("");
}

// Add product to cart
function addToCart(id) {

    const item = cart.find(product => product.id === id);

    if (item) {
        item.quantity++;

    } else {

        const product = products.find(product => product.id === id);

        if (!product) return;

        cart.push({
            ...product,
            quantity: 1
        });
    }

    message.textContent = "";

    displayCart();
}

// Change product quantity
function changeQuantity(id, amount) {

    const item = cart.find(product => product.id === id);

    if (!item) return;

    item.quantity += amount;

    if (item.quantity <= 0) {
        cart = cart.filter(product => product.id !== id);
    }

    message.textContent = "";

    displayCart();
}

// Remove product from cart
function removeFromCart(id) {

    cart = cart.filter(product => product.id !== id);

    message.textContent = "";

    displayCart();
}

// Display shopping cart
function displayCart() {

    const totalItems = cart.reduce(
        (sum, item) => sum + item.quantity, 0
    );

    const totalPrice = cart.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity, 0
    );

    cartCount.textContent = totalItems;
    cartTotal.textContent = formatPrice(totalPrice);

    if (cart.length === 0) {

        cartItems.innerHTML =
            '<p class="empty-message">Your cart is empty. Add some products!</p>';

        return;
    }

    cartItems.innerHTML = cart.map(item => `

        <div class="cart-row">

            <div>
                <strong>${item.emoji || "🛍️"} ${item.name}</strong>
                <p>${formatPrice(item.price)} each</p>
            </div>

            <div class="quantity-controls">

                <button data-minus="${item.id}">−</button>

                <span>${item.quantity}</span>

                <button data-plus="${item.id}">+</button>

            </div>

            <strong>
                ${formatPrice(Number(item.price) * item.quantity)}
            </strong>

            <button class="remove-button" data-remove="${item.id}">
                Remove
            </button>

        </div>

    `).join("");
}

// Handle cart buttons
document.addEventListener("click", event => {

    const button = event.target.closest("button");

    if (!button) return;

    if (button.dataset.add) {
        addToCart(Number(button.dataset.add));
    }

    if (button.dataset.plus) {
        changeQuantity(Number(button.dataset.plus), 1);
    }

    if (button.dataset.minus) {
        changeQuantity(Number(button.dataset.minus), -1);
    }

    if (button.dataset.remove) {
        removeFromCart(Number(button.dataset.remove));
    }

});

// Search products
searchInput.addEventListener("input", displayProducts);

// Filter categories
categoryFilter.addEventListener("change", displayProducts);

// Open shopping cart
document.getElementById("cartButton").addEventListener("click", () => {

    document.getElementById("cartSection").scrollIntoView({
        behavior: "smooth"
    });

});

// Clear shopping cart
document.getElementById("clearCart").addEventListener("click", () => {

    cart = [];

    message.textContent = "";

    displayCart();

});

// REAL CHECKOUT - Save orders in MySQL
document.getElementById("checkoutButton").addEventListener("click", async () => {

    // Check whether cart is empty
    if (cart.length === 0) {

        message.textContent =
            "Please add products to your cart first.";

        return;
    }

    // Get customer information
    const customerName =
        document.getElementById("customerName").value.trim();

    const customerEmail =
        document.getElementById("customerEmail").value.trim();

    const deliveryAddress =
        document.getElementById("deliveryAddress").value.trim();

    // Validate customer details
    if (!customerName || !customerEmail || !deliveryAddress) {

        message.textContent =
            "Please fill in all customer details.";

        return;
    }

    // Check email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(customerEmail)) {

        message.textContent =
            "Please enter a valid email address.";

        return;
    }

    const checkoutButton =
        document.getElementById("checkoutButton");

    checkoutButton.disabled = true;
    checkoutButton.textContent = "Processing Order...";

    try {

        // Prepare order information
        const orderData = {

            customer_name: customerName,

            email: customerEmail,

            delivery_address: deliveryAddress,

            items: cart.map(item => ({
                product_id: item.id,
                quantity: item.quantity
            }))

        };

        // Send order to Node.js backend
        const response = await fetch("/api/orders", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(orderData)

        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Unable to place order."
            );
        }

        // Display successful order message
        message.textContent =
            `Order #${result.orderId} placed successfully! ` +
            `Total: ${formatPrice(result.totalAmount)}. ` +
            `Status: ${result.status}.`;

        // Clear cart only after successful order
        cart = [];

        displayCart();

        // Clear customer information
        document.getElementById("customerName").value = "";

        document.getElementById("customerEmail").value = "";

        document.getElementById("deliveryAddress").value = "";

    } catch (error) {

        message.textContent = error.message;

        console.error("Checkout error:", error);

    } finally {

        checkoutButton.disabled = false;
        checkoutButton.textContent = "Place Order";

    }

});

// ORDER HISTORY
document.getElementById("searchOrderButton").addEventListener("click", async () => {

    const orderId =
        document.getElementById("historyOrderId").value.trim();

    const email =
        document.getElementById("historyEmail").value.trim();

    const resultBox =
        document.getElementById("orderHistoryResult");

    if (!orderId || !email) {
        resultBox.textContent = "Please enter your order ID and email.";
        return;
    }

    const searchButton =
        document.getElementById("searchOrderButton");

    searchButton.disabled = true;
    searchButton.textContent = "Searching...";

    resultBox.textContent = "";

    try {

        const response = await fetch(
            `/api/orders/${encodeURIComponent(orderId)}?email=${encodeURIComponent(email)}`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Order not found.");
        }

        const order = result.order;

        const itemsHTML = result.items.map(item => `
            <div class="history-item">

                <img
                    src="${item.image_url || ''}"
                    alt="${item.name}"
                    onerror="this.style.display='none'"
                >

                <div>
                    <strong>${item.name}</strong>
                    <p>Quantity: ${item.quantity}</p>
                    <p>Price: ${formatPrice(item.price)}</p>
                </div>

                <strong>
                    ${formatPrice(item.item_total)}
                </strong>

            </div>
        `).join("");

        const safeDate = new Date(order.created_at).toLocaleString();

        resultBox.innerHTML = `
            <div class="history-card">

                <h3>Order #${order.id}</h3>

                <p><strong>Customer:</strong> ${escapeHTML(order.customer_name)}</p>

                <p><strong>Email:</strong> ${escapeHTML(order.email)}</p>

                <p><strong>Delivery Address:</strong> ${escapeHTML(order.delivery_address)}</p>

                <p><strong>Order Date:</strong> ${safeDate}</p>

                <p><strong>Status:</strong> ${escapeHTML(order.status || "Pending")}</p>

                <h3>Purchased Products</h3>

                ${itemsHTML}

                <h3 class="history-total">
                    Total: ${formatPrice(order.total_amount)}
                </h3>

            </div>
        `;

    } catch (error) {

        resultBox.textContent = error.message;

    } finally {

        searchButton.disabled = false;
        searchButton.textContent = "Find My Order";

    }

});

// Escape customer-provided text before displaying it as HTML
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// ORDER HISTORY FEATURE

document.getElementById("searchOrderButton").addEventListener("click", async () => {

    const orderId =
        document.getElementById("historyOrderId").value.trim();

    const email =
        document.getElementById("historyEmail").value.trim();

    const resultBox =
        document.getElementById("orderHistoryResult");

    // Validate inputs
    if (!orderId || !email) {
        resultBox.textContent =
            "Please enter your order ID and email address.";
        return;
    }

    const searchButton =
        document.getElementById("searchOrderButton");

    searchButton.disabled = true;
    searchButton.textContent = "Searching...";

    resultBox.textContent = "";

    try {

        // Request order details from Node.js backend
        const response = await fetch(
            `/api/orders/${encodeURIComponent(orderId)}?email=${encodeURIComponent(email)}`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Order not found."
            );
        }

        const order = result.order;

        // Display purchased products
        const itemsHTML = result.items.map(item => `
            <div class="history-item">

                <img
                    src="${escapeHTML(item.image_url || '')}"
                    alt="${escapeHTML(item.name)}"
                    onerror="this.style.display='none'"
                >

                <div>
                    <strong>${escapeHTML(item.name)}</strong>
                    <p>Quantity: ${Number(item.quantity)}</p>
                    <p>Price: ${formatPrice(item.price)}</p>
                </div>

                <strong>
                    ${formatPrice(item.item_total)}
                </strong>

            </div>
        `).join("");

        // Display order information
        resultBox.innerHTML = `
            <div class="history-card">

                <h3>Order #${Number(order.id)}</h3>

                <p>
                    <strong>Customer:</strong>
                    ${escapeHTML(order.customer_name)}
                </p>

                <p>
                    <strong>Email:</strong>
                    ${escapeHTML(order.email)}
                </p>

                <p>
                    <strong>Delivery Address:</strong>
                    ${escapeHTML(order.delivery_address)}
                </p>

                <p>
                    <strong>Order Date:</strong>
                    ${new Date(order.created_at).toLocaleString()}
                </p>

                <p>
                    <strong>Status:</strong>
                    ${escapeHTML(order.status || "Pending")}
                </p>

                <h3>Purchased Products</h3>

                ${itemsHTML}

                <h3 class="history-total">
                    Total: ${formatPrice(order.total_amount)}
                </h3>

            </div>
        `;

    } catch (error) {

        resultBox.textContent = error.message;
        console.error("Order history error:", error);

    } finally {

        searchButton.disabled = false;
        searchButton.textContent = "Find My Order";

    }

});

// Safely display database text
function escapeHTML(value) {

    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);

}
// Load products when website starts

// Load logged-in customer details
async function loadLoggedInCustomer() {

    try {

        const response = await fetch("/api/customers/me");

        // Guest customer: leave checkout fields editable
        if (!response.ok) {
            return;
        }

        const result = await response.json();

        const customer = result.customer;

        if (!customer) return;

        // Automatically fill customer information
        const nameInput =
            document.getElementById("customerName");

        const emailInput =
            document.getElementById("customerEmail");

        nameInput.value = customer.full_name;
        emailInput.value = customer.email;

        // Prevent accidental changes to account details
        nameInput.readOnly = true;
        emailInput.readOnly = true;

        console.log("Customer details loaded:", customer.full_name);

    } catch (error) {

        console.error("Could not load customer details:", error);

    }
}

// UPDATE CUSTOMER NAVIGATION
async function updateCustomerNavigation() {

    const loginLink =
        document.getElementById("customerLoginLink");

    const registerLink =
        document.getElementById("customerRegisterLink");

    const accountLink =
        document.getElementById("customerAccountLink");

    const logoutLink =
        document.getElementById("customerLogoutLink");

    try {

        const response = await fetch("/api/customers/me");

        const loggedIn = response.ok;

        loginLink.hidden = loggedIn;
        registerLink.hidden = loggedIn;

        accountLink.hidden = !loggedIn;
        logoutLink.hidden = !loggedIn;

    } catch (error) {

        console.error("Navigation error:", error);

        loginLink.hidden = false;
        registerLink.hidden = false;

        accountLink.hidden = true;
        logoutLink.hidden = true;
    }
}

// CUSTOMER LOGOUT FROM STOREFRONT
document.getElementById("customerLogoutLink").addEventListener("click", async event => {

    event.preventDefault();

    try {

        const response = await fetch("/api/customers/logout", {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error("Could not log out.");
        }

        window.location.reload();

    } catch (error) {

        alert(error.message);

    }

});
// Load products and customer information
loadProducts();
loadLoggedInCustomer();
updateCustomerNavigation();
