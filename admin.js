
// ShopEase Admin Dashboard JavaScript

const adminMessage = document.getElementById("adminMessage");

let adminProducts = [];

// Format prices
function formatPrice(amount) {
    return "₹" + Number(amount).toLocaleString("en-IN");
}

// Safely display text from the database
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// Display messages
function showMessage(message) {
    adminMessage.textContent = message;
    adminMessage.style.display = "block";
}

// API helper
async function apiRequest(url, options = {}) {

    const response = await fetch(url, options);

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "Something went wrong.");
    }

    return result;
}

// Load dashboard summary
async function loadSummary() {

    try {

        const summary = await apiRequest("/api/admin/summary");

        document.getElementById("totalProducts").textContent =
            summary.totalProducts;

        document.getElementById("totalOrders").textContent =
            summary.totalOrders;

        document.getElementById("totalRevenue").textContent =
            formatPrice(summary.totalRevenue);

        document.getElementById("pendingOrders").textContent =
            summary.pendingOrders;

    } catch (error) {

        showMessage("Dashboard error: " + error.message);
    }
}

// Load products
async function loadAdminProducts() {

    const tableBody =
        document.getElementById("adminProductsBody");

    try {

        adminProducts = await apiRequest("/api/products");

        if (adminProducts.length === 0) {

            tableBody.innerHTML =
                '<tr><td colspan="5">No products available.</td></tr>';

            return;
        }

        tableBody.innerHTML = adminProducts.map(product => `

            <tr>
                <td>${Number(product.id)}</td>

                <td>${escapeHTML(product.name)}</td>

                <td>${formatPrice(product.price)}</td>

                <td>${Number(product.stock)}</td>

                <td>
                    <button
                        class="admin-button edit-button"
                        data-edit-product="${Number(product.id)}"
                    >
                        Edit
                    </button>

                    <button
                        class="admin-button delete-button"
                        data-delete-product="${Number(product.id)}"
                    >
                        Delete
                    </button>
                </td>
            </tr>

        `).join("");

    } catch (error) {

        tableBody.innerHTML =
            '<tr><td colspan="5">Unable to load products.</td></tr>';

        showMessage(error.message);
    }
}

// Load customer orders
async function loadAdminOrders() {

    const tableBody =
        document.getElementById("adminOrdersBody");

    try {

        const orders = await apiRequest("/api/admin/orders");

        if (orders.length === 0) {

            tableBody.innerHTML =
                '<tr><td colspan="7">No orders available.</td></tr>';

            return;
        }

        const allowedStatuses = [
            "Pending",
            "Processing",
            "Shipped",
            "Delivered",
            "Cancelled"
        ];

        tableBody.innerHTML = orders.map(order => {

            const currentStatus =
                allowedStatuses.includes(order.status)
                    ? order.status
                    : "Pending";

            const statusOptions = allowedStatuses.map(status => `
                <option
                    value="${status}"
                    ${status === currentStatus ? "selected" : ""}
                >
                    ${status}
                </option>
            `).join("");

            return `
                <tr>

                    <td>#${Number(order.id)}</td>

                    <td>
                        ${escapeHTML(order.customer_name)}
                        <br>
                        <small>${escapeHTML(order.email)}</small>
                    </td>

                    <td>${formatPrice(order.total_amount)}</td>

                    <td>${Number(order.totalItems)}</td>

                    <td>
                        ${new Date(order.created_at).toLocaleDateString()}
                    </td>

                    <td>
                        <select
                            class="status-select"
                            id="status-${Number(order.id)}"
                        >
                            ${statusOptions}
                        </select>
                    </td>

                    <td>
                        <button
                            class="admin-button"
                            data-update-order="${Number(order.id)}"
                        >
                            Update
                        </button>
                    </td>

                </tr>
            `;

        }).join("");

    } catch (error) {

        tableBody.innerHTML =
            '<tr><td colspan="7">Unable to load orders.</td></tr>';

        showMessage(error.message);
    }
}

// Reset product form
function resetProductForm() {

    document.getElementById("productForm").reset();

    document.getElementById("productId").value = "";

    document.getElementById("productFormTitle").textContent =
        "Add New Product";

    document.getElementById("saveProductButton").textContent =
        "Add Product";

    document.getElementById("cancelEditButton").hidden = true;
}

