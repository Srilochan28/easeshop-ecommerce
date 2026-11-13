
// ShopEase Customer Login

const loginForm =
    document.getElementById("customerLoginForm");

const loginMessage =
    document.getElementById("customerLoginMessage");

const loginButton =
    document.getElementById("customerLoginButton");

loginForm.addEventListener("submit", async event => {

    event.preventDefault();

    const email =
        document.getElementById("customerEmail").value.trim();

    const password =
        document.getElementById("customerPassword").value;

    if (!email || !password) {

        loginMessage.textContent =
            "Please enter your email and password.";

        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    loginMessage.textContent = "";

    try {

        const response = await fetch("/api/customers/login", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                email: email,
                password: password
            })

        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Login failed."
            );
        }

        loginMessage.textContent =
            "Login successful! Welcome, " + result.name + "!";

        loginMessage.style.color = "green";

        // Redirect to the ShopEase storefront
        setTimeout(() => {
            window.location.replace("/account.html");
        }, 1200);

    } catch (error) {

        loginMessage.textContent = error.message;
        loginMessage.style.color = "red";

        document.getElementById("customerPassword").value = "";

    } finally {

        loginButton.disabled = false;
        loginButton.textContent = "Login";

    }

});
