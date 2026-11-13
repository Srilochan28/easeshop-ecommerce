
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "100kb" }));

// Admin session configuration
app.use(session({
    name: "shopease.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 2 * 60 * 60 * 1000
    }
}));

// MySQL configuration
const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "ecommerce_db"
};

// MySQL connection pool
const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Connect to database
async function connectDB() {
    await pool.query("SELECT 1");
    console.log("Connected to MySQL database!");
}

// Home API
app.get("/api", (req, res) => {
    res.json({
        message: "ShopEase backend is working!"
    });
});

// GET ALL PRODUCTS
app.get("/api/products", async (req, res) => {
    try {
        const [products] = await pool.execute(
            "SELECT * FROM products ORDER BY id"
        );

        res.json(products);

    } catch (error) {
        console.error(error.message);

        res.status(500).json({
            error: "Could not fetch products"
        });
    }
});

// REAL CHECKOUT API
app.post("/api/orders", async (req, res) => {

   
// Get checkout information
const { delivery_address, items } = req.body;

let customer_name =
    typeof req.body.customer_name === "string"
        ? req.body.customer_name.trim()
        : "";

let email =
    typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

const address =
    typeof delivery_address === "string"
        ? delivery_address.trim()
        : "";

// If customer is logged in, use their saved account details
if (req.session && req.session.customerId) {

    try {

        const [customers] = await pool.execute(
            `SELECT full_name, email
             FROM customers
             WHERE id = ?
             LIMIT 1`,
            [req.session.customerId]
        );

        if (customers.length === 0) {
            return res.status(401).json({
                error: "Customer account not found. Please log in again."
            });
        }

        // Use verified details from MySQL
        customer_name = customers[0].full_name;
        email = customers[0].email;

    } catch (error) {

        console.error("Customer lookup error:", error.message);

        return res.status(500).json({
            error: "Could not verify customer account."
        });
    }
}

// Validate checkout information
if (
    !customer_name ||
    customer_name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 150 ||
    !address ||
    address.length > 255 ||
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 100
) {
    return res.status(400).json({
        error: "Please provide valid customer details and order items."
    });
}


    const quantities = new Map();

    for (const item of items) {

        const productId = Number(item.product_id);
        const quantity = Number(item.quantity);

        if (
            !Number.isSafeInteger(productId) ||
            productId <= 0 ||
            !Number.isSafeInteger(quantity) ||
            quantity <= 0
        ) {
            return res.status(400).json({
                error: "Invalid product ID or quantity."
            });
        }

        const newQuantity =
            (quantities.get(productId) || 0) + quantity;

        if (newQuantity > 1000) {
            return res.status(400).json({
                error: "Requested quantity is too large."
            });
        }

        quantities.set(productId, newQuantity);
    }

    let connection;
    let transactionStarted = false;

    try {

        connection = await pool.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        const orderProducts = [];
        let totalPaise = 0;

        for (const [productId, quantity] of quantities) {

            const [rows] = await connection.execute(
                `SELECT id, name, price, stock
                 FROM products
                 WHERE id = ?
                 FOR UPDATE`,
                [productId]
            );

            if (rows.length === 0) {
                throw new Error("PRODUCT_NOT_FOUND");
            }

            const product = rows[0];
            const availableStock = Number(product.stock);

            if (
                !Number.isSafeInteger(availableStock) ||
                availableStock < quantity
            ) {
                throw new Error("INSUFFICIENT_STOCK:" + product.name);
            }

            const pricePaise = Math.round(Number(product.price) * 100);

            if (!Number.isSafeInteger(pricePaise) || pricePaise < 0) {
                throw new Error("INVALID_PRODUCT_PRICE");
            }

            totalPaise += pricePaise * quantity;

            if (!Number.isSafeInteger(totalPaise)) {
                throw new Error("INVALID_ORDER_TOTAL");
            }

            orderProducts.push({
                id: product.id,
                quantity,
                price: (pricePaise / 100).toFixed(2)
            });
        }

        const totalAmount = (totalPaise / 100).toFixed(2);

        const [orderResult] = await connection.execute(
            `INSERT INTO orders
             (customer_name, email, delivery_address, total_amount, status)
             VALUES (?, ?, ?, ?, ?)`,
            [
                customer_name.trim(),
                email.trim(),
                delivery_address.trim(),
                totalAmount,
                "Pending"
            ]
        );

        const orderId = orderResult.insertId;

        for (const item of orderProducts) {

            await connection.execute(
                `INSERT INTO order_items
                 (order_id, product_id, quantity, price)
                 VALUES (?, ?, ?, ?)`,
                [
                    orderId,
                    item.id,
                    item.quantity,
                    item.price
                ]
            );

            await connection.execute(
                `UPDATE products
                 SET stock = stock - ?
                 WHERE id = ?`,
                [item.quantity, item.id]
            );
        }

        await connection.commit();
        transactionStarted = false;

        res.status(201).json({
            message: "Order placed successfully!",
            orderId,
            totalAmount,
            status: "Pending"
        });

    } catch (error) {

        if (connection && transactionStarted) {
            await connection.rollback();
        }

        console.error("Order error:", error.message);

        if (error.message === "PRODUCT_NOT_FOUND") {
            return res.status(404).json({
                error: "One of the selected products does not exist."
            });
        }

        if (error.message.startsWith("INSUFFICIENT_STOCK:")) {
            return res.status(409).json({
                error: "Not enough stock for " +
                    error.message.split(":")[1]
            });
        }

        res.status(500).json({
            error: "Could not place your order."
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
});

// GET ORDER HISTORY
app.get("/api/orders/:id", async (req, res) => {

    const orderId = Number(req.params.id);
    const email = req.query.email;

    if (
        !Number.isSafeInteger(orderId) ||
        orderId <= 0 ||
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
        return res.status(400).json({
            error: "Please provide a valid order ID and email."
        });
    }

    try {

        const [orders] = await pool.execute(
            `SELECT
                id,
                customer_name,
                email,
                delivery_address,
                total_amount,
                status,
                created_at
             FROM orders
             WHERE id = ?
             AND LOWER(email) = LOWER(?)
             LIMIT 1`,
            [orderId, email.trim()]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                error: "No order found. Please check your order ID and email."
            });
        }

        const [items] = await pool.execute(
            `SELECT
                oi.product_id,
                p.name,
                p.image_url,
                oi.quantity,
                oi.price,
                (oi.quantity * oi.price) AS item_total
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?`,
            [orderId]
        );

        res.json({
            order: orders[0],
            items
        });

    } catch (error) {

        console.error("Order history error:", error.message);

        res.status(500).json({
            error: "Could not retrieve order history."
        });
    }
});


// CHECK ADMIN AUTHENTICATION
function requireAdmin(req, res, next) {

    if (!req.session || !req.session.adminId) {
        return res.status(401).json({
            error: "Please log in as administrator."
        });
    }

    next();
}


// ADMIN LOGIN
app.post("/api/admin/login", async (req, res) => {

    const { username, password } = req.body;

    if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        !username.trim() ||
        !password ||
        username.length > 100 ||
        password.length > 128
    ) {
        return res.status(400).json({
            error: "Enter a valid username and password."
        });
    }

    try {

        const [rows] = await pool.execute(
            `SELECT id, username, password_hash
             FROM admin_users
             WHERE username = ?`,
            [username.trim()]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: "Invalid username or password."
            });
        }

        const admin = rows[0];

        const passwordMatches = await bcrypt.compare(
            password,
            admin.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                error: "Invalid username or password."
            });
        }

        // Create a fresh session after successful login
        req.session.regenerate(error => {

            if (error) {
                console.error(error);

                return res.status(500).json({
                    error: "Could not create login session."
                });
            }

            req.session.adminId = admin.id;
            req.session.adminUsername = admin.username;

            req.session.save(error => {

                if (error) {
                    console.error(error);

                    return res.status(500).json({
                        error: "Could not save login session."
                    });
                }

                res.json({
                    message: "Admin login successful!",
                    username: admin.username
                });

            });
        });

    } catch (error) {

        console.error("Login error:", error.message);

        res.status(500).json({
            error: "Login failed. Please try again."
        });
    }
});