// Add or edit product
document.getElementById("productForm").addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        const productId =
            document.getElementById("productId").value;

        const productData = {

            name: document.getElementById("productName").value.trim(),

            description:
                document.getElementById("productDescription").value.trim(),

            price:
                Number(document.getElementById("productPrice").value),

            image_url:
                document.getElementById("productImage").value.trim(),

            stock:
                Number(document.getElementById("productStock").value)

        };

        const saveButton =
            document.getElementById("saveProductButton");

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {

            if (productId) {

                await apiRequest(
                    `/api/admin/products/${productId}`,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(productData)
                    }
                );

                showMessage("Product updated successfully!");

            } else {

                await apiRequest(
                    "/api/admin/products",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(productData)
                    }
                );

                showMessage("New product added successfully!");
            }

            resetProductForm();

            await Promise.all([
                loadAdminProducts(),
                loadSummary()
            ]);

        } catch (error) {

            showMessage(error.message);

        } finally {

            saveButton.disabled = false;

            if (!document.getElementById("productId").value) {
                saveButton.textContent = "Add Product";
            }
        }
    }
);

// Cancel product editing
document.getElementById("cancelEditButton").addEventListener(
    "click",
    resetProductForm
);

// Handle product and order buttons
document.addEventListener("click", async event => {

    const button = event.target.closest("button");

    if (!button) return;

    // Edit product
    if (button.dataset.editProduct) {

        const productId = Number(button.dataset.editProduct);

        const product = adminProducts.find(
            item => Number(item.id) === productId
        );

        if (!product) return;

        document.getElementById("productId").value = product.id;
        document.getElementById("productName").value = product.name;
        document.getElementById("productDescription").value =
            product.description || "";
        document.getElementById("productPrice").value = product.price;
        document.getElementById("productImage").value =
            product.image_url || "";
        document.getElementById("productStock").value = product.stock;

        document.getElementById("productFormTitle").textContent =
            "Edit Product #" + product.id;

        document.getElementById("saveProductButton").textContent =
            "Save Changes";

        document.getElementById("cancelEditButton").hidden = false;

        document.getElementById("productForm").scrollIntoView({
            behavior: "smooth"
        });
    }

    // Delete product
    if (button.dataset.deleteProduct) {

        const productId = Number(button.dataset.deleteProduct);

        const confirmed = confirm(
            "Are you sure you want to delete product #" +
            productId + "?"
        );

        if (!confirmed) return;

        button.disabled = true;

        try {

            await apiRequest(
                `/api/admin/products/${productId}`,
                {
                    method: "DELETE"
                }
            );

            showMessage("Product deleted successfully!");

            await Promise.all([
                loadAdminProducts(),
                loadSummary()
            ]);

        } catch (error) {

            showMessage(error.message);

        } finally {

            button.disabled = false;
        }
    }

    // Update order status
    if (button.dataset.updateOrder) {

        const orderId = Number(button.dataset.updateOrder);

        const statusSelect =
            document.getElementById("status-" + orderId);

        const status = statusSelect.value;

        button.disabled = true;
        button.textContent = "Updating...";

        try {

            await apiRequest(
                `/api/admin/orders/${orderId}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ status })
                }
            );

            showMessage(
                "Order #" + orderId +
                " status updated to " + status + "."
            );

            await Promise.all([
                loadAdminOrders(),
                loadSummary()
            ]);

        } catch (error) {

            showMessage(error.message);

        } finally {

            button.disabled = false;
            button.textContent = "Update";
        }
    }
});

// Load dashboard when page opens
async function startAdminDashboard() {

    await Promise.all([
        loadSummary(),
        loadAdminProducts(),
        loadAdminOrders()
    ]);

}

startAdminDashboard();
// ADMIN LOGOUT
document.getElementById("logoutButton").addEventListener("click", async () => {

    try {
        const response = await fetch("/api/admin/logout", {
            method: "POST"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Logout failed.");
        }

        window.location.replace("/admin-login.html");

    } catch (error) {
        showMessage(error.message);
    }

});