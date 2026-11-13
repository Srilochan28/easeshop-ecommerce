
const accountMessage =
    document.getElementById("accountMessage");

const customerOrders =
    document.getElementById("customerOrders");

// Format prices
function formatPrice(amount) {
    return "₹" + Number(amount).toLocaleString("en-IN");
}

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

// Read API responses safely
async function readJSON(response) {
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
        throw new Error("Unexpected server response. Please check the API.");
    }

    return response.json();
}

// Load customer profile and orders
async function loadCustomerAccount() {

    try {

        const [profileResponse, ordersResponse] = await Promise.all([
            fetch("/api/customers/me"),
            fetch("/api/customers/orders")
        ]);

        if (
            profileResponse.status === 401 ||
            ordersResponse.status === 401
        ) {
            window.location.replace("/customer-login.html");
            return;
        }

        const profileData = await readJSON(profileResponse);
        const orders = await readJSON(ordersResponse);

        if (!profileResponse.ok) {
            throw new Error(
                profileData.error || "Could not load your profile."
            );
        }

        if (!ordersResponse.ok) {
            throw new Error(
                orders.error || "Could not load your orders."
            );
        }

        const customer = profileData.customer;

        document.getElementById("customerName").textContent =
            customer.full_name;

        document.getElementById("customerEmail").textContent =
            customer.email;

        document.getElementById("customerId").textContent =
            customer.id;

        displayCustomerOrders(orders, customer.email);

    } catch (error) {

        accountMessage.textContent = error.message;

        customerOrders.innerHTML =
            '<p class="empty-message">Unable to load orders.</p>';

        console.error(error);
    }
}

// Display previous customer orders
function displayCustomerOrders(orders) {

    if (!Array.isArray(orders) || orders.length === 0) {

        customerOrders.innerHTML =
            '<p class="empty-message">You have not placed any orders yet.</p>';

        return;
    }

    customerOrders.innerHTML = orders.map(order => {

        const date = new Date(order.created_at).toLocaleString();

        return `
            <div class="order-card">

                <div class="order-header">

                    <h3>Order #${Number(order.id)}</h3>

                    <span class="status">
                        ${escapeHTML(order.status || "Pending")}
                    </span>

                </div>

                <p>
                    <strong>Order Date:</strong>
                    ${escapeHTML(date)}
                </p>

                <p>
                    <strong>Total Items:</strong>
                    ${Number(order.totalItems)}
                </p>

                <p>
                    <strong>Total Amount:</strong>
                    ${formatPrice(order.total_amount)}
                </p>

                <button data-view-order="${Number(order.id)}">
                    View Order Details
                </button>

                <div
                    id="orderDetails-${Number(order.id)}"
                    class="order-details"
                    hidden
                ></div>

            </div>
        `;

    }).join("");
}

// View individual order details
document.addEventListener("click", async event => {

    const button = event.target.closest("[data-view-order]");

    if (!button) return;

    const orderId = Number(button.dataset.viewOrder);

    const detailsBox =
        document.getElementById("orderDetails-" + orderId);

    if (!detailsBox) return;

    if (!detailsBox.hidden) {
        detailsBox.hidden = true;
        button.textContent = "View Order Details";
        return;
    }

    detailsBox.hidden = false;
    detailsBox.textContent = "Loading order details...";

    button.textContent = "Hide Order Details";

    try {

        // Retrieve verified customer email from account profile
        const profileResponse = await fetch("/api/customers/me");

        if (!profileResponse.ok) {
            window.location.replace("/customer-login.html");
            return;
        }

        const profileData = await readJSON(profileResponse);
        const email = profileData.customer.email;

        const response = await fetch(
            `/api/orders/${orderId}?email=${encodeURIComponent(email)}`
        );

        const result = await readJSON(response);

        if (!response.ok) {
            throw new Error(result.error || "Could not load order.");
        }

        detailsBox.innerHTML = result.items.map(item => `
            <p>
                <strong>${escapeHTML(item.name)}</strong>
                — Quantity: ${Number(item.quantity)}
                — ${formatPrice(item.price)}
            </p>
        `).join("");

    } catch (error) {

        detailsBox.textContent = error.message;
    }

});

// Customer logout
document.getElementById("logoutButton").addEventListener("click", async () => {

    const logoutButton =
        document.getElementById("logoutButton");

    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";

    try {

        const response = await fetch("/api/customers/logout", {
            method: "POST"
        });

        const result = await readJSON(response);

        if (!response.ok) {
            throw new Error(result.error || "Logout failed.");
        }

        window.location.replace("/customer-login.html");

    } catch (error) {

        accountMessage.textContent = error.message;

        logoutButton.disabled = false;
        logoutButton.textContent = "Logout";
    }

});

// Start account page
loadCustomerAccount();
