
require("dotenv").config();

const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

async function createAdmin() {
    let connection;

    try {
        if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
            throw new Error("Admin username or password is missing from .env");
        }

        connection = await mysql.createConnection({
            host: process.env.DB_HOST || "localhost",
            user: process.env.DB_USER || "root",
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || "ecommerce_db"
        });

        const username = process.env.ADMIN_USERNAME.trim();
        const password = process.env.ADMIN_PASSWORD;

        const passwordHash = await bcrypt.hash(password, 12);

        await connection.execute(
            `INSERT INTO admin_users (username, password_hash)
             VALUES (?, ?)`,
            [username, passwordHash]
        );

        console.log("Admin account created successfully!");
        console.log("Username:", username);
        console.log("Your password has been securely hashed.");

    } catch (error) {
        console.error("Admin creation failed:", error.message);

    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

createAdmin();