// CHECK ADMIN LOGIN STATUS
app.get("/api/admin/me", (req, res) => {

    if (!req.session.adminId) {
        return res.status(401).json({
            loggedIn: false
        });
    }

    res.json({
        loggedIn: true,
        username: req.session.adminUsername
    });
});


// ADMIN LOGOUT
app.post("/api/admin/logout", (req, res) => {

    req.session.destroy(error => {

        if (error) {
            return res.status(500).json({
                error: "Could not log out."
            });
        }

        res.clearCookie("shopease.sid");

        res.json({
            message: "Logged out successfully!"
        });
    });
});

// ======================================
// CUSTOMER REGISTRATION API
// ======================================

app.post("/api/customers/register", async (req, res) => {

    const { full_name, email, password } = req.body;

    // Validate customer information
    if (
        typeof full_name !== "string" ||
        !full_name.trim() ||
        full_name.trim().length > 100 ||
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        email.trim().length > 150 ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
    ) {
        return res.status(400).json({
            error: "Enter a valid name, email, and password of at least 8 characters."
        });
    }

    try {

        // Hash customer password
        const passwordHash = await bcrypt.hash(password, 12);

        // Save customer in MySQL
        const [result] = await pool.execute(
            `INSERT INTO customers
             (full_name, email, password_hash)
             VALUES (?, ?, ?)`,
            [
                full_name.trim(),
                email.trim().toLowerCase(),
                passwordHash
            ]
        );

        res.status(201).json({
            message: "Registration successful!",
            customerId: result.insertId
        });

    } catch (error) {

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "An account with this email already exists."
            });
        }

        console.error("Registration error:", error.message);

        res.status(500).json({
            error: "Could not register customer."
        });
    }
});

