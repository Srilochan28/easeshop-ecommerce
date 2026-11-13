
// ShopEase Admin Login

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");

// Check whether admin is already logged in
async function checkAdminSession() {

    try {

        const response = await fetch("/api/admin/me");

        if (response.ok) {
            window.location.replace("/admin.html");
        }

    } catch (error) {

        loginMessage.textContent =
            "Could not connect to the server.";

    }
}

// Handle login
loginForm.addEventListener("submit", async event => {

    event.preventDefault();

    const username =
        document.getElementById("username").value.trim();

    const password =
        document.getElementById("password").value;

    if (!username || !password) {

        loginMessage.textContent =
            "Please enter username and password.";

        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    loginMessage.textContent = "";

    try {

        const response = await fetch("/api/admin/login", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                username,
                password
            })

        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Login failed."
            );
        }

        loginMessage.textContent =
            "Login successful! Redirecting...";

        window.location.replace("/admin.html");

    } catch (error) {

        loginMessage.textContent = error.message;

        document.getElementById("password").value = "";

    } finally {

        loginButton.disabled = false;
        loginButton.textContent = "Login";

    }

});

// Check existing session when page opens
checkAdminSession();