// ======================================
// CUSTOMER LOGIN API
// ======================================

app.post("/api/customers/login", async (req, res) => {

    const { email, password } = req.body;

    // Validate login details
    if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        email.trim().length > 150 ||
        typeof password !== "string" ||
        !password ||
        password.length > 128
    ) {
        return res.status(400).json({
            error: "Please enter a valid email and password."
        });
    }

    try {

        // Find customer in MySQL
        const [rows] = await pool.execute(
            `SELECT id, full_name, email, password_hash
             FROM customers
             WHERE email = ?`,
            [email.trim().toLowerCase()]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        const customer = rows[0];

        // Compare entered password with stored hash
        const passwordMatches = await bcrypt.compare(
            password,
            customer.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        // Create a new session after successful login
        req.session.regenerate(error => {

            if (error) {
                console.error(error);

                return res.status(500).json({
                    error: "Could not create customer session."
                });
            }

            req.session.customerId = customer.id;
            req.session.customerName = customer.full_name;

            req.session.save(error => {

                if (error) {
                    console.error(error);

                    return res.status(500).json({
                        error: "Could not save customer session."
                    });
                }

                res.json({
                    message: "Customer login successful!",
                    customerId: customer.id,
                    name: customer.full_name
                });

            });
        });

    } catch (error) {

        console.error("Customer login error:", error.message);

        res.status(500).json({
            error: "Login failed. Please try again."
        });
    }
});

// ======================================
// CUSTOMER ACCOUNT APIs
// ======================================

// Protect customer account routes
function requireCustomer(req, res, next) {

    if (!req.session || !req.session.customerId) {
        return res.status(401).json({
            error: "Please log in to access your account."
        });
    }

    next();
}


// GET CUSTOMER PROFILE
app.get("/api/customers/me", requireCustomer, async (req, res) => {

    try {

        const [customers] = await pool.execute(
            `SELECT id, full_name, email, created_at
             FROM customers
             WHERE id = ?
             LIMIT 1`,
            [req.session.customerId]
        );

        if (customers.length === 0) {
            return res.status(404).json({
                error: "Customer account not found."
            });
        }

        res.json({
            customer: customers[0]
        });

    } catch (error) {

        console.error("Customer profile error:", error.message);

        res.status(500).json({
            error: "Could not load customer profile."
        });
    }
});


// GET LOGGED-IN CUSTOMER'S ORDER HISTORY
app.get("/api/customers/orders", requireCustomer, async (req, res) => {

    try {

        const [orders] = await pool.execute(
            `SELECT
                o.id,
                o.customer_name,
                o.total_amount,
                o.status,
                o.created_at,
                COUNT(oi.id) AS totalItems
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             WHERE LOWER(o.email) = (
                 SELECT LOWER(email)
                 FROM customers
                 WHERE id = ?
             )
             GROUP BY
                o.id,
                o.customer_name,
                o.total_amount,
                o.status,
                o.created_at
             ORDER BY o.created_at DESC`,
            [req.session.customerId]
        );

        res.json(orders);

    } catch (error) {

        console.error("Customer orders error:", error.message);

        res.status(500).json({
            error: "Could not retrieve your orders."
        });
    }
});

// ======================================
// CUSTOMER LOGOUT API
// ======================================

app.post("/api/customers/logout", (req, res) => {

    // Remove customer login information
    if (req.session) {
        delete req.session.customerId;
        delete req.session.customerName;
    }

    // Save the updated session
    req.session.save(error => {

        if (error) {
            console.error("Customer logout error:", error);

            return res.status(500).json({
                error: "Could not log out."
            });
        }

        res.json({
            message: "Customer logged out successfully!"
        });

    });

});

// ======================================
// ADMIN DASHBOARD APIs
// ======================================


// 1. DASHBOARD SUMMARY
app.get("/api/admin/summary", requireAdmin, async (req, res) => {

    try {

        const [productRows] = await pool.execute(
            "SELECT COUNT(*) AS totalProducts FROM products"
        );

        const [orderRows] = await pool.execute(
            "SELECT COUNT(*) AS totalOrders FROM orders"
        );

        const [revenueRows] = await pool.execute(
            "SELECT COALESCE(SUM(total_amount), 0) AS totalRevenue FROM orders"
        );

        const [pendingRows] = await pool.execute(
            "SELECT COUNT(*) AS pendingOrders FROM orders WHERE status = 'Pending'"
        );

        res.json({
            totalProducts: Number(productRows[0].totalProducts),
            totalOrders: Number(orderRows[0].totalOrders),
            totalRevenue: Number(revenueRows[0].totalRevenue),
            pendingOrders: Number(pendingRows[0].pendingOrders)
        });

    } catch (error) {

        console.error("Dashboard error:", error.message);

        res.status(500).json({
            error: "Could not load dashboard summary."
        });
    }
});


// 2. VIEW ALL ORDERS
app.get("/api/admin/orders", requireAdmin, async (req, res) => {

    try {

        const [orders] = await pool.execute(
            `SELECT
                o.id,
                o.customer_name,
                o.email,
                o.delivery_address,
                o.total_amount,
                o.status,
                o.created_at,
                COUNT(oi.id) AS totalItems
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             GROUP BY
                o.id,
                o.customer_name,
                o.email,
                o.delivery_address,
                o.total_amount,
                o.status,
                o.created_at
             ORDER BY o.created_at DESC`
        );

        res.json(orders);

    } catch (error) {

        console.error("Admin orders error:", error.message);

        res.status(500).json({
            error: "Could not load orders."
        });
    }
});


// 3. UPDATE ORDER STATUS
app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {

    const orderId = Number(req.params.id);
    const { status } = req.body;

    const allowedStatuses = [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled"
    ];

    if (
        !Number.isSafeInteger(orderId) ||
        orderId <= 0 ||
        !allowedStatuses.includes(status)
    ) {
        return res.status(400).json({
            error: "Invalid order ID or status."
        });
    }

    try {

        const [result] = await pool.execute(
            "UPDATE orders SET status = ? WHERE id = ?",
            [status, orderId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: "Order not found."
            });
        }

        res.json({
            message: "Order status updated successfully!",
            orderId,
            status
        });

    } catch (error) {

        console.error("Status update error:", error.message);

        res.status(500).json({
            error: "Could not update order status."
        });
    }
});


// 4. ADD NEW PRODUCT
app.post("/api/admin/products", requireAdmin, async (req, res) => {

    const {
        name,
        description,
        price,
        image_url,
        stock
    } = req.body;

    const productPrice = Number(price);
    const productStock = Number(stock);

    if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 100 ||
        !Number.isFinite(productPrice) ||
        productPrice < 0 ||
        productPrice > 99999999 ||
        !Number.isSafeInteger(productStock) ||
        productStock < 0 ||
        typeof description !== "string" ||
        typeof image_url !== "string"
    ) {
        return res.status(400).json({
            error: "Please provide valid product details."
        });
    }

    try {

        const [result] = await pool.execute(
            `INSERT INTO products
             (name, description, price, image_url, stock)
             VALUES (?, ?, ?, ?, ?)`,
            [
                name.trim(),
                description.trim(),
                productPrice.toFixed(2),
                image_url.trim() || null,
                productStock
            ]
        );

        res.status(201).json({
            message: "Product added successfully!",
            productId: result.insertId
        });

    } catch (error) {

        console.error("Add product error:", error.message);

        res.status(500).json({
            error: "Could not add product."
        });
    }
});


// 5. EDIT PRODUCT
app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {

    const productId = Number(req.params.id);

    const {
        name,
        description,
        price,
        image_url,
        stock
    } = req.body;

    const productPrice = Number(price);
    const productStock = Number(stock);

    if (
        !Number.isSafeInteger(productId) ||
        productId <= 0 ||
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 100 ||
        typeof description !== "string" ||
        typeof image_url !== "string" ||
        !Number.isFinite(productPrice) ||
        productPrice < 0 ||
        productPrice > 99999999 ||
        !Number.isSafeInteger(productStock) ||
        productStock < 0
    ) {
        return res.status(400).json({
            error: "Please provide valid product details."
        });
    }

    try {

        const [result] = await pool.execute(
            `UPDATE products
             SET name = ?,
                 description = ?,
                 price = ?,
                 image_url = ?,
                 stock = ?
             WHERE id = ?`,
            [
                name.trim(),
                description.trim(),
                productPrice.toFixed(2),
                image_url.trim() || null,
                productStock,
                productId
            ]
        );

        if (result.affectedRows === 0) {

            const [existing] = await pool.execute(
                "SELECT id FROM products WHERE id = ?",
                [productId]
            );

            if (existing.length === 0) {
                return res.status(404).json({
                    error: "Product not found."
                });
            }
        }

        res.json({
            message: "Product updated successfully!",
            productId
        });

    } catch (error) {

        console.error("Update product error:", error.message);

        res.status(500).json({
            error: "Could not update product."
        });
    }
});


// 6. DELETE PRODUCT
app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {

    const productId = Number(req.params.id);

    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({
            error: "Invalid product ID."
        });
    }

    try {

        // Never delete a product that belongs to an order
        const [usedProducts] = await pool.execute(
            "SELECT COUNT(*) AS total FROM order_items WHERE product_id = ?",
            [productId]
        );

        if (Number(usedProducts[0].total) > 0) {
            return res.status(409).json({
                error: "This product belongs to an existing order and cannot be deleted."
            });
        }

        const [result] = await pool.execute(
            "DELETE FROM products WHERE id = ?",
            [productId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: "Product not found."
            });
        }

        res.json({
            message: "Product deleted successfully!",
            productId
        });

    } catch (error) {

        console.error("Delete product error:", error.message);

        res.status(500).json({
            error: "Could not delete product."
        });
    }
});

// Protect Admin Dashboard page
app.get("/admin.html", (req, res) => {

    if (!req.session.adminId) {
        return res.redirect("/admin-login.html");
    }

    res.sendFile(path.join(__dirname, "admin.html"));
});

// Serve website files
// Protect Customer Account Page
app.get("/account.html", (req, res) => {

    if (!req.session.customerId) {
        return res.redirect("/customer-login.html");
    }

    res.sendFile(path.join(__dirname, "account.html"));
});
app.use(express.static(__dirname));
// START SERVER
async function startServer() {

    try {

        await connectDB();

        app.listen(PORT, () => {
            console.log(
                `ShopEase running at http://localhost:${PORT}`
            );
        });

    } catch (error) {

        console.error(
            "Could not connect to MySQL:",
            error.message
        );

        process.exit(1);
    }
}

startServer();
